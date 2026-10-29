// "Aus Plaenen aufbauen": liest die Grundriss-PDFs des Projekts aus (siehe
// src/lib/planAnalyse.ts) und legt daraus Geschosse mit echtem Umriss,
// Planbild und Einheiten an bzw. aktualisiert vorhandene.

import { useState } from 'react'
import { FileScan } from 'lucide-react'
import type { PDFPageProxy } from 'pdfjs-dist'
import { backend, dateienLoeschen, uploadFile } from '../lib/backend'
import { pdfDokument } from '../lib/pdfLaden'
import { type SeitenAnalyse, gebaeudeZusammensetzen, grundrissBild, seiteAnalysieren } from '../lib/planAnalyse'
import { geschossName } from '../lib/gebaeude3d'
import type { Einheit, Gebaeude, Geschoss, Plan } from '../types/database'

interface Props {
  projektId: string
  gebaeude: Gebaeude
  geschosse: Geschoss[]
  einheiten: Einheit[]
  onFertig: () => Promise<void> | void
}

interface Kandidat extends SeitenAnalyse {
  schluessel: string
  plan: Plan
  planName: string
  pdfSeite: PDFPageProxy
  gewaehlteEbene: number | null
  uebernehmen: boolean
}

const EBENEN = Array.from({ length: 24 }, (_, i) => i - 4)

function ebeneText(ebene: number) {
  if (ebene < 0) return `${-ebene}. UG`
  if (ebene === 0) return 'EG'
  return `${ebene}. OG`
}

