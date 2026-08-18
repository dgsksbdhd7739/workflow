import { useEffect, useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { MaterialStamm as MaterialStammTyp } from '../types/database'

export function MaterialStamm() {
  const { user, role, unternehmenId } = useAuth()
  const [material, setMaterial] = useState<MaterialStammTyp[]>([])
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)

  const [neueBezeichnung, setNeueBezeichnung] = useState('')
  const [neueEinheit, setNeueEinheit] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!unternehmenId) return
    setLoading(true)
    const { data } = await supabase
      .from('material_stamm')
      .select('*')
      .eq('unternehmen_id', unternehmenId)
      .order('bezeichnung')
    setMaterial(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unternehmenId])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !unternehmenId || !neueBezeichnung.trim()) return
    setSaving(true)
    setFehler(null)
    const { error } = await supabase.from('material_stamm').insert({
      unternehmen_id: unternehmenId,
      bezeichnung: neueBezeichnung.trim(),
      einheit: neueEinheit.trim() || null,
      erstellt_von: user.id,
    })
    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setNeueBezeichnung('')
    setNeueEinheit('')
    load()
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Diesen Materialstamm-Eintrag wirklich löschen?')) return
    setMaterial((prev) => prev.filter((m) => m.id !== id))
    const { error } = await supabase.from('material_stamm').delete().eq('id', id)
    if (error) {
      setFehler(error.message)
      load()
    }
  }

  if (role && role !== 'admin' && role !== 'planer') {
    return (
      <div className="page">
        <p className="text-sm text-text-muted">Kein Zugriff — der Materialstamm ist Admin und Planer vorbehalten.</p>
      </div>
    )
  }

  return (
    <div className="page max-w-2xl">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-text">Materialstamm</h1>
        <p className="text-xs text-text-muted">
          Feste Materialien für dein Unternehmen, unabhängig von einzelnen Projekten. In den Aufgaben eines Projekts
          kann daraus Material ausgewählt und zugeordnet werden.
        </p>
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      <form onSubmit={handleCreate} className="card mb-4 flex flex-wrap gap-2 p-4">
        <input
          value={neueBezeichnung}
          onChange={(e) => setNeueBezeichnung(e.target.value)}
          placeholder="Material, z. B. Zylinderschloss"
          className="field-input min-w-[10rem] flex-1"
        />
        <input
          value={neueEinheit}
          onChange={(e) => setNeueEinheit(e.target.value)}
          placeholder="Einheit (Stk., m, kg …)"
          className="field-input w-40"
        />
        <button type="submit" disabled={saving} className="btn-primary flex-shrink-0">
          {saving ? 'Speichert…' : '+ Anlegen'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : material.length === 0 ? (
        <p className="text-sm text-text-muted">Noch kein Material im Stamm angelegt.</p>
      ) : (
        <ul className="space-y-1.5">
          {material.map((m) => (
            <li key={m.id} className="card flex items-center justify-between gap-3 p-3 text-sm">
              <span className="min-w-0 truncate text-text">
                {m.bezeichnung}
                {m.einheit && <span className="ml-1 text-xs text-text-subtle">({m.einheit})</span>}
              </span>
              <button
                onClick={() => handleDelete(m.id)}
                aria-label="Löschen"
                className="flex-shrink-0 text-text-subtle hover:text-red-600 dark:hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
