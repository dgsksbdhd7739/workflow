import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Baustelle, Tagesbericht, Termin } from '../types/database'

const heute = () => new Date().toISOString().slice(0, 10)
const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

const quickLinks = [
  { to: 'maengel', label: 'Mängel', icon: '⚠️' },
  { to: 'plaene', label: 'Pläne', icon: '🗺️' },
  { to: 'tagesberichte', label: 'Tagesberichte', icon: '📋' },
  { to: 'zeiterfassung', label: 'Zeiterfassung', icon: '⏱️' },
  { to: 'termine', label: 'Termine', icon: '📅' },
  { to: 'kalkulation', label: 'Kalkulation', icon: '💶' },
]

export function ProjektDashboard() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const [baustelle, setBaustelle] = useState<Baustelle | null>(null)
  const [offeneMaengel, setOffeneMaengel] = useState(0)
  const [hochPrioMaengel, setHochPrioMaengel] = useState(0)
  const [termine, setTermine] = useState<Termin[]>([])
  const [kalkulationSumme, setKalkulationSumme] = useState(0)
  const [letzterBericht, setLetzterBericht] = useState<Tagesbericht | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!baustelleId) return
    setLoading(true)
    Promise.all([
      supabase.from('baustellen').select('*').eq('id', baustelleId).single(),
      supabase.from('maengel').select('*', { count: 'exact', head: true }).eq('baustelle_id', baustelleId).neq('status', 'erledigt'),
      supabase
        .from('maengel')
        .select('*', { count: 'exact', head: true })
        .eq('baustelle_id', baustelleId)
        .neq('status', 'erledigt')
        .eq('prioritaet', 'hoch'),
      supabase.from('termine').select('*').eq('baustelle_id', baustelleId).order('start_datum'),
      supabase.from('leistungen').select('menge, einzelpreis').eq('baustelle_id', baustelleId),
      supabase.from('tagesberichte').select('*').eq('baustelle_id', baustelleId).order('datum', { ascending: false }).limit(1),
    ]).then(([baustelleRes, offeneRes, hochRes, termineRes, leistungenRes, berichtRes]) => {
      setBaustelle(baustelleRes.data)
      setOffeneMaengel(offeneRes.count ?? 0)
      setHochPrioMaengel(hochRes.count ?? 0)
      setTermine(termineRes.data ?? [])
      setKalkulationSumme((leistungenRes.data ?? []).reduce((acc, l) => acc + l.menge * l.einzelpreis, 0))
      setLetzterBericht(berichtRes.data?.[0] ?? null)
      setLoading(false)
    })
  }, [baustelleId])

  if (loading) return <p className="p-6 text-sm text-gray-500">Lädt…</p>

  const ueberfaellig = termine.filter((t) => t.status !== 'abgeschlossen' && t.end_datum < heute())
  const naechste = termine
    .filter((t) => t.status !== 'abgeschlossen')
    .sort((a, b) => a.start_datum.localeCompare(b.start_datum))
    .slice(0, 3)

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold text-gray-900">{baustelle?.name}</h1>
      {baustelle?.adresse && <p className="mb-4 text-sm text-gray-500">{baustelle.adresse}</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-2xl font-semibold text-gray-900">{offeneMaengel}</div>
          <div className="text-xs text-gray-500">Offene Mängel</div>
          {hochPrioMaengel > 0 && <div className="mt-1 text-xs text-red-600">{hochPrioMaengel} hoch priorisiert</div>}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-2xl font-semibold text-gray-900">{ueberfaellig.length}</div>
          <div className="text-xs text-gray-500">Verzögerte Termine</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-2xl font-semibold text-gray-900">{euro(kalkulationSumme)}</div>
          <div className="text-xs text-gray-500">Kalkulationssumme</div>
        </div>
      </div>

      {(naechste.length > 0 || ueberfaellig.length > 0) && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium text-gray-900">Termine</h2>
          <ul className="space-y-1.5 text-sm">
            {ueberfaellig.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-red-700">
                <span>{t.titel}</span>
                <span>bis {t.end_datum} — verzögert</span>
              </li>
            ))}
            {naechste
              .filter((t) => !ueberfaellig.includes(t))
              .map((t) => (
                <li key={t.id} className="flex items-center justify-between text-gray-700">
                  <span>{t.titel}</span>
                  <span className="text-gray-500">
                    {t.start_datum} – {t.end_datum}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {letzterBericht && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-medium text-gray-900">Letzter Tagesbericht</h2>
          <p className="text-sm text-gray-600">
            {letzterBericht.datum}
            {letzterBericht.wetter && ` · ${letzterBericht.wetter}`}
            {letzterBericht.personal_anzahl !== null && ` · ${letzterBericht.personal_anzahl} Personal`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {quickLinks.map((l) => (
          <Link
            key={l.to}
            to={`/baustellen/${baustelleId}/${l.to}`}
            className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-white p-4 text-center hover:border-blue-300 hover:bg-blue-50/40"
          >
            <span className="text-xl">{l.icon}</span>
            <span className="text-sm font-medium text-gray-700">{l.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
