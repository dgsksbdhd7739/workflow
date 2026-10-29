import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { backend, type Sitzung } from '../lib/backend'
import { geraetKennung, geraetName, sitzungIdAusToken } from '../lib/geraet'
import { FIRMENDATEN_PFLICHT, firmendatenVollstaendig, type FirmendatenPflicht } from '../lib/firmendaten'
import { paketErlaubt, type Paket, type PaketFunktion } from '../lib/pakete'
import type { Rolle } from '../types/database'

// Dieses Geraet in nutzer_sitzungen eintragen/aktualisieren, inkl. der
// Auth-Sitzungs-ID, damit nur wirklich angemeldete Geraete angezeigt werden.
async function geraetEintragen(userId: string) {
  await backend.from('nutzer_sitzungen').upsert(
    {
      user_id: userId,
      geraet_kennung: geraetKennung(),
      geraet_name: geraetName(),
      sitzung_id: sitzungIdAusToken(backend.auth.sitzung()?.access_token),
      letzter_zugriff: new Date().toISOString(),
    },
    { onConflict: 'user_id,geraet_kennung' },
  )
}

interface AuthContextValue {
  user: Sitzung['user'] | null
  session: Sitzung | null
  role: Rolle | null
  unternehmenId: string | null
  mussPasswortAendern: boolean
  setMussPasswortAendern: (v: boolean) => void
  onboardingGesehen: boolean
  setOnboardingGesehen: (v: boolean) => void
  produktHinweise: boolean
  setProduktHinweise: (v: boolean) => void
  gesperrteModule: Set<string>
  istPlattformAdmin: boolean
  // Paket der eigenen Firma (Starter/Team/Business) und Pruefung einzelner Funktionen.
  paket: Paket | null
  hatFunktion: (funktion: PaketFunktion) => boolean
  // Firmen-Admin muss nach der Erstanmeldung zuerst die Firmendaten (inkl. Logo) pflegen.
  firmendatenFehlen: boolean
  pruefeFirmendaten: () => Promise<void>
  // Passwort war korrekt, der Code aus der Authenticator-App steht noch aus
  // (bis dahin gibt es keine Sitzung, siehe /anmeldung-bestaetigen).
  mfaPending: boolean
  bestaetigeMfaCode: (code: string) => Promise<{ error: string | null }>
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Sitzung | null>(() => backend.auth.sitzung())
  const [role, setRole] = useState<Rolle | null>(null)
  const [unternehmenId, setUnternehmenId] = useState<string | null>(null)
  const [mussPasswortAendern, setMussPasswortAendern] = useState(false)
  const [onboardingGesehen, setOnboardingGesehen] = useState(true)
  const [produktHinweise, setProduktHinweise] = useState(true)
  const [gesperrteModule, setGesperrteModule] = useState<Set<string>>(new Set())
  const [istPlattformAdmin, setIstPlattformAdmin] = useState(false)
  const [firmendatenFehlen, setFirmendatenFehlen] = useState(false)
  const [paket, setPaket] = useState<Paket | null>(null)
  const [mfaPending, setMfaPending] = useState(false)
  // Die Sitzung liegt lokal vor (kein Netzwerk noetig); laeuft sie serverseitig
  // nicht mehr, meldet die erste Anfrage ab und der Beobachter setzt sie auf null.
  const loading = false

  useEffect(() => backend.auth.beiAenderung((_ereignis, neu) => setSession(neu)), [])

  // Nur Firmen-Admins (nicht der Plattform-Admin) muessen die Firmendaten pflegen.
  const pruefeFirmendatenFuer = async (rolle: Rolle | null, plattformAdmin: boolean, firmaId: string | null) => {
    if (rolle !== 'admin' || plattformAdmin || !firmaId) {
      setFirmendatenFehlen(false)
      return
    }
    const { data } = await backend
      .from('unternehmen')
      .select(FIRMENDATEN_PFLICHT.join(', '))
      .eq('id', firmaId)
      .single()
    setFirmendatenFehlen(!firmendatenVollstaendig(data as Partial<FirmendatenPflicht> | null))
  }

  const pruefeFirmendaten = () => pruefeFirmendatenFuer(role, istPlattformAdmin, unternehmenId)

  useEffect(() => {
    const userId = session?.user.id
    if (!userId) {
      setRole(null)
      setUnternehmenId(null)
      setMussPasswortAendern(false)
      setOnboardingGesehen(true)
      setProduktHinweise(true)
      setGesperrteModule(new Set())
      setIstPlattformAdmin(false)
      setFirmendatenFehlen(false)
      setPaket(null)
      return
    }
    // Profil und Plattform-Admin-Status gemeinsam laden, damit die
    // Firmendaten-Pruefung den Plattform-Admin sicher ausnehmen kann.
    Promise.all([
      backend
        .from('profiles')
        .select('role, muss_passwort_aendern, onboarding_gesehen, unternehmen_id, produkt_hinweise')
        .eq('id', userId)
        .single(),
      backend.from('plattform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    ]).then(([{ data }, { data: plattformAdmin }]) => {
      setRole(data?.role ?? null)
      setUnternehmenId(data?.unternehmen_id ?? null)
      setMussPasswortAendern(data?.muss_passwort_aendern ?? false)
      setOnboardingGesehen(data?.onboarding_gesehen ?? true)
      setProduktHinweise(data?.produkt_hinweise ?? true)
      setIstPlattformAdmin(!!plattformAdmin)
      pruefeFirmendatenFuer(data?.role ?? null, !!plattformAdmin, data?.unternehmen_id ?? null)
      if (data?.unternehmen_id) {
        backend
          .from('unternehmen')
          .select('paket')
          .eq('id', data.unternehmen_id)
          .single()
          .then(({ data: firma }) => setPaket((firma?.paket as Paket | undefined) ?? null))
      }
    })
    backend
      .from('nutzer_modul_sperren')
      .select('modul')
      .eq('user_id', userId)
      .then(({ data }) => setGesperrteModule(new Set((data ?? []).map((r) => r.modul))))

    // Eine Sitzung gibt es erst nach vollstaendiger Anmeldung (ggf. inkl.
    // zweitem Faktor) -- das Geraet kann also direkt eingetragen werden.
    geraetEintragen(userId)
  }, [session?.user.id])

  const signIn = async (email: string, password: string) => {
    const { error, mfaErforderlich } = await backend.auth.anmelden(email, password)
    setMfaPending(mfaErforderlich)
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    setMfaPending(false)
    backend.auth.mfaAbbrechen()
    // Eigenen Geraete-Eintrag entfernen, solange die Sitzung noch gilt (RLS).
    const userId = session?.user.id
    if (userId) await backend.from('nutzer_sitzungen').delete().eq('user_id', userId).eq('geraet_kennung', geraetKennung())
    await backend.auth.abmelden()
  }

  const bestaetigeMfaCode = async (code: string) => {
    const { error } = await backend.auth.mfaBestaetigen(code)
    if (error) return { error: error.message }
    setMfaPending(false)
    return { error: null }
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        role,
        unternehmenId,
        mussPasswortAendern,
        setMussPasswortAendern,
        onboardingGesehen,
        setOnboardingGesehen,
        produktHinweise,
        setProduktHinweise,
        gesperrteModule,
        istPlattformAdmin,
        paket,
        hatFunktion: (funktion: PaketFunktion) => paketErlaubt(paket, funktion),
        firmendatenFehlen,
        pruefeFirmendaten,
        mfaPending,
        bestaetigeMfaCode,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden')
  return ctx
}
