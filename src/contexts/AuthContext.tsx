import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Rolle } from '../types/database'

interface AuthContextValue {
  user: User | null
  session: Session | null
  role: Rolle | null
  mussPasswortAendern: boolean
  setMussPasswortAendern: (v: boolean) => void
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Rolle | null>(null)
  const [mussPasswortAendern, setMussPasswortAendern] = useState(false)
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
      setMussPasswortAendern(false)
      return
    }
    supabase
      .from('profiles')
      .select('role, muss_passwort_aendern')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        setRole(data?.role ?? null)
        setMussPasswortAendern(data?.muss_passwort_aendern ?? false)
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
      value={{ user: session?.user ?? null, session, role, mussPasswortAendern, setMussPasswortAendern, loading, signIn, signOut }}
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
