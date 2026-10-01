import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { geraetKennung } from '../lib/geraet'
import { formatDatum } from '../lib/datum'
import type { NutzerSitzung } from '../types/database'

export function AngemeldeteGeraete() {
  const { user } = useAuth()
  const [sitzungen, setSitzungen] = useState<NutzerSitzung[]>([])
  const [loading, setLoading] = useState(true)
  const [abmeldend, setAbmeldend] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const diesesGeraet = geraetKennung()

  const laden = async () => {
    if (!user) return
    setLoading(true)
    // Nur Geraete mit noch gueltiger Auth-Sitzung, raeumt veraltete Eintraege auf (Migration 0056).
    const { data } = await supabase.rpc('meine_aktiven_geraete')
    setSitzungen(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    laden()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const alleAnderenAbmelden = async () => {
    if (!user) return
    if (!window.confirm('Auf allen anderen Geräten abmelden? Dort muss danach erneut eingeloggt werden.')) return
    setFehler(null)
    setAbmeldend(true)
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    if (error) {
      setAbmeldend(false)
      setFehler(error.message)
      return
    }
    await supabase.from('nutzer_sitzungen').delete().eq('user_id', user.id).neq('geraet_kennung', diesesGeraet)
    setAbmeldend(false)
    laden()
  }

  if (loading) return <p className="text-sm text-text-muted">Lädt…</p>

  return (
    <div className="space-y-3">
      {fehler && <p className="banner-error">Fehler: {fehler}</p>}
      {sitzungen.length === 0 ? (
        <p className="text-sm text-text-muted">Keine Geräte-Informationen vorhanden.</p>
      ) : (
        <ul className="space-y-1.5">
          {sitzungen.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-hover px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-text">{s.geraet_name}</span>
              <span className="flex flex-shrink-0 items-center gap-2 text-xs text-text-subtle">
                {s.geraet_kennung === diesesGeraet && (
                  <span className="rounded-full bg-brand-soft px-1.5 py-0.5 font-medium text-brand-text">Dieses Gerät</span>
                )}
                zuletzt {formatDatum(s.letzter_zugriff)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {sitzungen.length > 1 && (
        <button onClick={alleAnderenAbmelden} disabled={abmeldend} className="btn-secondary">
          {abmeldend ? 'Meldet ab…' : 'Von allen anderen Geräten abmelden'}
        </button>
      )}
    </div>
  )
}
