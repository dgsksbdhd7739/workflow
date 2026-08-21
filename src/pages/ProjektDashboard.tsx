import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  FileText,
  History,
  ListChecks,
  Map as MapIcon,
  MapPin,
  Clock as ClockIcon,
  Package,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { ProjektForm } from '../components/ProjektForm'
import { SignedImage } from '../components/SignedImage'
import { formatProjektAdresse, kartenUrl } from '../lib/adresse'
import { formatDatum } from '../lib/datum'
import type { Projekt, Aufgabe, Rolle, Tagesbericht, Termin } from '../types/database'

const heute = () => new Date().toISOString().slice(0, 10)

function minutenVonZeit(zeit: string) {
  const [h, m] = zeit.split(':').map(Number)
  return h * 60 + m
}

function formatDauer(minuten: number) {
  const h = Math.floor(minuten / 60)
  const m = minuten % 60
  return `${h}h ${m}min`
}

const quickLinks: { to: string; label: string; icon: LucideIcon; roles?: Rolle[] }[] = [
  { to: 'aufgaben', label: 'Aufgaben', icon: ListChecks },
  { to: 'material', label: 'Material', icon: Package },
  { to: 'plaene', label: 'Pläne', icon: MapIcon },
  { to: 'dokumente', label: 'Dokumente', icon: FileText },
  { to: 'tagesberichte', label: 'Tagesberichte', icon: ClipboardList },
  { to: 'zeiterfassung', label: 'Zeiterfassung', icon: ClockIcon, roles: ['admin', 'planer', 'techniker'] },
  { to: 'termine', label: 'Termine', icon: CalendarDays },
]

type AktivitaetTyp = 'aufgabe' | 'termin' | 'bericht'

interface AktivitaetsEintrag {
  id: string
  typ: AktivitaetTyp
  label: string
  zeitpunkt: string
}

const aktivitaetIcon: Record<AktivitaetTyp, LucideIcon> = {
  aufgabe: ListChecks,
  termin: CalendarPlus,
  bericht: ClipboardList,
}

function relativeZeit(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minuten = Math.floor(diffMs / 60_000)
  if (minuten < 1) return 'gerade eben'
  if (minuten < 60) return `vor ${minuten} Min.`
  const stunden = Math.floor(minuten / 60)
  if (stunden < 24) return `vor ${stunden} Std.`
  const tage = Math.floor(stunden / 24)
  if (tage < 7) return `vor ${tage} Tag${tage === 1 ? '' : 'en'}`
  return formatDatum(iso)
}

