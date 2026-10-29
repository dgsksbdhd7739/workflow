// Prueft VOR dem ersten Rendern (siehe main.tsx) auf ein neueres Web-Bundle
// und spielt es bei Bedarf automatisch ein -- kein manuelles APK-Neubauen/
// -Installieren fuer reine JS/CSS-Aenderungen noetig, und kein manuelles
// Neustarten der App durch den Nutzer: findet initLiveUpdate() eine neuere
// Version, wird sie geladen und aktiviert, BEVOR die alte Oberflaeche
// jemals sichtbar wird (CapacitorUpdater.set() ersetzt danach ohnehin den
// kompletten JS-Kontext). Manifest + Bundle-Zip liegen auf dem eigenen VPS
// unter /updates/ (abgelegt von scripts/publish-update.mjs, ausgeliefert von
// Nginx).
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { API_BASIS } from './backend'

// Native Builds haben immer VITE_API_URL (sonst koennten sie den Server gar
// nicht erreichen); der Fallback ist die bisherige Adresse des VPS.
const MANIFEST_URL = `${API_BASIS || 'https://217-154-200-72.sslip.io'}/updates/latest.json`
// Obergrenze, damit ein langsames/fehlendes Netz den Start nicht blockiert
// (App bleibt offline-faehig und startet dann einfach mit dem Bundle, das
// schon auf dem Geraet liegt).
const MAX_WARTEZEIT_MS = 3000

interface UpdateManifest {
  version: string
  url: string
}

async function pruefeUndWendeUpdateAn() {
  const res = await fetch(MANIFEST_URL, { cache: 'no-store' })
  if (!res.ok) return
  const manifest: UpdateManifest = await res.json()
  if (!manifest.version || !manifest.url) return

  const { bundle } = await CapacitorUpdater.current()
  if (manifest.version === bundle.version) return

  const neuesBundle = await CapacitorUpdater.download({ version: manifest.version, url: manifest.url })
  // Reloadet den kompletten JS-Kontext auf das neue Bundle -- alles danach
  // in diesem Modul wird nicht mehr ausgefuehrt.
  await CapacitorUpdater.set({ id: neuesBundle.id })
}

export async function initLiveUpdate() {
  if (!Capacitor.isNativePlatform()) return

  // Kritisch: ohne diesen Aufruf rollt der Updater automatisch auf die letzte
  // funktionierende Version zurueck, weil er annimmt, das aktuelle Bundle sei
  // beim Start fehlgeschlagen.
  await CapacitorUpdater.notifyAppReady()

  await Promise.race([
    pruefeUndWendeUpdateAn().catch((err) => console.error('Live-Update-Check fehlgeschlagen:', err)),
    new Promise((resolve) => setTimeout(resolve, MAX_WARTEZEIT_MS)),
  ])
}
