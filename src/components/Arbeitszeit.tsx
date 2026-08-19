import { useEffect, useState, type ChangeEvent } from 'react'
import { supabase, getSignedUrl, uploadFile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { SignedImage } from './SignedImage'
import { formatDatum } from '../lib/datum'
import { komprimiereBild } from '../lib/bildKompression'
import type { Mangel, Zeiterfassung } from '../types/database'

function minutenVonZeit(zeit: string) {
  const [h, m] = zeit.split(':').map(Number)
  return h * 60 + m
}

function eintragMinuten(z: Zeiterfassung, jetzt: number) {
  if (z.end_zeit) {
    return Math.max(0, minutenVonZeit(z.end_zeit) - minutenVonZeit(z.start_zeit) - z.pause_minuten)
  }
  const start = new Date(`${z.datum}T${z.start_zeit}`).getTime()
  return Math.max(0, Math.round((jetzt - start) / 60_000))
}

function formatDauer(minuten: number) {
  const h = Math.floor(minuten / 60)
  const m = minuten % 60
  return `${h}h ${m}min`
}

export function Arbeitszeit({ mangel, onChange }: { mangel: Mangel; onChange?: () => void }) {
  const { user, role } = useAuth()
  const kannBearbeiten = role !== 'kunde'
  const [zeiten, setZeiten] = useState<Zeiterfassung[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [jetzt, setJetzt] = useState(() => Date.now())
  const [fehler, setFehler] = useState<string | null>(null)

  const [stoppFotoOffen, setStoppFotoOffen] = useState(false)
  const [stoppFoto, setStoppFoto] = useState<File | null>(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('zeiterfassung')
      .select('*')
      .eq('mangel_id', mangel.id)
      .order('datum')
      .order('start_zeit')
    setZeiten(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mangel.id])

  const laeuftGerade = zeiten.some((z) => !z.end_zeit)

  useEffect(() => {
    if (!laeuftGerade) return
    const interval = setInterval(() => setJetzt(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [laeuftGerade])

  const handleStart = async () => {
    if (!user) return
    setFehler(null)
    setSaving(true)
    const jetztDate = new Date()
    const { error } = await supabase.from('zeiterfassung').insert({
      baustelle_id: mangel.baustelle_id,
      user_id: user.id,
      mangel_id: mangel.id,
      datum: jetztDate.toISOString().slice(0, 10),
      start_zeit: jetztDate.toTimeString().slice(0, 8),
      taetigkeit: mangel.titel,
    })
    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    load()
    onChange?.()
  }

  const handleStop = async (eintragId: string) => {
    if (!stoppFoto) return
    setFehler(null)
    setSaving(true)

    const stoppFotoKomprimiert = await komprimiereBild(stoppFoto)
    const path = `zeiterfassung/${mangel.id}/${Date.now()}-${stoppFotoKomprimiert.name}`
    const { error: uploadError } = await uploadFile('mangel-fotos', path, stoppFotoKomprimiert)
    if (uploadError) {
      setSaving(false)
      setFehler(`Foto-Upload fehlgeschlagen: ${uploadError.message}`)
      return
    }

    const { error } = await supabase
      .from('zeiterfassung')
      .update({ end_zeit: new Date().toTimeString().slice(0, 8), foto_pfad: path })
      .eq('id', eintragId)
    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setStoppFotoOffen(false)
    setStoppFoto(null)
    load()
    onChange?.()
  }

  const meinOffenerEintrag = zeiten.find((z) => z.user_id === user?.id && !z.end_zeit)
  const gesamtMinuten = zeiten.reduce((summe, z) => summe + eintragMinuten(z, jetzt), 0)
  const fotos = zeiten.filter((z) => z.foto_pfad)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-text">Arbeitszeit</h3>
        {!loading && <span className="text-xs text-text-subtle">Gesamt: {formatDauer(gesamtMinuten)}</span>}
      </div>
      {fehler && <p className="banner-error mb-2">Fehler: {fehler}</p>}
      {kannBearbeiten &&
        !loading &&
        (meinOffenerEintrag ? (
          stoppFotoOffen ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <label className="field-label">Foto vom IST-Stand (Pflicht zum Stoppen)</label>
              <label className="btn-secondary w-full cursor-pointer">
                <span className="truncate">{stoppFoto ? `📷 ${stoppFoto.name}` : '📷 Foto aufnehmen/auswählen'}</span>
                <input
                  type="file"
                  required
                  accept="image/*"
                  capture="environment"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setStoppFoto(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!stoppFoto || saving}
                  onClick={() => handleStop(meinOffenerEintrag.id)}
                  className="btn-primary flex-1"
                >
                  {saving ? 'Speichert…' : 'Stopp bestätigen'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setStoppFotoOffen(false)
                    setStoppFoto(null)
                  }}
                  className="btn-secondary"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => setStoppFotoOffen(true)}
              className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              ⏸ Stopp ({formatDauer(eintragMinuten(meinOffenerEintrag, jetzt))})
            </button>
          )
        ) : (
          <button type="button" disabled={saving} onClick={handleStart} className="btn-primary w-full">
            ▶ Start
          </button>
        ))}

      {fotos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {fotos.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={async () => {
                const { url } = await getSignedUrl('mangel-fotos', z.foto_pfad!)
                if (url) window.open(url, '_blank', 'noreferrer')
              }}
              title={`IST-Stand vom ${formatDatum(z.datum)}`}
            >
              <SignedImage
                bucket="mangel-fotos"
                path={z.foto_pfad!}
                alt="IST-Stand"
                className="h-14 w-14 rounded-lg object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