export function ProjektDashboard() {
  const { id: projektId } = useParams<{ id: string }>()
  const { role } = useAuth()
  const kannZeitSehen = role !== 'kunde'
  const kannBearbeiten = role === 'admin' || role === 'planer'
  const { nameOf } = useProfiles()
  const [projekt, setProjekt] = useState<Projekt | null>(null)
  const [bearbeiten, setBearbeiten] = useState(false)
  const [offeneAufgaben, setOffeneAufgaben] = useState(0)
  const [hochPrioAufgaben, setHochPrioAufgaben] = useState(0)
  const [termine, setTermine] = useState<Termin[]>([])
  const [gestempelteMinuten, setGestempelteMinuten] = useState(0)
  const [letzterBericht, setLetzterBericht] = useState<Tagesbericht | null>(null)
  const [aktivitaeten, setAktivitaeten] = useState<AktivitaetsEintrag[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projektId) return
    setLoading(true)
    Promise.all([
      supabase.from('projekte').select('*').eq('id', projektId).single(),
      supabase.from('aufgaben').select('*', { count: 'exact', head: true }).eq('projekt_id', projektId).neq('status', 'erledigt'),
      supabase
        .from('aufgaben')
        .select('*', { count: 'exact', head: true })
        .eq('projekt_id', projektId)
        .neq('status', 'erledigt')
        .eq('prioritaet', 'hoch'),
      supabase.from('termine').select('*').eq('projekt_id', projektId).order('start_datum'),
      supabase.from('zeiterfassung').select('start_zeit, end_zeit, pause_minuten').eq('projekt_id', projektId),
      supabase.from('tagesberichte').select('*').eq('projekt_id', projektId).order('datum', { ascending: false }).limit(8),
      supabase
        .from('aufgaben')
        .select('id, titel, status, erstellt_am')
        .eq('projekt_id', projektId)
        .order('erstellt_am', { ascending: false })
        .limit(8),
      supabase
        .from('termine')
        .select('id, titel, erstellt_am')
        .eq('projekt_id', projektId)
        .order('erstellt_am', { ascending: false })
        .limit(8),
    ]).then(([projektRes, offeneRes, hochRes, termineRes, zeitenRes, berichteRes, aufgabenActRes, termineActRes]) => {
      setProjekt(projektRes.data)
      setOffeneAufgaben(offeneRes.count ?? 0)
      setHochPrioAufgaben(hochRes.count ?? 0)
      setTermine(termineRes.data ?? [])
      setGestempelteMinuten(
        (zeitenRes.data ?? []).reduce(
          (acc, z) =>
            z.end_zeit
              ? acc + Math.max(0, minutenVonZeit(z.end_zeit) - minutenVonZeit(z.start_zeit) - z.pause_minuten)
              : acc,
          0,
        ),
      )
      setLetzterBericht(berichteRes.data?.[0] ?? null)

      const eintraege: AktivitaetsEintrag[] = [
        ...((aufgabenActRes.data ?? []) as Pick<Aufgabe, 'id' | 'titel' | 'status' | 'erstellt_am'>[]).map((m) => ({
          id: `aufgabe-${m.id}`,
          typ: 'aufgabe' as const,
          label: `Aufgabe „${m.titel}“ angelegt`,
          zeitpunkt: m.erstellt_am,
        })),
        ...(termineActRes.data ?? []).map((t) => ({
          id: `termin-${t.id}`,
          typ: 'termin' as const,
          label: `Termin „${t.titel}“ angelegt`,
          zeitpunkt: t.erstellt_am,
        })),
        ...(berichteRes.data ?? []).map((b) => ({
          id: `bericht-${b.id}`,
          typ: 'bericht' as const,
          label: `Tagesbericht vom ${formatDatum(b.datum)} erstellt`,
          zeitpunkt: b.erstellt_am,
        })),
      ]
        .sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt))
        .slice(0, 8)
      setAktivitaeten(eintraege)

      setLoading(false)
    })
  }, [projektId])

  const handleArchivToggle = async () => {
    if (!projekt) return
    const naechsterWert = !projekt.archiviert
    if (
      naechsterWert &&
      !window.confirm('Projekt wirklich archivieren? Es wird im Dashboard ausgeblendet, bleibt aber mit allen Daten erhalten.')
    ) {
      return
    }
    const { error } = await supabase.from('projekte').update({ archiviert: naechsterWert }).eq('id', projekt.id)
    if (!error) setProjekt({ ...projekt, archiviert: naechsterWert })
  }

  if (loading) return <p className="p-6 text-sm text-text-muted">Lädt…</p>

  const ueberfaellig = termine.filter((t) => t.status !== 'abgeschlossen' && t.end_datum < heute())
  const naechste = termine
    .filter((t) => t.status !== 'abgeschlossen')
    .sort((a, b) => a.start_datum.localeCompare(b.start_datum))
    .slice(0, 3)

  if (bearbeiten && projekt) {
    return (
      <div className="page">
        <h1 className="mb-4 text-xl font-semibold text-text">Projekt bearbeiten</h1>
        <ProjektForm
          projekt={projekt}
          onSaved={(saved) => {
            setProjekt(saved)
            setBearbeiten(false)
          }}
          onCancel={() => setBearbeiten(false)}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {projekt?.logo_pfad && (
            <SignedImage
              bucket="projekt-logos"
              path={projekt.logo_pfad}
              alt=""
              className="h-14 w-14 flex-shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-text">{projekt?.name}</h1>
              {projekt?.archiviert && (
                <span className="flex-shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-muted">
                  Archiviert
                </span>
              )}
            </div>
            {projekt && formatProjektAdresse(projekt) && (
              <a
                href={kartenUrl(formatProjektAdresse(projekt)!)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 truncate text-sm text-text-muted hover:text-brand hover:underline"
              >
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2.25} />
                <span className="truncate">{formatProjektAdresse(projekt)}</span>
              </a>
            )}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-subtle">
              {projekt?.projektnummer && <span>Nr. {projekt.projektnummer}</span>}
              {projekt?.kunde_name && <span>Kunde: {projekt.kunde_name}</span>}
              {projekt?.projektleiter_id && <span>PL: {nameOf(projekt.projektleiter_id)}</span>}
              {projekt?.bauleitender_obermonteur_id && (
                <span>Obermonteur: {nameOf(projekt.bauleitender_obermonteur_id)}</span>
              )}
            </div>
          </div>
        </div>
        {kannBearbeiten && (
          <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
            <button onClick={() => setBearbeiten(true)} className="btn-secondary">
              Projekt bearbeiten
            </button>
            <button onClick={handleArchivToggle} className="btn-secondary">
              {projekt?.archiviert ? 'Reaktivieren' : 'Archivieren'}
            </button>
          </div>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-2xl font-semibold text-text">{offeneAufgaben}</div>
          <div className="text-xs text-text-muted">Offene Aufgaben</div>
          {hochPrioAufgaben > 0 && (
            <div className="mt-1 text-xs text-red-600 dark:text-red-400">{hochPrioAufgaben} hoch priorisiert</div>
          )}
        </div>
        <div className="card p-4">
          <div className="text-2xl font-semibold text-text">{ueberfaellig.length}</div>
          <div className="text-xs text-text-muted">Verzögerte Termine</div>
        </div>
        {projekt?.projekt_ende && (
          <div className="card p-4">
            <div className="text-2xl font-semibold text-text">{formatDatum(projekt.projekt_ende)}</div>
            <div className="text-xs text-text-muted">Projekt fällig bis</div>
            {projekt.projekt_ende < heute() && (
              <div className="mt-1 text-xs text-red-600 dark:text-red-400">Überfällig</div>
            )}
          </div>
        )}
        {kannZeitSehen && (
          <div className="card p-4">
            <div className="text-2xl font-semibold text-text">{formatDauer(gestempelteMinuten)}</div>
            <div className="text-xs text-text-muted">Gestempelte Stunden</div>
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
                <span>bis {formatDatum(t.end_datum)} — verzögert</span>
              </li>
            ))}
            {naechste
              .filter((t) => !ueberfaellig.includes(t))
              .map((t) => (
                <li key={t.id} className="flex items-center justify-between text-text">
                  <span>{t.titel}</span>
                  <span className="text-text-muted">
                    {formatDatum(t.start_datum)} – {formatDatum(t.end_datum)}
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
            {formatDatum(letzterBericht.datum)}
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
            to={`/projekte/${projektId}/${l.to}`}
            className="card flex flex-col items-center gap-1 p-4 text-center transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
          >
            <l.icon className="h-5 w-5 text-brand" strokeWidth={2.25} />
            <span className="text-sm font-medium text-text">{l.label}</span>
          </Link>
        ))}
      </div>

      {aktivitaeten.length > 0 && (
        <div className="card mt-6 p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-text">
            <History className="h-4 w-4" strokeWidth={2.25} />
            Letzte Aktivität
          </h2>
          <ul className="space-y-3">
            {aktivitaeten.map((a) => {
              const Icon = aktivitaetIcon[a.typ]
              return (
                <li key={a.id} className="flex items-start gap-2.5 text-sm">
                  <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-hover text-text-muted">
                    <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-text">{a.label}</span>
                  </div>
                  <span className="flex-shrink-0 text-xs text-text-subtle">{relativeZeit(a.zeitpunkt)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
