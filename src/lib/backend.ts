// Client fuer das eigene WorkFlow-Backend (server/), Nachfolger von
// @supabase/supabase-js. Die Abfrage-Methoden (from/select/eq/order/...)
// heissen bewusst wie vorher, damit die Aufrufstellen unveraendert bleiben;
// ausgefuehrt wird alles serverseitig unter den RLS-Policies des Nutzers.

import type { Serverzustand } from './serverzustand'

// Leer = gleicher Host (Web-App auf dem VPS). Android/Tauri brauchen die volle
// Adresse, weil sie von capacitor://localhost bzw. tauri://localhost laufen.
export const API_BASIS = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

// Expliziter Schalter fuer die lokale Demo ohne Server/Anmeldung (LokaleDemo).
export const isLokaleDemoAktiviert = import.meta.env.VITE_LOKALE_DEMO === 'true'

export interface BackendFehler {
  message: string
  code?: string
}

export interface Ergebnis<T = any> {
  data: T
  error: BackendFehler | null
  count: number | null
}

// ---------------------------------------------------------------------------
// Sitzung
// ---------------------------------------------------------------------------

export interface Sitzung {
  access_token: string
  refresh_token: string
  expires_at: number
  user: { id: string; email: string }
  aal: 'aal1' | 'aal2'
}

export type AuthEreignis = 'ANGEMELDET' | 'ERNEUERT' | 'ABGEMELDET'

const SPEICHER_SCHLUESSEL = 'workflow.sitzung'
const NETZWERK_FEHLER: BackendFehler = { message: 'Keine Verbindung zum Server.', code: 'netzwerk' }

function sitzungLesen(): Sitzung | null {
  try {
    const roh = localStorage.getItem(SPEICHER_SCHLUESSEL)
    return roh ? (JSON.parse(roh) as Sitzung) : null
  } catch {
    return null
  }
}

let sitzung: Sitzung | null = sitzungLesen()
let erneuerung: Promise<Sitzung | null> | null = null
let erneuerungsTimer: ReturnType<typeof setTimeout> | undefined
const beobachter = new Set<(ereignis: AuthEreignis, s: Sitzung | null) => void>()

function sitzungSetzen(neu: Sitzung | null, ereignis: AuthEreignis) {
  sitzung = neu
  try {
    if (neu) localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(neu))
    else localStorage.removeItem(SPEICHER_SCHLUESSEL)
  } catch {
    // Speicher nicht verfuegbar (privater Modus) -- Sitzung gilt dann nur im Speicher.
  }
  zeitplanErneuerung()
  for (const b of beobachter) b(ereignis, neu)
}

// Rechtzeitig vor Ablauf erneuern, damit auch die Live-Verbindung gueltig bleibt.
function zeitplanErneuerung() {
  clearTimeout(erneuerungsTimer)
  if (!sitzung) return
  const ms = Math.max((sitzung.expires_at - 120) * 1000 - Date.now(), 5_000)
  erneuerungsTimer = setTimeout(() => void sitzungErneuern(), ms)
}
zeitplanErneuerung()

// Anmeldung/Abmeldung in einem anderen Tab uebernehmen.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== SPEICHER_SCHLUESSEL) return
    const neu = sitzungLesen()
    sitzung = neu
    zeitplanErneuerung()
    for (const b of beobachter) b(neu ? 'ERNEUERT' : 'ABGEMELDET', neu)
  })
}

/** Erneuert die Sitzung (nur eine Erneuerung gleichzeitig -- Refresh-Tokens rotieren). */
function sitzungErneuern(): Promise<Sitzung | null> {
  if (!erneuerung) {
    erneuerung = (async () => {
      const aktuell = sitzung
      if (!aktuell) return null
      try {
        const res = await fetch(`${API_BASIS}/api/auth/erneuern`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: aktuell.refresh_token }),
        })
        if (res.ok) {
          const neu = (await res.json()) as Sitzung
          sitzungSetzen(neu, 'ERNEUERT')
          return neu
        }
        // Nur bei eindeutiger Ablehnung abmelden, nicht bei Serverfehlern.
        if (res.status === 401 || res.status === 403) sitzungSetzen(null, 'ABGEMELDET')
        return sitzung
      } catch {
        return sitzung // offline: alte Sitzung behalten, spaeter erneut versuchen
      } finally {
        erneuerung = null
      }
    })()
  }
  return erneuerung
}

async function gueltigesToken(): Promise<string | null> {
  if (!sitzung) return null
  if (sitzung.expires_at - 60 < Date.now() / 1000) await sitzungErneuern()
  return sitzung?.access_token ?? null
}

