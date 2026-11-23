<template>
    <div class="visor3d" ref="contenedor">
        <!-- Respaldo si el navegador no soporta WebGL: la foto original -->
        <img v-if="sinWebgl" class="visor3d__respaldo" src="/imagenes/andres_login.png" alt="Persona usando gafas de realidad virtual NeuroAr">
        <canvas v-show="!sinWebgl" ref="lienzo" class="visor3d__canvas" role="img"
            aria-label="Gafas de realidad virtual NeuroAr en 3D. Arrástralas para girarlas y usa la rueda para acercarte."></canvas>
        <p v-if="!sinWebgl" class="visor3d__ayuda" :class="{ 'is-oculta': interactuo }">
            <v-icon size="16">mdi-gesture-swipe-horizontal</v-icon> Arrastra para girar
            <span class="visor3d__sep">·</span>
            <v-icon size="16">mdi-magnify-plus-outline</v-icon> Rueda para acercar
        </p>
    </div>
</template>

<script setup>
/* --------------------------------------------------------------------------
   Gafas de realidad virtual NeuroAr en 3D (three.js, modelo propio por código).
   · Al cargar, las gafas llegan desde lejos y se acercan.
   · Giran solas suavemente; la persona puede arrastrarlas para verlas por
     todos lados (por detrás se ven los lentes iluminados) y acercarse con la
     rueda o pellizcando.
   · Se pausa cuando no está en pantalla o la pestaña está oculta, respeta
     "reducir movimiento" y libera la memoria de la GPU al salir.
   -------------------------------------------------------------------------- */
import { onMounted, onBeforeUnmount, ref, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const contenedor = ref(null)
const lienzo = ref(null)
const interactuo = ref(false)
const sinWebgl = ref(false)

let renderer, scene, camera, controls, gafas, frameId = 0, observer, resizeObserver
let visible = true
const recursos = [] // geometrías, materiales y texturas para liberar al salir
const limpiezas = [] // oyentes y temporizadores para quitar al salir

const reducirMovimiento = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const registrar = (obj) => { recursos.push(obj); return obj }

/* Textura de los lentes: degradado radial cian → violeta con anillos */
function texturaLente() {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128)
    grad.addColorStop(0, '#e9fdff')
    grad.addColorStop(0.25, '#22d3ee')
    grad.addColorStop(0.7, '#7c5cf0')
    grad.addColorStop(1, '#1a1040')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    g.strokeStyle = 'rgba(255,255,255,0.18)'
    for (let r = 30; r < 128; r += 16) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke() }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return registrar(t)
}

/* Pieza lisa con forma de "píldora" (superelipsoide) a partir de una esfera
   muy subdividida, curvada hacia atrás en los lados para envolver la cara.
   a, b, c = semiejes (ancho, alto, profundidad); e < 1 = más cuadrada. */
function piezaCurva(a, b, c, { e = 0.55, curva = 0.18 } = {}) {
    const geo = new THREE.SphereGeometry(1, 160, 96)
    const pos = geo.attributes.position
    const v = new THREE.Vector3()
    const potencia = (n) => Math.sign(n) * Math.pow(Math.abs(n), e)
    for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i)
        const x = a * potencia(v.x)
        const y = b * potencia(v.y)
        let z = c * potencia(v.z)
        z -= curva * Math.pow(x / a, 2)
        pos.setXYZ(i, x, y, z)
    }
    geo.computeVertexNormals()
    return registrar(geo)
}

function tubo(puntos, radio, cerrado = false) {
    const curva = new THREE.CatmullRomCurve3(puntos.map(([x, y, z]) => new THREE.Vector3(x, y, z)), cerrado, 'centripetal')
    return registrar(new THREE.TubeGeometry(curva, 160, radio, 20, cerrado))
}

