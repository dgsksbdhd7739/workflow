import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { ProjektForm } from '../components/ProjektForm'
import { SignedImage } from '../components/SignedImage'
import { formatProjektAdresse } from '../lib/adresse'
import type { Baustelle, Rolle, Tagesbericht, Termin } from '../types/database'

const heute = () => new Date().toISOString().slice(0, 10)
const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

const quickLinks: { to: string; label: string; icon: string; roles?: Rolle[] }[] = [
  { to: 'maengel', label: 'Mängel', icon: '⚠️' },
  { to: 'plaene', label: 'Pläne', icon: '🗺️' },
  { to: 'tagesberichte', label: 'Tagesberichte', icon: '📋' },
  { to: 'zeiterfassung', label: 'Zeiterfassung', icon: '⏱️', roles: ['admin', 'planer', 'techniker'] },
  { to: 'termine', label: 'Termine', icon: '📅' },
  { to: 'kalkulation', label: 'Kalkulation', icon: '💶', roles: ['admin', 'planer'] },
]

export function ProjektDashboard() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const { role } = useAuth()
  const kannKalkulationSehen = role === 'admin' || role === 'planer'
  const kannBearbeiten = role === 'admin' || role === 'planer'
  const { nameOf } = useProfiles()
  const [baustelle, setBaustelle] = useState<Baustelle | null>(null)
  const [bearbeiten, setBearbeiten] = useState(false)
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

  if (loading) return <p className="p-6 text-sm text-text-muted">Lädt…</p>

  const ueberfaellig = termine.filter((t) => t.status !== 'abgeschlossen' && t.end_datum < heute())
  const naechste = termine
    .filter((t) => t.status !== 'abgeschlossen')
    .sort((a, b) => a.start_datum.localeCompare(b.start_datum))
    .slice(0, 3)

  if (bearbeiten && baustelle) {
    return (
      <div className="page">
        <h1 className="mb-4 text-xl font-semibold text-text">Projekt bearbeiten</h1>
        <ProjektForm
          baustelle={baustelle}
          onSaved={(saved) => {
            setBaustelle(saved)
            setBearbeiten(false)
          }}
          onCancel={() => setBearbeiten(false)}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {baustelle?.logo_pfad && (
            <SignedImage
              bucket="projekt-logos"
              path={baustelle.logo_pfad}
              alt=""
              className="h-14 w-14 flex-shrink-0 rounded-lg object-cover"
            />
          )}
          <div>
            <h1 className="text-xl font-semibold text-text">{baustelle?.name}</h1>
            {baustelle && formatProjektAdresse(baustelle) && (
              <p className="text-sm text-text-muted">{formatProjektAdresse(baustelle)}</p>
            )}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-subtle">
              {baustelle?.projektnummer && <span>Nr. {baustelle.projektnummer}</span>}
              {baustelle?.kunde_name && <span>Kunde: {baustelle.kunde_name}</span>}
              {baustelle?.projektleiter_id && <span>PL: {nameOf(baustelle.projektleiter_id)}</span>}
              {baustelle?.bauleitender_obermonteur_id && (
                <span>Obermonteur: {nameOf(baustelle.bauleitender_obermonteur_id)}</span>
              )}
            </div>
          </div>
        </div>
        {kannBearbeiten && (
          <button onClick={() => setBearbeiten(true)} className="btn-secondary flex-shrink-0">
            Projekt bearbeiten
          </button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-2xl font-semibold text-text">{offeneMaengel}</div>
          <div className="text-xs text-text-muted">Offene Mängel</div>
          {hochPrioMaengel > 0 && (
            <div className="mt-1 text-xs text-red-600 dark:text-red-400">{hochPrioMaengel} hoch priorisiert</div>
          )}
        </div>
        <div className="card p-4">
          <div className="text-2xl font-semibold text-text">{ueberfaellig.length}</div>
          <div className="text-xs text-text-muted">Verzögerte Termine</div>
        </div>
        {kannKalkulationSehen && (
          <div className="card p-4">
            <div className="text-2xl font-semibold text-text">{euro(kalkulationSumme)}</div>
            <div className="text-xs text-text-muted">Kalkulationssumme</div>
          </div>
        )}
      </div>

      {(naechste.length > 0 || ueberfaellig.length > 0) && (
        <div className="card mb-6 p-4">
          <h2 className="mb-2 text-sm font-medium text-text">Termine</h2>
          <ul className="space-y-1.5 text-sm">
            {ueberfaellig.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-red-700 dark:text-red-400">
                <span>{t.titel}</span>
                <span>bis {t.end_datum} — verzögert</span>
              </li>
            ))}
            {naechste
              .filter((t) => !ueberfaellig.includes(t))
              .map((t) => (
                <li key={t.id} className="flex items-center justify-between text-text">
                  <span>{t.titel}</span>
                  <span className="text-text-muted">
                    {t.start_datum} – {t.end_datum}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {letzterBericht && (
        <div className="card mb-6 p-4">
          <h2 className="mb-1 text-sm font-medium text-text">Letzter Tagesbericht</h2>
          <p className="text-sm text-text-muted">
            {letzterBericht.datum}
            {letzterBericht.wetter && ` · ${letzterBericht.wetter}`}
            {letzterBericht.personal_anzahl !== null && ` · ${letzterBericht.personal_anzahl} Personal`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {quickLinks
          .filter((l) => !l.roles || (role && l.roles.includes(role)))
          .map((l) => (
          <Link
            key={l.to}
            to={`/baustellen/${baustelleId}/${l.to}`}
            className="card flex flex-col items-center gap-1 p-4 text-center transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
          >
            <span className="text-xl">{l.icon}</span>
            <span className="text-sm font-medium text-text">{l.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