/** JSON-Anfrage mit Token; bei abgelaufenem Token einmal erneuern und wiederholen. */
async function anfrage<T = any>(pfad: string, optionen: { methode?: string; body?: unknown; ohneToken?: boolean } = {}) {
  const senden = async (token: string | null) =>
    fetch(`${API_BASIS}${pfad}`, {
      method: optionen.methode ?? 'POST',
      headers: {
        ...(optionen.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: optionen.body !== undefined ? JSON.stringify(optionen.body) : undefined,
    })
  try {
    let res = await senden(optionen.ohneToken ? null : await gueltigesToken())
    if (res.status === 401 && !optionen.ohneToken && sitzung) {
      const neu = await sitzungErneuern()
      if (neu) res = await senden(neu.access_token)
    }
    const inhalt = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 401 && inhalt?.code === 'sitzung_beendet' && sitzung) sitzungSetzen(null, 'ABGEMELDET')
      return { daten: null, fehler: { message: inhalt?.error ?? `Fehler ${res.status}`, code: inhalt?.code } as BackendFehler }
    }
    return { daten: inhalt as T, fehler: null }
  } catch {
    return { daten: null, fehler: NETZWERK_FEHLER }
  }
}

// ---------------------------------------------------------------------------
// Daten (frueher supabase.from(...))
// ---------------------------------------------------------------------------

type Filter = { spalte: string; op: string; wert: unknown; nicht?: boolean }

// R: Typ von data -- wie bei supabase-js ohne Schema-Typen: Listen sind any[],
// nach single()/maybeSingle() ein einzelnes any.
class Abfrage<R = any[]> implements PromiseLike<Ergebnis<R>> {
  private aktion: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  private spalten = '*'
  private rueckgabe = false
  private werte: unknown
  private konflikt: string | undefined
  private readonly filter: Filter[] = []
  private readonly sortierung: { spalte: string; absteigend: boolean }[] = []
  private anzahl: number | undefined
  private zaehlen = false
  private nurZaehlen = false
  private einzeln: 'single' | 'maybeSingle' | null = null
  private readonly tabelle: string

  constructor(tabelle: string) {
    this.tabelle = tabelle
  }

  // Ohne vorherige Schreibaktion: Lesen. Nach insert/update/upsert/delete:
  // geaenderte Zeilen zurueckgeben (wie supabase-js .select()).
  select(spalten = '*', optionen?: { count?: 'exact'; head?: boolean }) {
    this.spalten = spalten
    if (this.aktion === 'select') {
      this.zaehlen = optionen?.count === 'exact'
      this.nurZaehlen = !!optionen?.head
    } else {
      this.rueckgabe = true
    }
    return this
  }
  insert(werte: object | object[]) {
    this.aktion = 'insert'
    this.werte = werte
    return this
  }
  upsert(werte: object | object[], optionen?: { onConflict?: string }) {
    this.aktion = 'upsert'
    this.werte = werte
    this.konflikt = optionen?.onConflict
    return this
  }
  update(werte: object) {
    this.aktion = 'update'
    this.werte = werte
    return this
  }
  delete() {
    this.aktion = 'delete'
    return this
  }

  private bedingung(spalte: string, op: string, wert: unknown, nicht = false) {
    this.filter.push({ spalte, op, wert, ...(nicht ? { nicht } : {}) })
    return this
  }
  eq(spalte: string, wert: unknown) { return this.bedingung(spalte, 'eq', wert) }
  neq(spalte: string, wert: unknown) { return this.bedingung(spalte, 'neq', wert) }
  gt(spalte: string, wert: unknown) { return this.bedingung(spalte, 'gt', wert) }
  gte(spalte: string, wert: unknown) { return this.bedingung(spalte, 'gte', wert) }
  lt(spalte: string, wert: unknown) { return this.bedingung(spalte, 'lt', wert) }
  lte(spalte: string, wert: unknown) { return this.bedingung(spalte, 'lte', wert) }
  like(spalte: string, muster: string) { return this.bedingung(spalte, 'like', muster) }
  ilike(spalte: string, muster: string) { return this.bedingung(spalte, 'ilike', muster) }
  in(spalte: string, werte: readonly unknown[]) { return this.bedingung(spalte, 'in', werte) }
  is(spalte: string, wert: null | boolean) { return this.bedingung(spalte, 'is', wert) }
  not(spalte: string, op: string, wert: unknown) { return this.bedingung(spalte, op, wert, true) }
  match(werte: Record<string, unknown>) {
    for (const [spalte, wert] of Object.entries(werte)) this.bedingung(spalte, 'eq', wert)
    return this
  }
  order(spalte: string, optionen?: { ascending?: boolean }) {
    this.sortierung.push({ spalte, absteigend: optionen?.ascending === false })
    return this
  }
  limit(anzahl: number) {
    this.anzahl = anzahl
    return this
  }
  single(): Abfrage<any> {
    this.einzeln = 'single'
    return this
  }
  maybeSingle(): Abfrage<any> {
    this.einzeln = 'maybeSingle'
    return this
  }

