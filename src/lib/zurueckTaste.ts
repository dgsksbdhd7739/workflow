import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

/**
 * Android: Zurueck-Taste bzw. Zurueck-Wischgeste navigiert innerhalb der App
 * zurueck. Ohne diesen Listener beendet Android die App sofort. Auf der
 * Startseite (oder ohne Verlauf) wandert die App in den Hintergrund statt
 * geschlossen zu werden.
 *
 * Braucht das native Plugin @capacitor/app (ab APK 2.7.0). Aeltere APKs, die
 * dieses JS per Live-Update bekommen, kennen es nicht -- dann bleibt es beim
 * bisherigen Verhalten.
 */
export function zurueckTasteEinrichten() {
  if (!Capacitor.isNativePlatform()) return
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack && window.location.pathname !== '/') {
      window.history.back()
    } else {
      App.minimizeApp().catch(() => App.exitApp())
    }
  }).catch(() => {
    // Plugin in dieser APK nicht vorhanden
  })
}
