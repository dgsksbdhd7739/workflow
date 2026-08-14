import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Baustellenapp',
        short_name: 'Baustellen',
        description: 'Mängelmanagement, Pläne, Bautagebuch und Zeiterfassung für Baustellen',
        theme_color: '#2563eb',
        background_color: '#f9fafb',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-icon.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/pwa-icon.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: '/pwa-icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App-Shell (JS/CSS/HTML) wird vorab gecacht, damit die App auch
        // ohne Netz sofort startet. Supabase-Leseanfragen werden nach
        // "stale-while-revalidate" behandelt: zuletzt geladene Daten bleiben
        // offline sichtbar, aktualisieren sich aber sofort bei Netz.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/rest/v1/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-rest',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
  },
})
