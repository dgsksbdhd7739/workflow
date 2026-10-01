import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { geraetKennung, geraetName, sitzungIdAusToken } from '../lib/geraet'
import { FIRMENDATEN_PFLICHT, firmendatenVollstaendig, type FirmendatenPflicht } from '../lib/firmendaten'
import { paketErlaubt, type Paket, type PaketFunktion } from '../lib/pakete'

// Dieses Geraet in nutzer_sitzungen eintragen/aktualisieren, inkl. der
// Auth-Sitzungs-ID, damit nur wirklich angemeldete Geraete angezeigt werden.
async function geraetEintragen(userId: string) {
  const { data } = await supabase.auth.getSession()
  await supabase.from('nutzer_sitzungen').upsert(
    {
      user_id: userId,
      geraet_kennung: geraetKennung(),
      geraet_name: geraetName(),
      sitzung_id: sitzungIdAusToken(data.session?.access_token),
      letzter_zugriff: new Date().toISOString(),
    },
    { onConflict: 'user_id,geraet_kennung' },
  )
}
import type { Rolle } from '../types/database'

interface AuthContextValue {
  user: User | null
  session: Session | null
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
  mfaPending: boolean
  mfaFactorId: string | null
  bestaetigeMfaCode: (code: string) => Promise<{ error: string | null }>
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
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
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Nur Firmen-Admins (nicht der Plattform-Admin) muessen die Firmendaten pflegen.
  const pruefeFirmendatenFuer = async (rolle: Rolle | null, plattformAdmin: boolean, firmaId: string | null) => {
    if (rolle !== 'admin' || plattformAdmin || !firmaId) {
      setFirmendatenFehlen(false)
      return
    }
    const { data } = await supabase
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
      setMfaPending(false)
      setMfaFactorId(null)
      return
    }
    // Profil und Plattform-Admin-Status gemeinsam laden, damit die
    // Firmendaten-Pruefung den Plattform-Admin sicher ausnehmen kann.
    Promise.all([
      supabase
        .from('profiles')
        .select('role, muss_passwort_aendern, onboarding_gesehen, unternehmen_id, produkt_hinweise')
        .eq('id', userId)
        .single(),
      supabase.from('plattform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    ]).then(([{ data }, { data: plattformAdmin }]) => {
      setRole(data?.role ?? null)
      setUnternehmenId(data?.unternehmen_id ?? null)
      setMussPasswortAendern(data?.muss_passwort_aendern ?? false)
      setOnboardingGesehen(data?.onboarding_gesehen ?? true)
      setProduktHinweise(data?.produkt_hinweise ?? true)
      setIstPlattformAdmin(!!plattformAdmin)
      pruefeFirmendatenFuer(data?.role ?? null, !!plattformAdmin, data?.unternehmen_id ?? null)
      if (data?.unternehmen_id) {
        supabase
          .from('unternehmen')
          .select('paket')
          .eq('id', data.unternehmen_id)
          .single()
          .then(({ data: firma }) => setPaket((firma?.paket as Paket | undefined) ?? null))
      }
    })
    supabase
      .from('nutzer_modul_sperren')
      .select('modul')
      .eq('user_id', userId)
      .then(({ data }) => setGesperrteModule(new Set((data ?? []).map((r) => r.modul))))

    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (data && data.nextLevel === 'aal2' && data.currentLevel !== data.nextLevel) {
        setMfaPending(true)
        supabase.auth.mfa.listFactors().then(({ data: factorData }) => {
          setMfaFactorId(factorData?.totp[0]?.id ?? null)
        })
      } else {
        setMfaPending(false)
        setMfaFactorId(null)
        // Geraet nur bei vollstaendig abgeschlossener Anmeldung (kein
        // ausstehender zweiter Faktor) in die Liste eintragen/aktualisieren.
        geraetEintragen(userId)
      }
    })
  }, [session?.user.id])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    // Eigenen Geraete-Eintrag entfernen, solange die Sitzung noch gilt (RLS).
    const userId = session?.user.id
    if (userId) await supabase.from('nutzer_sitzungen').delete().eq('user_id', userId).eq('geraet_kennung', geraetKennung())
    await supabase.auth.signOut()
  }

  const bestaetigeMfaCode = async (code: string) => {
    if (!mfaFactorId) return { error: 'Kein zweiter Faktor eingerichtet.' }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code })
    if (error) return { error: error.message }
    setMfaPending(false)
    const userId = session?.user.id
    if (userId) {
      await geraetEintragen(userId)
    }
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
        mfaFactorId,
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