function construirGafas() {
    const grupo = new THREE.Group()

    // Materiales
    const blanco = registrar(new THREE.MeshPhysicalMaterial({
        color: 0xeef1f6, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35, sheen: 0.3,
    }))
    const blancoFrente = registrar(new THREE.MeshPhysicalMaterial({
        color: 0xfbfcfe, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08,
    }))
    const tela = registrar(new THREE.MeshStandardMaterial({ color: 0x1e2436, roughness: 0.95 }))
    const espumaMat = registrar(new THREE.MeshStandardMaterial({ color: 0x151a28, roughness: 1 }))
    const negro = registrar(new THREE.MeshPhysicalMaterial({ color: 0x05070d, roughness: 0.08, clearcoat: 1 }))
    const acentoCian = registrar(new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.4 }))

    // Cuerpo: contorno suave, frente curvo, bordes biselados
    const cuerpo = new THREE.Mesh(piezaCurva(0.9, 0.46, 0.29, { e: 0.66, curva: 0.26 }), blanco)
    grupo.add(cuerpo)

    // Placa frontal brillante, separada por una fina línea oscura
    const junta = new THREE.Mesh(piezaCurva(0.875, 0.44, 0.05, { e: 0.5, curva: 0.26 }), tela)
    junta.position.z = 0.22
    grupo.add(junta)
    const placa = new THREE.Mesh(piezaCurva(0.86, 0.43, 0.075, { e: 0.5, curva: 0.26 }), blancoFrente)
    placa.position.z = 0.25
    grupo.add(placa)

    // Frente: logo y sensores siguen la curva (z según la posición en x)
    const zFrente = (x) => 0.322 - 0.26 * Math.pow(x / 0.86, 2)

    new THREE.TextureLoader().load('/imagenes/neuroar.png', (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        if (renderer) tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
        registrar(tex)
        const logo = new THREE.Mesh(
            registrar(new THREE.PlaneGeometry(0.34, 0.32)),
            registrar(new THREE.MeshBasicMaterial({ map: tex, transparent: true })),
        )
        logo.position.set(0, 0.16, zFrente(0) + 0.004)
        grupo.add(logo)
    })

    const geoSensor = registrar(new THREE.CircleGeometry(0.048, 32))
    const geoAro = registrar(new THREE.RingGeometry(0.048, 0.064, 32))
    ;[-1, 1].forEach((lado) => {
        ;[[0.5, -0.04, 1], [0.4, -0.17, 0.85], [0.56, -0.19, 0.85]].forEach(([x, y, k]) => {
            const px = lado * x
            const angulo = Math.atan(0.52 * px / (0.86 * 0.86)) // inclina el sensor con la curva
            const sensor = new THREE.Mesh(geoSensor, negro)
            sensor.position.set(px, y, zFrente(px) + 0.003)
            sensor.rotation.y = angulo
            sensor.scale.setScalar(k)
            grupo.add(sensor)
            const aro = new THREE.Mesh(geoAro, tela)
            aro.position.set(px, y, zFrente(px) + 0.002)
            aro.rotation.y = angulo
            aro.scale.setScalar(k)
            grupo.add(aro)
        })
    })

    const led = new THREE.Mesh(registrar(new THREE.SphereGeometry(0.018, 16, 16)), acentoCian)
    led.position.set(0.62, 0.27, zFrente(0.62) + 0.01)
    grupo.add(led)

    // Interfaz facial (espuma) con la misma forma suave
    const espuma = new THREE.Mesh(piezaCurva(0.8, 0.37, 0.13, { e: 0.7, curva: 0.26 }), espumaMat)
    espuma.position.z = -0.26
    grupo.add(espuma)

    // Lentes iluminados: se ven al girar las gafas
    const matLente = registrar(new THREE.MeshBasicMaterial({ map: texturaLente() }))
    const geoLente = registrar(new THREE.CircleGeometry(0.2, 48))
    const geoMarco = registrar(new THREE.RingGeometry(0.2, 0.245, 48))
    ;[-0.36, 0.36].forEach((x) => {
        const z = -0.39 - 0.26 * Math.pow(x / 0.8, 2) - 0.004
        const lente = new THREE.Mesh(geoLente, matLente)
        lente.position.set(x, 0.03, z - 0.002)
        lente.rotation.y = Math.PI
        grupo.add(lente)
        const marco = new THREE.Mesh(geoMarco, negro)
        marco.position.set(x, 0.03, z)
        marco.rotation.y = Math.PI
        grupo.add(marco)
    })

    // Correas: brazos laterales blancos que salen del visor y banda suave alrededor de la cabeza
    ;[-1, 1].forEach((lado) => {
        grupo.add(new THREE.Mesh(tubo([
            [lado * 0.72, 0.02, -0.2], [lado * 0.88, 0.03, -0.42], [lado * 0.97, 0.04, -0.74],
        ], 0.06), blanco))
    })
    const contornoCabeza = []
    for (let i = 0; i < 48; i += 1) {
        const t = (i / 48) * Math.PI * 2
        contornoCabeza.push([Math.sin(t) * 1.0, 0.04 + Math.cos(t) * 0.05, -1.05 + Math.cos(t) * 0.38 - (Math.cos(t) < 0 ? -Math.cos(t) * 0.4 : 0)])
    }
    grupo.add(new THREE.Mesh(tubo(contornoCabeza, 0.05, true), tela))
    grupo.add(new THREE.Mesh(tubo([
        [0, 0.36, -0.2], [0, 0.74, -0.72], [0, 0.7, -1.25], [0, 0.3, -1.7],
    ], 0.045), tela))

    // Centrar el conjunto en el punto de giro
    grupo.position.z = 0.55
    const raiz = new THREE.Group()
    raiz.add(grupo)
    return raiz
}

// Distancia de cámara para que las gafas quepan completas en el lienzo
const RADIO_GAFAS = 1.3
function distanciaAjustada() {
    const vFov = THREE.MathUtils.degToRad(camera.fov)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
    return (RADIO_GAFAS / Math.sin(Math.min(vFov, hFov) / 2)) * 0.92
}

function ajustarTamano() {
    const el = contenedor.value
    if (!el || !renderer) return
    const w = el.clientWidth || 1
    const h = el.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    if (controls) {
        controls.minDistance = distanciaAjustada() * 0.5
        controls.maxDistance = distanciaAjustada() * 1.6
    }
}

function webglDisponible(canvas) {
    try {
        return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
    } catch (_) {
        return false
    }
}

