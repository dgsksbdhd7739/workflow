import { PDFDocument, PDFTextField, PDFCheckBox } from 'pdf-lib'
import { getSignedUrl } from './supabase'
import { formatDatum } from './datum'
import type { Projekt, Tagesbericht, TagesberichtTuer } from '../types/database'

/**
 * Fuellt eine hochgeladene PDF-Vorlage (mit AcroForm-Formularfeldern) anhand
 * ihres Feldnamens mit den Werten eines Tagesberichts. Erkannte Feldnamen
 * sind unten in `werteFuer` gelistet (Gross-/Kleinschreibung egal). Felder
 * ohne passenden Namen bleiben unveraendert; das Formular wird danach
 * geflattet (nicht mehr editierbar), damit der Export einer normalen PDF
 * entspricht.
 *
 * Gibt `null` zurueck, wenn die Vorlage keine Formularfelder enthaelt --
 * der Aufrufer faellt dann auf das eingebaute jsPDF-Layout zurueck.
 */
export async function fuelleTagesberichtVorlage(
  vorlagePfad: string,
  projekt: Projekt,
  bericht: Tagesbericht,
  tueren: TagesberichtTuer[],
  erstellerName: string,
): Promise<Uint8Array | null> {
  const { url, error } = await getSignedUrl('tagesbericht-vorlagen', vorlagePfad)
  if (!url) throw new Error(error ?? 'Vorlage konnte nicht geladen werden.')
  const bytes = await fetch(url).then((r) => r.arrayBuffer())
  const pdfDoc = await PDFDocument.load(bytes)
  const form = pdfDoc.getForm()
  const felder = form.getFields()
  if (felder.length === 0) return null

  const werteFuer: Record<string, string> = {
    projekt: projekt.name,
    projektname: projekt.name,
    projektnummer: projekt.projektnummer ?? '',
    datum: formatDatum(bericht.datum),
    personal: bericht.personal_anzahl != null ? String(bericht.personal_anzahl) : '',
    personal_anzahl: bericht.personal_anzahl != null ? String(bericht.personal_anzahl) : '',
    taetigkeiten: bericht.taetigkeiten ?? '',
    besonderheiten: bericht.besonderheiten ?? '',
    ersteller: erstellerName,
    tueren: tueren.map((t) => `${t.titel}: ${t.stand}`).join('\n'),
    fortschritt: tueren.map((t) => `${t.titel}: ${t.stand}`).join('\n'),
  }

  for (const feld of felder) {
    const name = feld.getName().toLowerCase().trim()
    const wert = werteFuer[name]
    if (wert === undefined) continue
    try {
      if (feld instanceof PDFTextField) {
        feld.setText(wert)
      } else if (feld instanceof PDFCheckBox) {
        if (/^(true|ja|1)$/i.test(wert)) feld.check()
      }
    } catch {
      // Feldtyp im PDF passt nicht zum erwarteten Wert -- Feld ueberspringen
      // statt den ganzen Export abzubrechen.
    }
  }

  form.flatten()
  return pdfDoc.save()
}
