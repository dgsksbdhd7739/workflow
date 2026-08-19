import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'WorkFlow',
        short_name: 'WorkFlow',
        description: 'Aufgabenmanagement, Pläne, Bautagebuch und Zeiterfassung für Baustellen',
        theme_color: '#2563eb',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App-Shell (JS/CSS/HTML) wird vorab gecacht, damit die App auch
        // ohne Netz sofort startet. Supabase-Leseanfragen versuchen zuerst
        // das Netz (kurzes Timeout), damit z. B. ein gerade hochgeladener
        // Plan sofort in der Liste auftaucht -- "stale-while-revalidate"
        // liefert bewusst erst die ALTE Antwort aus dem Cache zurueck und
        // aktualisiert ihn nur im Hintergrund fuer den naechsten Aufruf, was
        // frische Schreibvorgaenge unsichtbar machte, bis irgendeine andere
        // Ansicht denselben Endpunkt erneut abgefragt hat. Nur wenn das Netz
        // nicht antwortet, faellt es auf die zuletzt geladenen Daten zurueck.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-rest',
              networkTimeoutSeconds: 4,
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
