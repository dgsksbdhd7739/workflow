export interface Konfiguration {
  datenbankUrl: string
  jwtGeheimnis: Uint8Array
  port: number
  erlaubteUrspruenge: string[]
  // Lebensdauer des Zugriffstokens; danach erneuert der Client per Refresh-Token.
  zugriffstokenSekunden: number
  // Sitzung laeuft ab, wenn sie so lange nicht erneuert wurde (gleitend).
  sitzungInaktivTage: number
  // Anmelde-Versuche pro IP und Minute (Schutz gegen Passwort-Raten).
  anmeldeVersucheProMinute: number
}

function pflicht(env: NodeJS.ProcessEnv, name: string): string {
  const wert = env[name]
  if (!wert) throw new Error(`Umgebungsvariable ${name} fehlt (siehe server/.env.example).`)
  return wert
}

export function ladeKonfiguration(env: NodeJS.ProcessEnv = process.env): Konfiguration {
  const jwtGeheimnis = pflicht(env, 'JWT_SECRET')
  if (jwtGeheimnis.length < 32) throw new Error('JWT_SECRET muss mindestens 32 Zeichen lang sein.')
  return {
    datenbankUrl: pflicht(env, 'DATABASE_URL'),
    jwtGeheimnis: new TextEncoder().encode(jwtGeheimnis),
    port: Number(env.PORT ?? 3000),
    erlaubteUrspruenge: (env.ERLAUBTE_URSPRUENGE ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    zugriffstokenSekunden: 3600,
    sitzungInaktivTage: 90,
    anmeldeVersucheProMinute: 10,
  }
}