onMounted(async () => {
    // En Nuxt, un componente .client aún no tiene su HTML en onMounted:
    // hay que esperar un ciclo para que existan el lienzo y el contenedor.
    await nextTick()
    // Sin WebGL (navegador antiguo, aceleración desactivada): se muestra la foto
    if (!lienzo.value || !contenedor.value || !webglDisponible(document.createElement('canvas'))) {
        sinWebgl.value = true
        return
    }
    try {
        renderer = new THREE.WebGLRenderer({ canvas: lienzo.value, antialias: true, alpha: true })
    } catch (_) {
        sinWebgl.value = true
        return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)

    // Iluminación con los colores de la marca
    scene.add(new THREE.HemisphereLight(0xeef2ff, 0x0b1020, 0.9))
    const principal = new THREE.DirectionalLight(0xffffff, 2.6)
    principal.position.set(3, 4, 5)
    scene.add(principal)
    const bordeCian = new THREE.PointLight(0x22d3ee, 7, 10)
    bordeCian.position.set(-3, 1, -2)
    scene.add(bordeCian)
    const bordeVioleta = new THREE.PointLight(0xa78bfa, 9, 10)
    bordeVioleta.position.set(3, -1, -2.5)
    scene.add(bordeVioleta)

    gafas = construirGafas()
    gafas.rotation.set(0.12, -0.5, 0)
    scene.add(gafas)

    // Entrada: la cámara llega desde lejos y se acerca a las gafas
    const contenedorEl = contenedor.value
    camera.aspect = (contenedorEl.clientWidth || 1) / (contenedorEl.clientHeight || 1)
    camera.updateProjectionMatrix()
    let distanciaFinal = distanciaAjustada()
    const distanciaInicial = distanciaFinal * 3
    camera.position.set(0, 0.35, reducirMovimiento ? distanciaFinal : distanciaInicial)

    controls = new OrbitControls(camera, lienzo.value)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.rotateSpeed = 0.8
    controls.autoRotate = !reducirMovimiento
    controls.autoRotateSpeed = 2.2 // giro continuo tipo vitrina
    controls.target.set(0, 0, 0)
    controls.addEventListener('start', () => {
        interactuo.value = true
        controls.autoRotate = false
    })
    // Retoma el giro automático unos segundos después de soltar
    let temporizador = 0
    controls.addEventListener('end', () => {
        clearTimeout(temporizador)
        if (!reducirMovimiento) temporizador = setTimeout(() => { controls.autoRotate = true }, 2500)
    })

    ajustarTamano()
    resizeObserver = new ResizeObserver(ajustarTamano)
    resizeObserver.observe(contenedor.value)

    const inicio = performance.now()
    const dibujar = (t) => {
        frameId = 0
        if (!visible || document.hidden) return
        const transcurrido = (t - inicio) / 1000
        if (!reducirMovimiento && transcurrido < 2.2 && !interactuo.value) {
            // Acercamiento con desaceleración suave
            const p = Math.min(transcurrido / 2.2, 1)
            const suave = 1 - Math.pow(1 - p, 3)
            distanciaFinal = distanciaAjustada()
            camera.position.z = distanciaInicial + (distanciaFinal - distanciaInicial) * suave
        }
        if (!reducirMovimiento) gafas.position.y = Math.sin(transcurrido * 1.2) * 0.06 // flota levemente
        controls.update()
        renderer.render(scene, camera)
        frameId = requestAnimationFrame(dibujar)
    }
    frameId = requestAnimationFrame(dibujar)

    const reanudar = () => { if (visible && !document.hidden && !frameId) frameId = requestAnimationFrame(dibujar) }
    observer = new IntersectionObserver(([e]) => { visible = e.isIntersecting; reanudar() })
    observer.observe(contenedor.value)
    document.addEventListener('visibilitychange', reanudar)
    limpiezas.push(() => document.removeEventListener('visibilitychange', reanudar), () => clearTimeout(temporizador))
})

onBeforeUnmount(() => {
    limpiezas.forEach((fn) => fn())
    if (frameId) cancelAnimationFrame(frameId)
    observer?.disconnect()
    resizeObserver?.disconnect()
    controls?.dispose()
    recursos.forEach((r) => r.dispose && r.dispose())
    renderer?.dispose()
})
</script>

<style scoped>
.visor3d {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 420px;
}

.visor3d__respaldo {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: bottom;
}

.visor3d__canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
}

.visor3d__canvas:active {
    cursor: grabbing;
}

.visor3d__ayuda {
    position: absolute;
    left: 50%;
    bottom: 2%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 8px 14px;
    white-space: nowrap;
    font-size: 0.8rem;
    color: rgba(238, 242, 251, 0.8);
    background: rgba(5, 7, 15, 0.55);
    border: 1px solid rgba(163, 177, 201, 0.18);
    border-radius: 999px;
    backdrop-filter: blur(8px);
    pointer-events: none;
    transition: opacity 0.6s ease;
}

.visor3d__ayuda.is-oculta {
    opacity: 0;
}

.visor3d__sep {
    opacity: 0.5;
}
</style>
