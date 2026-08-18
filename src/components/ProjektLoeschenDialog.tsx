import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Baustelle } from '../types/database'

export function ProjektLoeschenDialog({
  baustelle,
  onDeleted,
  onCancel,
}: {
  baustelle: Baustelle
  onDeleted: () => void
  onCancel: () => void
}) {
  const [eingabe, setEingabe] = useState('')
  const [loescht, setLoescht] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const stimmtUeberein = eingabe.trim() === baustelle.name

  const handleDelete = async () => {
    if (!stimmtUeberein) return
    setLoescht(true)
    setFehler(null)
    const { error } = await supabase.from('baustellen').delete().eq('id', baustelle.id)
    setLoescht(false)
    if (error) {
      setFehler(error.message)
      return
    }
    onDeleted()
  }

  return (
    <div className="card space-y-3 border-red-200 p-4 dark:border-red-900/50">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" strokeWidth={2.25} />
        <div>
          <p className="text-sm font-semibold text-text">Projekt endgültig löschen</p>
          <p className="mt-1 text-xs text-text-muted">
            Alle Aufgaben, Pläne, Tagesberichte, Termine, Zeiterfassungen und Dokumente von „{baustelle.name}“ werden
            unwiderruflich gelöscht. Das kann nicht rückgängig gemacht werden.
          </p>
        </div>
      </div>
      {fehler && <p className="banner-error">Fehler: {fehler}</p>}
      <div>
        <label className="field-label">Zum Bestätigen Projektnamen eingeben: „{baustelle.name}“</label>
        <input autoFocus value={eingabe} onChange={(e) => setEingabe(e.target.value)} className="field-input" />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          disabled={!stimmtUeberein || loescht}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loescht ? 'Löscht…' : 'Endgültig löschen'}
        </button>
        <button onClick={onCancel} className="btn-secondary">
          Abbrechen
        </button>
      </div>
    </div>
  )
}
