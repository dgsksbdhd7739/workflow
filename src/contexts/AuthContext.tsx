import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
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
      return
    }
    supabase
      .from('profiles')
      .select('role, muss_passwort_aendern, onboarding_gesehen, unternehmen_id')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        setRole(data?.role ?? null)
        setUnternehmenId(data?.unternehmen_id ?? null)
        setMussPasswortAendern(data?.muss_passwort_aendern ?? false)
        setOnboardingGesehen(data?.onboarding_gesehen ?? true)
      })
  }, [session?.user.id])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
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
