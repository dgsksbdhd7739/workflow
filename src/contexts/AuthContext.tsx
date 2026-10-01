import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { geraetKennung, geraetName } from '../lib/geraet'
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
      setMfaPending(false)
      setMfaFactorId(null)
      return
    }
    supabase
      .from('profiles')
      .select('role, muss_passwort_aendern, onboarding_gesehen, unternehmen_id, produkt_hinweise')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        setRole(data?.role ?? null)
        setUnternehmenId(data?.unternehmen_id ?? null)
        setMussPasswortAendern(data?.muss_passwort_aendern ?? false)
        setOnboardingGesehen(data?.onboarding_gesehen ?? true)
        setProduktHinweise(data?.produkt_hinweise ?? true)
      })
    supabase
      .from('nutzer_modul_sperren')
      .select('modul')
      .eq('user_id', userId)
      .then(({ data }) => setGesperrteModule(new Set((data ?? []).map((r) => r.modul))))
    supabase
      .from('plattform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => setIstPlattformAdmin(!!data))

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
        supabase
          .from('nutzer_sitzungen')
          .upsert(
            { user_id: userId, geraet_kennung: geraetKennung(), geraet_name: geraetName(), letzter_zugriff: new Date().toISOString() },
            { onConflict: 'user_id,geraet_kennung' },
          )
          .then(() => {})
      }
    })
  }, [session?.user.id])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const bestaetigeMfaCode = async (code: string) => {
    if (!mfaFactorId) return { error: 'Kein zweiter Faktor eingerichtet.' }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code })
    if (error) return { error: error.message }
    setMfaPending(false)
    const userId = session?.user.id
    if (userId) {
      await supabase
        .from('nutzer_sitzungen')
        .upsert(
          { user_id: userId, geraet_kennung: geraetKennung(), geraet_name: geraetName(), letzter_zugriff: new Date().toISOString() },
          { onConflict: 'user_id,geraet_kennung' },
        )
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
