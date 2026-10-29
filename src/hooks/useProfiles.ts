import { useEffect, useState } from 'react'
import { backend } from '../lib/backend'
import type { Profile } from '../types/database'

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([])

  useEffect(() => {
    backend
      .from('profiles')
      .select('*')
      .then(({ data }) => setProfiles(data ?? []))
  }, [])

  const nameOf = (id: string | null) => {
    if (!id) return '—'
    return profiles.find((p) => p.id === id)?.full_name ?? 'Unbekannt'
  }

  return { profiles, nameOf }
}
