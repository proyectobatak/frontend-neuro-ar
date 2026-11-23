import { createVuetify } from 'vuetify'
import '@mdi/font/css/materialdesignicons.css'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { defineNuxtPlugin, useHead } from '#app'
import 'vuetify/styles'
import '@/assets/neuroar.css'

/* --------------------------------------------------------------------------
   Tema NeuroAr: la misma identidad visual de neuroar.com.co.
   Es la ÚNICA fuente de color de la app. En los componentes se usan solo
   estos nombres (primary, secondary, success, warning, error, info), nunca
   colores sueltos como "red", "blue" o hexadecimales.
     · primary   (cian)    = acción principal, enlaces y elemento activo
     · secondary (violeta) = acento de marca y datos
     · success / warning / error / info = estados del sistema
   -------------------------------------------------------------------------- */
export const NEUROAR_COLORS = {
  background: '#05070f',
  surface: '#0b1020',
  'surface-bright': '#121a30',
  'surface-variant': '#1f2a44',
  'on-surface-variant': '#eef2fb',
  primary: '#22d3ee',
  'on-primary': '#04111f',
  secondary: '#a78bfa',
  'on-secondary': '#0b0620',
  accent: '#e879f9',
  success: '#34d399',
  'on-success': '#04111f',
  warning: '#fbbf24',
  'on-warning': '#1a1200',
  error: '#f87171',
  'on-error': '#1a0505',
  info: '#67e8f9',
  'on-info': '#04111f',
  // Alias heredado: el menú usa color="AzulNeuro" (antes no estaba definido)
  AzulNeuro: '#22d3ee',
}

export default defineNuxtPlugin((nuxtApp) => {
  useHead({
    link: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap'
      }
    ],
    meta: [{ name: 'theme-color', content: NEUROAR_COLORS.background }]
  })

  const vuetify = createVuetify({
    components,
    directives,
    icons: {
      defaultSet: 'mdi',
    },
    theme: {
      defaultTheme: 'neuroar',
      themes: {
        neuroar: {
          dark: true,
          colors: NEUROAR_COLORS,
          variables: {
            'border-color': '#a3b1c9',
            'border-opacity': 0.2,
            'medium-emphasis-opacity': 0.74,
            'hover-opacity': 0.06,
          },
        },
      },
    },
    defaults: {
      VBtn: { rounded: 'pill', elevation: 0, class: 'text-none font-weight-bold' },
      VCard: { rounded: 'xl', elevation: 0 },
      VTextField: { color: 'primary' },
      VSelect: { color: 'primary' },
      VAutocomplete: { color: 'primary' },
      VCombobox: { color: 'primary' },
      VTextarea: { color: 'primary' },
      VFileInput: { color: 'primary' },
      VCheckbox: { color: 'primary' },
      VCheckboxBtn: { color: 'primary' },
      VRadio: { color: 'primary' },
      VSwitch: { color: 'primary' },
      VList: { color: 'primary' },
      VTabs: { color: 'primary' },
      VProgressCircular: { color: 'primary' },
      VProgressLinear: { color: 'primary' },
      VAlert: { variant: 'tonal', rounded: 'lg' },
      VChip: { variant: 'tonal' },
      VAppBar: { flat: true },
    },
  })

  nuxtApp.vueApp.use(vuetify)
})