export function PlanAufbau({ projektId, gebaeude, geschosse, einheiten, onFertig }: Props) {
  const [offen, setOffen] = useState(false)
  const [kandidaten, setKandidaten] = useState<Kandidat[] | null>(null)
  const [fortschritt, setFortschritt] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const auswerten = async () => {
    setFehler(null)
    setKandidaten(null)
    setFortschritt('Pläne werden geladen…')
    try {
      const { data, error } = await backend.from('plaene').select('*').eq('projekt_id', projektId).order('erstellt_am')
      if (error) throw new Error(error.message)
      const plaene = ((data ?? []) as Plan[]).filter((p) => /\.pdf$/i.test(p.datei_pfad))
      if (!plaene.length) throw new Error('In diesem Projekt sind keine PDF-Pläne hochgeladen.')

      // Jede Seite jeder Datei genau einmal; Name des Plans, der auf diese Seite zeigt
      const dateien = [...new Set(plaene.map((p) => p.datei_pfad))]
      const aufgaben: { plan: Plan; planName: string; datei: string; seite: number }[] = []
      for (const datei of dateien) {
        const dokument = await pdfDokument('plaene', datei)
        const eigene = plaene.filter((p) => p.datei_pfad === datei)
        for (let seite = 1; seite <= Math.min(dokument.numPages, 30); seite++) {
          const plan = eigene.find((p) => (p.seite ?? 1) === seite)
          aufgaben.push({ plan: plan ?? eigene[0], planName: plan?.name ?? '', datei, seite })
        }
      }

      const ergebnis: Kandidat[] = []
      for (const [i, a] of aufgaben.entries()) {
        setFortschritt(`Seite ${i + 1} von ${aufgaben.length} wird ausgewertet…`)
        const dokument = await pdfDokument('plaene', a.datei)
        const pdfSeite = await dokument.getPage(a.seite)
        const analyse = await seiteAnalysieren(pdfSeite, a.planName || null)
        ergebnis.push({
          ...analyse,
          schluessel: `${a.datei}#${a.seite}`,
          plan: a.plan,
          planName: a.planName || a.plan.name,
          pdfSeite,
          gewaehlteEbene: analyse.ebene,
          uebernehmen: false,
        })
      }
      // Je Ebene die erste Seite mit Umriss vorschlagen
      const vergeben = new Set<number>()
      for (const k of ergebnis) {
        if (k.ebene !== null && !vergeben.has(k.ebene)) {
          k.uebernehmen = true
          vergeben.add(k.ebene)
        }
      }
      setKandidaten(ergebnis)
      setFortschritt(null)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Auswertung fehlgeschlagen.')
      setFortschritt(null)
    }
  }

  const aendern = (schluessel: string, aenderung: Partial<Kandidat>) =>
    setKandidaten((liste) => liste?.map((k) => (k.schluessel === schluessel ? { ...k, ...aenderung } : k)) ?? null)

  const gewaehlt = (kandidaten ?? []).filter((k) => k.uebernehmen && k.gewaehlteEbene !== null)
  const doppelt = new Set(
    gewaehlt.map((k) => k.gewaehlteEbene).filter((e, i, alle) => alle.indexOf(e) !== i),
  )

  const aufbauen = async () => {
    if (!gewaehlt.length || doppelt.size) return
    setFehler(null)
    try {
      const { etagen, breite, tiefe } = gebaeudeZusammensetzen(gewaehlt.map((k) => ({ ...k, ebene: k.gewaehlteEbene! })))
      const ug = new Set([...geschosse.filter((g) => g.ebene < 0).map((g) => g.ebene), ...etagen.filter((e) => e.ebene < 0).map((e) => e.ebene)]).size

      for (const [i, etage] of etagen.entries()) {
        const k = gewaehlt.find((x) => x.gewaehlteEbene === etage.ebene)!
        const name = ebeneText(etage.ebene)
        setFortschritt(`${name} wird angelegt (${i + 1} von ${etagen.length})…`)

        let bildPfad: string | null = null
        let bildLage = null
        if (etage.umriss) {
          const imBlatt = etage.umriss.map(([x, z]): [number, number] => [x + etage.blattVersatz.x, z + etage.blattVersatz.z])
          const { bild, lage } = await grundrissBild(k.pdfSeite, k.massstab, imBlatt)
          if (bild) {
            const datei = new File([bild], `grundriss-${name.replace(/\W+/g, '')}.webp`, { type: 'image/webp' })
            const hochgeladen = await uploadFile('plaene', `${projektId}/grundrisse`, datei)
            if (hochgeladen.error) throw new Error(hochgeladen.error)
            bildPfad = hochgeladen.path
            const r = (v: number) => Math.round(v * 100) / 100
            // blatt_x/blatt_z: dieselbe Ecke in Blatt-Metern -- zum scharfen Nachzeichnen aus der PDF beim Heranzoomen
            bildLage = { x: r(lage.x - etage.blattVersatz.x), z: r(lage.z - etage.blattVersatz.z), breite: r(lage.breite), tiefe: r(lage.tiefe), blatt_x: r(lage.x), blatt_z: r(lage.z) }
          }
        }

        const werte = {
          plan_id: k.plan.id,
          plan_seite: k.seite,
          grundriss: etage.umriss,
          plan_bild_pfad: bildPfad,
          plan_bild_lage: bildLage,
          massstab: k.massstab,
          raeume: etage.raeume.length ? etage.raeume : null,
          waende: etage.waende?.rechtecke.length ? etage.waende : null,
        }
        const vorhanden = geschosse.find((g) => g.ebene === etage.ebene)
        let geschossId: string
        if (vorhanden) {
          const { error } = await backend.from('geschosse').update(werte).eq('id', vorhanden.id)
          if (error) throw new Error(error.message)
          if (vorhanden.plan_bild_pfad) await dateienLoeschen('plaene', [vorhanden.plan_bild_pfad])
          geschossId = vorhanden.id
        } else {
          const { data, error } = await backend
            .from('geschosse')
            .insert({ gebaeude_id: gebaeude.id, projekt_id: projektId, name: geschossName(etage.ebene, ug), ebene: etage.ebene, ...werte })
            .select()
            .single()
          if (error) throw new Error(error.message)
          geschossId = (data as Geschoss).id
        }

        // Einheiten: vorhandene (gleicher Name) bekommen ihre Lage, neue werden angelegt
        const bestand = einheiten.filter((e) => e.geschoss_id === geschossId)
        const neu = []
        for (const [j, e] of etage.einheiten.entries()) {
          const gleich = bestand.find((b) => b.name === e.name)
          if (gleich) {
            const { error } = await backend.from('einheiten').update({ lage_x: e.x, lage_z: e.z }).eq('id', gleich.id)
            if (error) throw new Error(error.message)
          } else {
            neu.push({ geschoss_id: geschossId, projekt_id: projektId, name: e.name, art: 'wohnung', reihenfolge: bestand.length + j, lage_x: e.x, lage_z: e.z })
          }
        }
        if (neu.length) {
          const { error } = await backend.from('einheiten').insert(neu)
          if (error) throw new Error(error.message)
        }
      }

      if (breite > 0) {
        const { error } = await backend.from('gebaeude').update({ breite_m: breite, tiefe_m: tiefe }).eq('id', gebaeude.id)
        if (error) throw new Error(error.message)
      }
      setFortschritt(null)
      setKandidaten(null)
      setOffen(false)
      await onFertig()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Aufbau fehlgeschlagen.')
      setFortschritt(null)
    }
  }

  if (!offen) {
    return (
      <button type="button" className="btn-secondary w-full" onClick={() => setOffen(true)}>
        <FileScan className="h-4 w-4" /> Aus Plänen aufbauen
      </button>
    )
  }

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
        <FileScan className="h-4 w-4 text-brand" /> Aus Plänen aufbauen
      </h2>
      <p className="mt-1 text-xs text-text-muted">
        Liest die Grundriss-PDFs dieses Projekts aus: Geschoss aus dem Plantitel, Maßstab, Außenumriss aus den Wänden, Zimmer- und
        Wohnungsnummern und das Achsraster, über das die Etagen übereinandergelegt werden. Vorhandene Etagen und Einheiten bleiben
        erhalten und werden ergänzt.
      </p>

      {fehler && <p className="banner-error mt-3">{fehler}</p>}
      {fortschritt && <p className="mt-3 text-sm text-text-muted">{fortschritt}</p>}

      {!kandidaten && !fortschritt && (
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn-primary flex-1" onClick={auswerten}>
            Pläne auswerten
          </button>
          <button type="button" className="btn-ghost" onClick={() => setOffen(false)}>
            Abbrechen
          </button>
        </div>
      )}

      {kandidaten && !fortschritt && (
        <>
          <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
            {kandidaten.map((k) => (
              <li key={k.schluessel} className={`rounded-lg border px-2.5 py-2 text-xs ${k.uebernehmen ? 'border-brand/40 bg-brand-soft/40' : 'border-border'}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={k.uebernehmen}
                    disabled={k.gewaehlteEbene === null}
                    onChange={(e) => aendern(k.schluessel, { uebernehmen: e.target.checked })}
                    aria-label={`Seite ${k.seite} übernehmen`}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-text" title={k.planName}>
                    {k.planName} · S. {k.seite}
                  </span>
                  <select
                    className="field-input h-7 w-24 py-0 text-xs"
                    value={k.gewaehlteEbene ?? ''}
                    onChange={(e) => {
                      const ebene = e.target.value === '' ? null : Number(e.target.value)
                      aendern(k.schluessel, { gewaehlteEbene: ebene, uebernehmen: ebene !== null })
                    }}
                  >
                    <option value="">kein Grundriss</option>
                    {EBENEN.map((e) => (
                      <option key={e} value={e}>
                        {ebeneText(e)}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 pl-6 text-text-muted">
                  {k.titel ? `„${k.titel}“` : 'kein Plantitel erkannt'} · 1:{k.massstab}
                  {k.massstabErkannt ? '' : ' (angenommen)'} · {k.umriss ? `Umriss ${Math.round(k.flaecheM2)} m²` : 'kein Umriss'} ·{' '}
                  {k.einheiten.length} Einheit{k.einheiten.length === 1 ? '' : 'en'}
                </p>
                {k.uebernehmen && k.gewaehlteEbene !== null && doppelt.has(k.gewaehlteEbene) && (
                  <p className="mt-1 pl-6 font-medium text-red-600 dark:text-red-400">Diese Etage ist mehrfach gewählt.</p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-text-subtle">
            Etagen ohne erkennbaren Umriss (z. B. Dachraum) übernehmen den Umriss der Etage darunter.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-primary flex-1" disabled={!gewaehlt.length || doppelt.size > 0} onClick={aufbauen}>
              {gewaehlt.length} Etage{gewaehlt.length === 1 ? '' : 'n'} aufbauen
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setKandidaten(null)
                setOffen(false)
              }}
            >
              Abbrechen
            </button>
          </div>
        </>
      )}
    </section>
  )
}