  private async ausfuehren(): Promise<Ergebnis<R>> {
    const { daten, fehler } = await anfrage<{ data: any[] | null; count: number | null }>(
      `/api/daten/${encodeURIComponent(this.tabelle)}`,
      {
        body: {
          aktion: this.aktion,
          spalten: this.spalten,
          rueckgabe: this.rueckgabe,
          werte: this.werte,
          konflikt: this.konflikt,
          filter: this.filter.length ? this.filter : undefined,
          sortierung: this.sortierung.length ? this.sortierung : undefined,
          limit: this.anzahl,
          zaehlen: this.zaehlen,
          nurZaehlen: this.nurZaehlen,
        },
      },
    )
    if (fehler || !daten) return { data: null as R, error: fehler, count: null }
    if (!this.einzeln) return { data: daten.data as R, error: null, count: daten.count }
    const zeilen = daten.data ?? []
    if (zeilen.length > 1 || (this.einzeln === 'single' && zeilen.length === 0)) {
      return { data: null as R, error: { message: 'Es wurde genau ein Eintrag erwartet.', code: 'nicht_eindeutig' }, count: null }
    }
    return { data: (zeilen[0] ?? null) as R, error: null, count: daten.count }
  }

  then<A = Ergebnis<R>, B = never>(
    erfuellt?: ((wert: Ergebnis<R>) => A | PromiseLike<A>) | null,
    abgelehnt?: ((grund: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.ausfuehren().then(erfuellt, abgelehnt)
  }
}

// ---------------------------------------------------------------------------
// Anmeldung
// ---------------------------------------------------------------------------

export interface Faktor {
  id: string
  friendly_name: string | null
  factor_type: 'totp'
  status: 'unverified' | 'verified'
}

let mfaZwischentoken: string | null = null

const auth = {
  sitzung: () => sitzung,

  beiAenderung(rueckruf: (ereignis: AuthEreignis, s: Sitzung | null) => void) {
    beobachter.add(rueckruf)
    return () => {
      beobachter.delete(rueckruf)
    }
  },

  /** Schritt 1. Mit aktivem 2FA gibt es noch keine Sitzung, nur mfaErforderlich. */
  async anmelden(email: string, passwort: string) {
    const { daten, fehler } = await anfrage<Sitzung & { mfa_erforderlich?: boolean; mfa_token?: string; faktor_id?: string }>(
      '/api/auth/anmelden',
      { body: { email, passwort }, ohneToken: true },
    )
    if (fehler || !daten) return { error: fehler, mfaErforderlich: false }
    if (daten.mfa_erforderlich) {
      mfaZwischentoken = daten.mfa_token ?? null
      return { error: null, mfaErforderlich: true }
    }
    sitzungSetzen(daten, 'ANGEMELDET')
    return { error: null, mfaErforderlich: false }
  },

  /** Schritt 2 bei aktivem 2FA. */
  async mfaBestaetigen(code: string) {
    if (!mfaZwischentoken) return { error: { message: 'Die Anmeldung ist abgelaufen. Bitte erneut anmelden.' } }
    const { daten, fehler } = await anfrage<Sitzung>('/api/auth/mfa', {
      body: { mfa_token: mfaZwischentoken, code },
      ohneToken: true,
    })
    if (fehler || !daten) return { error: fehler }
    mfaZwischentoken = null
    sitzungSetzen(daten, 'ANGEMELDET')
    return { error: null }
  },

  mfaAbbrechen() {
    mfaZwischentoken = null
  },

  /** bereich: 'lokal' (dieses Geraet), 'andere' (alle anderen), 'alle'. */
  async abmelden(bereich: 'lokal' | 'andere' | 'alle' = 'lokal') {
    const { fehler } = sitzung ? await anfrage('/api/auth/abmelden', { body: { bereich } }) : { fehler: null }
    if (bereich !== 'andere') sitzungSetzen(null, 'ABGEMELDET')
    return { error: fehler }
  },

  async nutzer() {
    const { daten, fehler } = await anfrage<{ id: string; email: string; aal: string; faktoren: Faktor[] }>('/api/auth/nutzer', {
      methode: 'GET',
    })
    return { data: daten, error: fehler }
  },

  async passwortAendern(passwort: string) {
    const { fehler } = await anfrage('/api/auth/passwort', { body: { passwort } })
    return { error: fehler }
  },

  async emailAendern(email: string) {
    const { fehler } = await anfrage<{ email: string }>('/api/auth/email', { body: { email } })
    if (!fehler && sitzung) sitzungSetzen({ ...sitzung, user: { ...sitzung.user, email } }, 'ERNEUERT')
    return { error: fehler }
  },

  async faktorEinrichten() {
    const { daten, fehler } = await anfrage<Faktor & { totp: { qr_code: string; secret: string; uri: string } }>(
      '/api/auth/mfa/faktoren',
      { body: {} },
    )
    return { data: daten, error: fehler }
  },

  /** Bestaetigt die Einrichtung; die Sitzung wird dabei auf 2FA-Stufe gehoben. */
  async faktorBestaetigen(faktorId: string, code: string) {
    const { daten, fehler } = await anfrage<Sitzung>(`/api/auth/mfa/faktoren/${encodeURIComponent(faktorId)}/bestaetigen`, {
      body: { code },
    })
    if (daten) sitzungSetzen(daten, 'ERNEUERT')
    return { error: fehler }
  },

  async faktorEntfernen(faktorId: string) {
    const { fehler } = await anfrage(`/api/auth/mfa/faktoren/${encodeURIComponent(faktorId)}`, { methode: 'DELETE' })
    return { error: fehler }
  },
}

// ---------------------------------------------------------------------------
// Echtzeit (Chats)
// ---------------------------------------------------------------------------

type LiveRueckruf = { beiNeu?: (zeile: any) => void; beiLoeschen?: (alt: { id: string }) => void }

let liveSocket: WebSocket | null = null
let liveBereit = false
let liveWiederholung: ReturnType<typeof setTimeout> | undefined
let liveZaehler = 0
const liveAbos = new Map<string, { tabelle: string; wert: string; rueckruf: LiveRueckruf }>()

function liveSenden(nachricht: object) {
  if (liveSocket?.readyState === WebSocket.OPEN) liveSocket.send(JSON.stringify(nachricht))
}

function liveVerbinden() {
  if (liveSocket || liveAbos.size === 0 || !sitzung) return
  const basis = API_BASIS || window.location.origin
  const ws = new WebSocket(`${basis.replace(/^http/, 'ws')}/api/live`)
  liveSocket = ws
  liveBereit = false
  ws.onopen = () => liveSenden({ typ: 'anmelden', token: sitzung?.access_token })
  ws.onmessage = (e) => {
    const n = JSON.parse(String(e.data))
    if (n.typ === 'angemeldet' && !liveBereit) {
      liveBereit = true
      for (const [kanal, abo] of liveAbos) liveSenden({ typ: 'abonnieren', kanal, tabelle: abo.tabelle, wert: abo.wert })
    } else if (n.typ === 'ereignis') {
      const abo = liveAbos.get(n.kanal)
      if (n.ereignis === 'INSERT') abo?.rueckruf.beiNeu?.(n.neu)
      if (n.ereignis === 'DELETE') abo?.rueckruf.beiLoeschen?.(n.alt)
    }
  }
  ws.onclose = () => {
    liveSocket = null
    liveBereit = false
    clearTimeout(liveWiederholung)
    // Automatisch neu verbinden, solange noch jemand zuhoert (z. B. nach Funkloch).
    if (liveAbos.size > 0) liveWiederholung = setTimeout(liveVerbinden, 3000)
  }
}

// Nach Token-Erneuerung das neue Token nachreichen; bei Abmeldung trennen.
auth.beiAenderung((ereignis, s) => {
  if (ereignis === 'ABGEMELDET') {
    liveSocket?.close()
  } else if (s) {
    liveSenden({ typ: 'anmelden', token: s.access_token })
    liveVerbinden()
  }
})

const live = {
  /** Neue/geloeschte Zeilen einer Chat-Tabelle fuer eine Firma bzw. ein Projekt. Rueckgabe: Abbestellen. */
  abonnieren(
    tabelle: 'chat_nachrichten' | 'projekt_chat_nachrichten',
    wert: string,
    rueckruf: LiveRueckruf,
  ) {
    const kanal = `k${++liveZaehler}`
    liveAbos.set(kanal, { tabelle, wert, rueckruf })
    if (liveBereit) liveSenden({ typ: 'abonnieren', kanal, tabelle, wert })
    else liveVerbinden()
    return () => {
      liveAbos.delete(kanal)
      liveSenden({ typ: 'abbestellen', kanal })
      if (liveAbos.size === 0) liveSocket?.close()
    }
  },
}

// ---------------------------------------------------------------------------
// Oeffentliche Schnittstelle
// ---------------------------------------------------------------------------

export const backend = {
  from: (tabelle: string) => new Abfrage<any[]>(tabelle),

  async rpc(name: string): Promise<Ergebnis> {
    const { daten, fehler } = await anfrage<{ data: any }>(`/api/rpc/${encodeURIComponent(name)}`, { body: {} })
    return { data: daten?.data ?? null, error: fehler, count: null }
  },

  /** Serverfunktionen (frueher Supabase Edge Functions), z. B. create-user. */
  async funktion<T = any>(name: string, body: object): Promise<{ data: T | null; error: BackendFehler | null }> {
    const { daten, fehler } = await anfrage<T>(`/api/funktionen/${encodeURIComponent(name)}`, { body })
    return { data: daten, error: fehler }
  },

  /** Zustand des Servers fuer die Plattform-Verwaltung (nur Plattform-Admins). */
  async serverzustand(zeitraum: '24h' | '7d'): Promise<{ data: Serverzustand | null; error: BackendFehler | null }> {
    const { daten, fehler } = await anfrage<Serverzustand>(`/api/betrieb/serverzustand?zeitraum=${zeitraum}`, { methode: 'GET' })
    return { data: daten, error: fehler }
  },

  auth,
  live,
}

// ---------------------------------------------------------------------------
// Dateien
// ---------------------------------------------------------------------------

export type StorageBucket = 'mangel-fotos' | 'plaene' | 'projekt-logos' | 'dokumente' | 'unternehmen-logos' | 'tagesbericht-vorlagen'

// Dateinamen auf ein sicheres Zeichenset reduzieren (Umlaute/Sonderzeichen aus
// Android-Dateipickern). Der Anzeigename in der jeweiligen DB-Tabelle bleibt
// davon unberuehrt -- nur der Speicherpfad wird bereinigt.
function sichererDateiname(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
}

/**
 * Laedt eine vom Nutzer ausgewaehlte Datei nach `ordner/<timestamp>-<name>`
 * hoch und gibt den tatsaechlich verwendeten Pfad zurueck. Im Android-WebView
 * (Capacitor) fuehrt das direkte Uebergeben eines File-Objekts aus dem Datei-
 * Picker (das seinen Inhalt lazy ueber eine content://-URI streamt) bei
 * fetch() teils zu "Failed to fetch", ohne dass ueberhaupt eine Anfrage
 * rausgeht. Das vorherige Einlesen in einen ArrayBuffer zwingt den Browser,
 * die Datei vollstaendig ins Memory zu laden, was auf allen Plattformen
 * zuverlaessig funktioniert.
 */
export async function uploadFile(bucket: StorageBucket, ordner: string, file: File) {
  const path = `${ordner}/${Date.now()}-${sichererDateiname(file.name)}`
  try {
    const bytes = await file.arrayBuffer()
    const token = await gueltigesToken()
    const res = await fetch(`${API_BASIS}/api/dateien/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: bytes,
    })
    if (!res.ok) {
      const inhalt = await res.json().catch(() => ({}))
      return { path, error: (inhalt?.error as string | undefined) ?? `Upload fehlgeschlagen (${res.status})` }
    }
    return { path, error: null }
  } catch {
    return { path, error: NETZWERK_FEHLER.message }
  }
}

/**
 * Alle Speicherbereiche sind privat. Anzeige/Download funktioniert nur ueber
 * zeitlich begrenzte, signierte Links, die der Server nur ausstellt, wenn der
 * Nutzer die Datei laut Policy sehen darf.
 */
export async function getSignedUrl(bucket: StorageBucket, path: string, expiresInSeconds = 3600) {
  const { daten, fehler } = await anfrage<{ signedUrl: string }>(`/api/dateien/${bucket}/signieren`, {
    body: { pfad: path, sekunden: expiresInSeconds },
  })
  if (fehler) console.error(`Datei-Link-Fehler (${bucket}/${path}):`, fehler.message)
  return { url: daten ? `${API_BASIS}${daten.signedUrl}` : null, error: fehler?.message ?? null }
}

export async function dateienLoeschen(bucket: StorageBucket, pfade: string[]) {
  const { fehler } = await anfrage(`/api/dateien/${bucket}/loeschen`, { body: { pfade } })
  return { error: fehler }
}

/** Fehlermeldung einer Serverfunktion fuer die Anzeige (Fallback: allgemeiner Text). */
export function funktionsFehler(error: BackendFehler | null): string | null {
  return error?.message ?? null
}
