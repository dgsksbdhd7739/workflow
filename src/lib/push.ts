import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

let initialisiert = false

export async function initPushNotifications(userId: string) {
  if (!Capacitor.isNativePlatform() || initialisiert) return
  initialisiert = true

  try {
    if (Capacitor.getPlatform() === 'android') {
      await PushNotifications.createChannel({
        id: 'team_chat',
        name: 'Team-Chat',
        description: 'Benachrichtigungen für neue Nachrichten im Team-Chat',
        importance: 4,
        visibility: 1,
      })
    }

    const status = await PushNotifications.checkPermissions()
    let erlaubt = status.receive === 'granted'
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
      const angefragt = await PushNotifications.requestPermissions()
      erlaubt = angefragt.receive === 'granted'
    }
    if (!erlaubt) return

    await PushNotifications.removeAllListeners()

    // Alle Listener muessen bestaetigt registriert sein, BEVOR register()
    // aufgerufen wird -- sonst kann das native "registration"-Ereignis
    // (Token) am JS-Listener vorbeilaufen (beobachtete Race Condition).
    await Promise.all([
      PushNotifications.addListener('registration', (token) => {
        supabase
          .from('push_tokens')
          .upsert({ user_id: userId, token: token.value, plattform: Capacitor.getPlatform() }, { onConflict: 'user_id,token' })
          .then(({ error }) => {
            if (error) console.error('Push-Token speichern fehlgeschlagen:', error.message)
          })
      }),
      PushNotifications.addListener('registrationError', (err) => {
        console.error('Push-Registrierung fehlgeschlagen:', JSON.stringify(err))
      }),
      PushNotifications.addListener('pushNotificationActionPerformed', () => {
        window.location.href = '/team-chat'
      }),
    ])

    await PushNotifications.register()
  } catch (err) {
    console.error('Push-Notifications-Setup fehlgeschlagen:', err instanceof Error ? err.message : String(err))
  }
}
