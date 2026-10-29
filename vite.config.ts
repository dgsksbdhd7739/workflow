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
        description: 'Aufgabenmanagement, Pläne, Bautagebuch und Zeiterfassung für Projekte',
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
        // ohne Netz sofort startet. API-Leseanfragen werden bewusst NICHT
        // gecacht: Sowohl "stale-while-revalidate" als auch "network-first"
        // mit Timeout wurden ausprobiert und haben beide dazu gefuehrt, dass
        // frisch geschriebene Daten (ein gerade hochgeladener Plan, eine
        // geaenderte Aufgabe) durch eine veraltete Cache-Antwort ueberschrieben
        // wurden -- bei network-first reicht dafuer schon eine kurze
        // Verzoegerung im Mobilfunknetz, die den Timeout reisst. Fuer eine
        // App mit live bearbeiteten, geteilten Daten ist Korrektheit wichtiger
        // als eine Offline-Ansicht veralteter Listen.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // /download/ ist eine statische Seite neben der SPA (APK-Download,
        // siehe scripts/deploy-vps.mjs) -- nicht auf index.html umleiten.
        // Ebenso das Backend (/api, u. a. Datei-Links, die in iframes/neuen
        // Tabs geoeffnet werden) und die Live-Update-Dateien (/updates).
        navigateFallbackDenylist: [/^\/download/, /^\/api\//, /^\/updates\//],
        // Ohne skipWaiting/clientsClaim bleibt ein neuer Service Worker im
        // "waiting"-Zustand haengen, bis WIRKLICH alle Instanzen des alten
        // geschlossen wurden -- in der nativen App reicht dafuer haeufig
        // nicht ein einfaches Schliessen/Wiederoeffnen. Das fuehrte dazu,
        // dass Nutzer trotz veroeffentlichtem Update weiterhin alten Code
        // (altes PDF-Layout, veraltete Daten) sahen. So wird ein neuer SW
        // sofort beim naechsten Laden aktiv.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Der PDF-Worker (pdfjs, per ?url eingebunden) heisst sonst *.mjs. Nginx
        // lieferte .mjs als application/octet-stream aus, der Browser blockierte
        // den Modul-Worker, und keine PDF liess sich oeffnen; diese falsche
        // Antwort steckt bis zu einem Jahr im Browser-Cache. Als .js bekommt
        // die Datei einen neuen Namen und ueberall den richtigen MIME-Typ.
        assetFileNames: (datei) =>
          datei.names?.[0]?.endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    host: true,
  },
})
