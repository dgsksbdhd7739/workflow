import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { supabase, getSignedUrl } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { SignedImage } from './SignedImage'
import type { MangelKommentar, MangelPhase, MangelStatus } from '../types/database'

const statusLabel: Record<MangelStatus, string> = {
  offen: 'Offen',
  in_bearbeitung: 'In Bearbeitung',
  erledigt: 'Erledigt',
}

const statusColor: Record<MangelStatus, string> = {
  offen: 'border-red-400 bg-red-50',
  in_bearbeitung: 'border-amber-400 bg-amber-50',
  erledigt: 'border-green-400 bg-green-50',
}

const statusTextColor: Record<MangelStatus, string> = {
  offen: 'text-red-700',
  in_bearbeitung: 'text-amber-700',
  erledigt: 'text-green-700',
}

function relativZeit(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minuten = Math.floor(diffMs / 60_000)
  if (minuten < 1) return 'gerade eben'
  if (minuten < 60) return `vor ${minuten} Min.`
  const stunden = Math.floor(minuten / 60)
  if (stunden < 24) return `vor ${stunden} Std.`
  const tage = Math.floor(stunden / 24)
  return `vor ${tage} Tag${tage === 1 ? '' : 'en'}`
}

export function MangelDetails({ mangelId }: { mangelId: string }) {
  const { user } = useAuth()
  const { nameOf } = useProfiles()
  const [phasen, setPhasen] = useState<MangelPhase[]>([])
  const [kommentare, setKommentare] = useState<MangelKommentar[]>([])
  const [loading, setLoading] = useState(true)

  const [neuePhaseTitel, setNeuePhaseTitel] = useState('')
  const [phaseFormOffen, setPhaseFormOffen] = useState(false)
  const [phaseSaving, setPhaseSaving] = useState(false)

  const [kommentarText, setKommentarText] = useState('')
  const [kommentarFoto, setKommentarFoto] = useState<File | null>(null)
  const [kommentarSaving, setKommentarSaving] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const [{ data: phasenData }, { data: kommentareData }] = await Promise.all([
      supabase.from('mangel_phasen').select('*').eq('mangel_id', mangelId).order('reihenfolge'),
      supabase.from('mangel_kommentare').select('*').eq('mangel_id', mangelId).order('erstellt_am'),
    ])
    setPhasen(phasenData ?? [])
    setKommentare(kommentareData ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mangelId])

  const handlePhaseHinzufuegen = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !neuePhaseTitel.trim()) return
    setPhaseSaving(true)
    setFehler(null)
    const reihenfolge = phasen.length > 0 ? Math.max(...phasen.map((p) => p.reihenfolge)) + 1 : 1
    const { error } = await supabase.from('mangel_phasen').insert({
      mangel_id: mangelId,
      titel: neuePhaseTitel.trim(),
      reihenfolge,
      erstellt_von: user.id,
    })
    setPhaseSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setNeuePhaseTitel('')
    setPhaseFormOffen(false)
    load()
  }

  const updatePhaseStatus = async (phaseId: string, status: MangelStatus) => {
    setFehler(null)
    setPhasen((prev) => prev.map((p) => (p.id === phaseId ? { ...p, status } : p)))
    const { error } = await supabase.from('mangel_phasen').update({ status }).eq('id', phaseId)
    if (error) {
      setFehler(error.message)
      load()
    }
  }

  const deletePhase = async (phaseId: string) => {
    if (!window.confirm('Diese Baustufe wirklich löschen?')) return
    setFehler(null)
    setPhasen((prev) => prev.filter((p) => p.id !== phaseId))
    const { error } = await supabase.from('mangel_phasen').delete().eq('id', phaseId)
    if (error) {
      setFehler(error.message)
      load()
    }
  }

  const handleKommentarSenden = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || (!kommentarText.trim() && !kommentarFoto)) return
    setKommentarSaving(true)
    setFehler(null)

    let foto_pfad: string | null = null
    if (kommentarFoto) {
      const path = `kommentare/${mangelId}/${Date.now()}-${kommentarFoto.name}`
      const { error: uploadError } = await supabase.storage.from('mangel-fotos').upload(path, kommentarFoto)
      if (uploadError) {
        setKommentarSaving(false)
        setFehler(`Foto-Upload fehlgeschlagen: ${uploadError.message}`)
        return
      }
      foto_pfad = path
    }

    const { error } = await supabase.from('mangel_kommentare').insert({
      mangel_id: mangelId,
      text: kommentarText.trim() || null,
      foto_pfad,
      erstellt_von: user.id,
    })

    setKommentarSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setKommentarText('')
    setKommentarFoto(null)
    load()
  }

  if (loading) return <p className="text-sm text-gray-500">Lädt…</p>

  return (
    <div className="space-y-5">
      {fehler && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          Fehler: {fehler}
        </p>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Fortschritt</h3>
          <button
            onClick={() => setPhaseFormOffen((v) => !v)}
            className="text-xs font-medium text-blue-600"
          >
            {phaseFormOffen ? 'Abbrechen' : '+ Baustufe'}
          </button>
        </div>

        {phaseFormOffen && (
          <form onSubmit={handlePhaseHinzufuegen} className="mb-2 flex gap-2">
            <input
              autoFocus
              value={neuePhaseTitel}
              onChange={(e) => setNeuePhaseTitel(e.target.value)}
              placeholder="z. B. Verdrahtung"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={phaseSaving}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Hinzufügen
            </button>
          </form>
        )}

        {phasen.length === 0 ? (
          <p className="text-xs text-gray-400">Noch keine Baustufen erfasst.</p>
        ) : (
          <ul className="space-y-1.5">
            {phasen.map((p) => (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-2 rounded-lg border-l-4 px-3 py-2 ${statusColor[p.status]}`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">{p.titel}</div>
                  <div className={`text-xs italic ${statusTextColor[p.status]}`}>{statusLabel[p.status]}</div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <select
                    value={p.status}
                    onChange={(e) => updatePhaseStatus(p.id, e.target.value as MangelStatus)}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                  >
                    {(['offen', 'in_bearbeitung', 'erledigt'] as const).map((s) => (
                      <option key={s} value={s}>
                        {statusLabel[s]}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => deletePhase(p.id)} className="text-xs text-gray-400 hover:text-red-600">
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-900">Kommentare ({kommentare.length})</h3>

        {kommentare.length > 0 && (
          <ul className="mb-3 space-y-3">
            {kommentare.map((k) => (
              <li key={k.id} className="flex gap-2">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                  {nameOf(k.erstellt_von).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-gray-900">{nameOf(k.erstellt_von)}</span>
                    <span className="text-xs text-gray-400">{relativZeit(k.erstellt_am)}</span>
                  </div>
                  {k.text && <p className="mt-0.5 text-sm text-gray-700">{k.text}</p>}
                  {k.foto_pfad && (
                    <button
                      type="button"
                      onClick={async () => {
                        const { url } = await getSignedUrl('mangel-fotos', k.foto_pfad!)
                        if (url) window.open(url, '_blank', 'noreferrer')
                      }}
                    >
                      <SignedImage
                        bucket="mangel-fotos"
                        path={k.foto_pfad}
                        alt=""
                        className="mt-1 h-24 w-24 rounded-lg object-cover"
                      />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleKommentarSenden} className="space-y-2">
          <textarea
            value={kommentarText}
            onChange={(e) => setKommentarText(e.target.value)}
            rows={2}
            placeholder="Kommentar schreiben…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e: ChangeEvent<HTMLInputElement>) => setKommentarFoto(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
            <button
              type="submit"
              disabled={kommentarSaving || (!kommentarText.trim() && !kommentarFoto)}
              className="flex-shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {kommentarSaving ? 'Sendet…' : 'Kommentieren'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
