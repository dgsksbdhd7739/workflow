import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { getSignedUrl, supabase } from './supabase'
import { formatKundenAdresse, formatProjektAdresse, formatUnternehmenAdresse } from './adresse'
import { formatDatum } from './datum'
import { tagesberichtName, tagesberichtNummern } from './tagesberichtName'
import type {
  Baustelle,
  Mangel,
  MangelKommentar,
  MangelMaterial,
  StatusVorlageWert,
  Tagesbericht,
  TagesberichtTuer,
  Unternehmen,
  Zeiterfassung,
} from '../types/database'

type RGB = [number, number, number]

// Farbpalette angelehnt an das Design-System der App (slate Neutrals,
// blauer Marken-Akzent, Amber/Emerald fuer Status), damit PDF-Exporte wie
// ein Teil derselben Marke wirken statt wie ein generischer Tabellendruck.
const FARBE = {
  marke: [37, 99, 235] as RGB, // #2563eb
  text: [15, 23, 42] as RGB, // #0f172a
  gedaempft: [71, 85, 105] as RGB, // #475569
  dezent: [148, 163, 184] as RGB, // #94a3b8
  rahmen: [226, 232, 240] as RGB, // #e2e8f0
  flaeche: [248, 250, 252] as RGB, // #f8fafc
  chipFlaeche: [241, 245, 249] as RGB, // #f1f5f9
  gefahr: [220, 38, 38] as RGB, // #dc2626
  gefahrFlaeche: [254, 226, 226] as RGB, // #fee2e2
  warnung: [217, 119, 6] as RGB, // #d97706
  warnungFlaeche: [254, 243, 199] as RGB, // #fef3c7
  erfolg: [5, 150, 105] as RGB, // #059669
  erfolgFlaeche: [220, 252, 231] as RGB, // #dcfce7
}

function hexZuRgb(hex: string): RGB {
  const wert = hex.replace('#', '')
  const bignum = parseInt(wert, 16)
  return [(bignum >> 16) & 255, (bignum >> 8) & 255, bignum & 255]
}

// Farbiges Status-/Fortschritts-Badge, wie die Badges in der App-Oberflaeche.
// Gibt die belegte Breite zurueck, damit nachfolgende Elemente in derselben
// Zeile korrekt weitergesetzt werden koennen.
function zeichnePill(doc: jsPDF, x: number, baseline: number, text: string, flaeche: RGB, textFarbe: RGB): number {
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  const textBreite = doc.getTextWidth(text)
  const padX = 2.1
  const breite = textBreite + padX * 2
  const hoehe = 4.4
  doc.setFillColor(...flaeche)
  doc.roundedRect(x, baseline - hoehe + 1.3, breite, hoehe, 1.4, 1.4, 'F')
  doc.setTextColor(...textFarbe)
  doc.text(text, x + padX, baseline)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...FARBE.text)
  return breite
}

// Flowende Chip-Reihe (z. B. Materialliste), bricht automatisch um.
function zeichneChips(doc: jsPDF, items: string[], startX: number, startY: number, maxX: number): number {
  let x = startX
  let y = startY
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  for (const item of items) {
    const breite = doc.getTextWidth(item) + 4.2
    if (x + breite > maxX) {
      x = startX
      y += 6
    }
    doc.setFillColor(...FARBE.chipFlaeche)
    doc.setDrawColor(...FARBE.rahmen)
    doc.roundedRect(x, y - 3.4, breite, 4.6, 1.3, 1.3, 'FD')
    doc.setTextColor(...FARBE.gedaempft)
    doc.text(item, x + 2.1, y)
    x += breite + 1.8
  }
  doc.setTextColor(...FARBE.text)
  return y + 5.5
}

// Kommentar als Zitatblock mit linker Akzentlinie statt Fliesstext.
function zeichneKommentar(doc: jsPDF, text: string, autor: string, x: number, y: number, maxBreite: number): number {
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8.3)
  doc.setTextColor(...FARBE.gedaempft)
  const zeilen = doc.splitTextToSize(`„${text}"`, maxBreite - 4)
  const blockHoehe = zeilen.length * 4 + 4.5
  doc.setFillColor(...FARBE.rahmen)
  doc.rect(x, y - 3.4, 0.7, blockHoehe, 'F')
  doc.text(zeilen, x + 3.2, y)
  y += zeilen.length * 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.3)
  doc.setTextColor(...FARBE.dezent)
  doc.text(`— ${autor}`, x + 3.2, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.3)
  doc.setTextColor(...FARBE.text)
  return y + 4.5
}

// Fusszeile mit Firmenname links, Seitenzahl rechts -- auf jeder Seite.
function fusszeilenEinfuegen(doc: jsPDF, firmenname: string | null) {
  const seiten = doc.getNumberOfPages()
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i)
    doc.setDrawColor(...FARBE.rahmen)
    doc.line(14, 287, 196, 287)
    doc.setFontSize(7.5)
    doc.setTextColor(...FARBE.dezent)
    if (firmenname) doc.text(firmenname, 14, 291)
    doc.text(`Seite ${i} von ${seiten}`, 196, 291, { align: 'right' })
    doc.setTextColor(...FARBE.text)
  }
}

function arrayBufferZuBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binaer = ''
  const chunkGroesse = 0x8000
  for (let i = 0; i < bytes.length; i += chunkGroesse) {
    binaer += String.fromCharCode(...bytes.subarray(i, i + chunkGroesse))
  }
  return btoa(binaer)
}

// Speichert das PDF plattformgerecht. Im Browser reicht jsPDF's eigener
// Download-Mechanismus (Blob-URL + <a download>). In der nativen Android-App
// laeuft dieser Mechanismus jedoch ins Leere, weil das Capacitor-WebView
// keinen DownloadListener fuer Blob-URLs registriert hat -- Berichte liessen
// sich dort weder oeffnen noch teilen. Daher wird nativ stattdessen ins
// Cache-Verzeichnis geschrieben und der System-Share-Dialog geoeffnet, ueber
// den sich die Datei sowohl mit einer PDF-App oeffnen als auch teilen laesst.
export async function pdfSpeichernOderTeilen(doc: jsPDF, dateiname: string) {
  if (!Capacitor.isNativePlatform()) {
    doc.save(dateiname)
    return
  }
  const base64 = arrayBufferZuBase64(doc.output('arraybuffer'))
  try {
    const { uri } = await Filesystem.writeFile({ path: dateiname, data: base64, directory: Directory.Cache })
    await Share.share({ url: uri, title: dateiname })
  } catch (err) {
    // Tritt auf, wenn die installierte APK aelter ist als das per Live-Update
    // ausgelieferte JS -- die Filesystem/Share-Plugins sind dann nicht im
    // nativen Code vorhanden, egal wie aktuell das JS-Bundle ist. Nur eine
    // neue APK-Installation behebt das, kein weiteres Live-Update.
    if (err instanceof Error && /not implemented/i.test(err.message)) {
      throw new Error('Diese Funktion braucht eine neuere App-Version. Bitte die App über die Webseite neu installieren.')
    }
    throw err
  }
}

function minutenVonZeit(zeit: string) {
  const [h, m] = zeit.split(':').map(Number)
  return h * 60 + m
}

function formatDauer(minuten: number) {
  const h = Math.floor(minuten / 60)
  const m = minuten % 60
  return `${h}h ${m}min`
}

function eintragMinuten(z: Zeiterfassung) {
  if (!z.end_zeit) return 0
  return Math.max(0, minutenVonZeit(z.end_zeit) - minutenVonZeit(z.start_zeit) - z.pause_minuten)
}

// Ermittelt das Unternehmen des aktuell eingeloggten Nutzers (RLS liefert
// automatisch nur die eigene Zeile), fuer Firmenlogo/-daten im PDF-Kopf.
async function holeUnternehmen(): Promise<Unternehmen | null> {
  const { data } = await supabase.from('unternehmen').select('*').limit(1).maybeSingle()
  return data ?? null
}

interface PdfBild {
  dataUrl: string
  breite: number
  hoehe: number
}

// Laedt ein Storage-Bild und rendert es ueber ein Canvas als PNG neu, damit
// auch Formate, die jsPDF nicht nativ versteht (z. B. WEBP, wie es Firmenlogos
// oft haben), korrekt eingebettet werden -- statt als JPEG fehlinterpretiert
// zu werden. Liefert zusaetzlich die Pixel-Masse, um das Bild verzerrungsfrei
// im richtigen Seitenverhaeltnis zu platzieren.
async function bildFuerPdf(
  pfad: string,
  bucket: 'mangel-fotos' | 'unternehmen-logos' = 'mangel-fotos',
): Promise<PdfBild | null> {
  const { url } = await getSignedUrl(bucket, pfad)
  if (!url) return null
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return null
    }
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    return { dataUrl: canvas.toDataURL('image/png'), breite: canvas.width, hoehe: canvas.height }
  } catch {
    return null
  }
}

// Skaliert breite/hoehe verzerrungsfrei so, dass sie in eine maximale Box passen.
function bildGroesseInBox(breite: number, hoehe: number, maxBreite: number, maxHoehe: number) {
  const skala = Math.min(maxBreite / breite, maxHoehe / hoehe)
  return { breite: breite * skala, hoehe: hoehe * skala }
}

async function kopfzeile(doc: jsPDF, titel: string, baustelle: Baustelle, unternehmen: Unternehmen | null): Promise<number> {
  // Markenbalken als Briefkopf-Signal am oberen Seitenrand.
  doc.setFillColor(...FARBE.marke)
  doc.rect(0, 0, 210, 2.5, 'F')

  // Rechte Spalte: Logo oben, darunter rechtsbuendig gestapelt die Firmenangaben.
  let rechteSpalteY = 13
  if (unternehmen?.logo_pfad) {
    const logo = await bildFuerPdf(unternehmen.logo_pfad, 'unternehmen-logos')
    if (logo) {
      const { breite, hoehe } = bildGroesseInBox(logo.breite, logo.hoehe, 36, 16)
      doc.addImage(logo.dataUrl, 'PNG', 196 - breite, rechteSpalteY, breite, hoehe)
      rechteSpalteY += hoehe + 3
    }
  }
  if (unternehmen) {
    const firmenZeilen = [
      unternehmen.name,
      formatUnternehmenAdresse(unternehmen),
      [unternehmen.telefon, unternehmen.email].filter(Boolean).join(' · ') || null,
    ].filter((z): z is string => Boolean(z))
    doc.setFontSize(8)
    doc.setTextColor(...FARBE.dezent)
    for (const zeile of firmenZeilen) {
      doc.text(zeile, 196, rechteSpalteY, { align: 'right' })
      rechteSpalteY += 3.8
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...FARBE.text)
  doc.text(titel, 14, 21)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...FARBE.gedaempft)

  let y = 28
  const projektAdresse = formatProjektAdresse(baustelle)
  doc.text(baustelle.name + (projektAdresse ? ` — ${projektAdresse}` : ''), 14, y)
  y += 5

  const kundenAdresse = formatKundenAdresse(baustelle)
  if (baustelle.kunde_name || kundenAdresse) {
    const kundenZeile = ['Kunde:', baustelle.kunde_name, kundenAdresse ? `(${kundenAdresse})` : null]
      .filter(Boolean)
      .join(' ')
    doc.text(kundenZeile, 14, y)
    y += 5
  }

  const erstelltText = `Erstellt am ${new Date().toLocaleDateString('de-DE')}`
  doc.text(
    baustelle.projekt_ende ? `${erstelltText} · Projekt fällig bis ${formatDatum(baustelle.projekt_ende)}` : erstelltText,
    14,
    y,
  )
  y += 6

  y = Math.max(y, rechteSpalteY) + 1
  doc.setDrawColor(...FARBE.rahmen)
  doc.line(14, y, 196, y)
  y += 6

  doc.setTextColor(...FARBE.text)
  return y
}

// Pro Aufgabe ein Block statt einer Tabellenzeile: Titel, der aktuelle
// Fortschritt (Statusvorlagen-Wert, nicht der rohe Status/Prioritaet/
// Verantwortlicher), zugehoeriges Material und Kommentare samt Fotos.
export async function exportMaengelPdf(
  baustelle: Baustelle,
  maengel: Mangel[],
  material: MangelMaterial[],
  kommentare: MangelKommentar[],
  werteMap: Record<string, StatusVorlageWert>,
  nameOf: (id: string | null) => string,
) {
  const doc = new jsPDF()
  const unternehmen = await holeUnternehmen()
  let y = await kopfzeile(doc, 'Aufgabenliste', baustelle, unternehmen)
  const seitenEnde = 278
  const fotoGroesse = 30

  for (const m of maengel) {
    if (y > seitenEnde - 16) {
      doc.addPage()
      y = 20
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...FARBE.text)
    doc.text(m.titel, 14, y)
    const fortschrittWert = m.status_wert_id ? werteMap[m.status_wert_id] : null
    if (fortschrittWert) {
      const titelBreite = doc.getTextWidth(m.titel)
      zeichnePill(doc, 14 + titelBreite + 3, y, fortschrittWert.titel, hexZuRgb(fortschrittWert.farbe), [255, 255, 255])
    }
    doc.setFont('helvetica', 'normal')
    y += 6.5

    if (m.abnahme_nummer) {
      doc.setFontSize(8)
      doc.setTextColor(...FARBE.dezent)
      doc.text('Abnahme-Nummer: ', 14, y)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...FARBE.text)
      doc.text(m.abnahme_nummer, 14 + doc.getTextWidth('Abnahme-Nummer: '), y)
      doc.setFont('helvetica', 'normal')
      y += 4.5
    }

    const materialListe = material.filter((mm) => mm.mangel_id === m.id)
    if (materialListe.length > 0) {
      doc.setFontSize(7.5)
      doc.setTextColor(...FARBE.dezent)
      doc.text('Material', 14, y)
      y += 3.6
      const chips = materialListe.map((mm) => `${mm.bezeichnung} (${mm.menge}${mm.einheit ? ` ${mm.einheit}` : ''})`)
      y = zeichneChips(doc, chips, 14, y, 196)
    }

    const kommentareListe = kommentare.filter((k) => k.mangel_id === m.id)
    for (const k of kommentareListe) {
      if (y > seitenEnde - 20) {
        doc.addPage()
        y = 20
      }
      if (k.text) {
        y = zeichneKommentar(doc, k.text, nameOf(k.erstellt_von), 14, y, 180)
      }
      if (k.foto_pfad) {
        const bild = await bildFuerPdf(k.foto_pfad, 'mangel-fotos')
        if (bild) {
          if (y + fotoGroesse > seitenEnde) {
            doc.addPage()
            y = 20
          }
          const { breite, hoehe } = bildGroesseInBox(bild.breite, bild.hoehe, fotoGroesse, fotoGroesse)
          const boxX = 14 + (fotoGroesse - breite) / 2
          const boxY = y + (fotoGroesse - hoehe) / 2
          doc.addImage(bild.dataUrl, 'PNG', boxX, boxY, breite, hoehe)
          doc.setDrawColor(...FARBE.rahmen)
          doc.roundedRect(14, y, fotoGroesse, fotoGroesse, 1.2, 1.2, 'S')
          y += fotoGroesse + 4
        }
      }
    }

    y += 3
    doc.setDrawColor(...FARBE.rahmen)
    doc.line(14, y, 196, y)
    y += 8
  }

  fusszeilenEinfuegen(doc, unternehmen?.name ?? null)
  await pdfSpeichernOderTeilen(doc, `${baustelle.name}-aufgabenliste.pdf`)
}

export async function exportMaterialPdf(
  baustelle: Baustelle,
  summe: { bezeichnung: string; einheit: string | null; menge: number; anzahl: number }[],
) {
  const doc = new jsPDF()
  const unternehmen = await holeUnternehmen()
  const startY = await kopfzeile(doc, 'Materialliste', baustelle, unternehmen)
  autoTable(doc, {
    startY,
    margin: { left: 14, right: 14 },
    head: [['Material', 'Menge', 'Aus wie vielen Punkten']],
    body: summe.map((s) => [s.bezeichnung, `${s.menge}${s.einheit ? ` ${s.einheit}` : ''}`, String(s.anzahl)]),
    styles: { fontSize: 9, textColor: FARBE.text, lineColor: FARBE.rahmen },
    headStyles: { fillColor: FARBE.marke, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: FARBE.flaeche },
  })
  fusszeilenEinfuegen(doc, unternehmen?.name ?? null)
  await pdfSpeichernOderTeilen(doc, `${baustelle.name}-materialliste.pdf`)
}

// Ermittelt je Aufgabe die fuer ihr Projekt hinterlegten Fortschrittfelder --
// dieselbe Herleitung wie in MangelDetails: ueber den Plan der Aufgabe zur
// dortigen Statusvorlage, sonst die unternehmensweite Standardvorlage. Ein
// Cache pro PDF-Export vermeidet wiederholte Abfragen fuer Aufgaben, die
// denselben Plan/dieselbe Vorlage teilen.
interface FortschrittCache {
  planZuVorlage: Map<string, string | null>
  werteProVorlage: Map<string, StatusVorlageWert[]>
  standardVorlageId?: string | null
}

function neueFortschrittCache(): FortschrittCache {
  return { planZuVorlage: new Map(), werteProVorlage: new Map() }
}

async function ermittleVorlageId(m: Mangel, cache: FortschrittCache): Promise<string | null> {
  if (m.plan_id) {
    if (!cache.planZuVorlage.has(m.plan_id)) {
      const { data } = await supabase.from('plaene').select('statusvorlage_id').eq('id', m.plan_id).single()
      cache.planZuVorlage.set(m.plan_id, data?.statusvorlage_id ?? null)
    }
    const vorlageId = cache.planZuVorlage.get(m.plan_id) ?? null
    if (vorlageId) return vorlageId
  }
  if (cache.standardVorlageId === undefined) {
    const { data } = await supabase.from('statusvorlagen').select('id').eq('ist_standard', true).limit(1).maybeSingle()
    cache.standardVorlageId = data?.id ?? null
  }
  return cache.standardVorlageId ?? null
}

interface FortschrittFeld {
  titel: string
  farbe: string
  aktiv: boolean
}

async function holeFortschrittfelder(m: Mangel, cache: FortschrittCache): Promise<FortschrittFeld[]> {
  const vorlageId = await ermittleVorlageId(m, cache)
  if (!vorlageId) return []
  if (!cache.werteProVorlage.has(vorlageId)) {
    const { data } = await supabase
      .from('statusvorlage_werte')
      .select('*')
      .eq('statusvorlage_id', vorlageId)
      .order('reihenfolge')
    cache.werteProVorlage.set(vorlageId, data ?? [])
  }
  const werte = cache.werteProVorlage.get(vorlageId) ?? []
  return werte.map((w) => ({ titel: w.titel, farbe: w.farbe, aktiv: w.id === m.status_wert_id }))
}

const AUFGABEN_SPALTE1_X = 19
const AUFGABEN_SPALTE1_BREITE = 54
const AUFGABEN_SPALTE2_X = 79
const AUFGABEN_SPALTE2_BREITE = 48
const AUFGABEN_SPALTE3_X = 133
const AUFGABEN_SPALTE3_BREITE = 63
// Feedback: der Titel eines Aufgaben-Blocks sass fast auf der Trennlinie
// zum vorherigen Block ("Text sitzt direkt auf dem Rahmen") -- zwischen
// Trennlinie und Blockanfang fehlte Luft. 8pt (typografische Punkte, nicht
// mm) zusaetzlicher Abstand nach der Linie, bevor der naechste Block startet.
const AUFGABENBLOCK_ABSTAND_NACH_TRENNLINIE = 2.82

interface AufgabenKommentarEintrag {
  text: string | null
  autor: string
  bild: PdfBild | null
}

interface AufgabenBlockDaten {
  titel: string
  technikerNamen: string | null
  zeitText: string | null
  abnahmeNummer: string | null
  materialChips: string[]
  fortschrittfelder: FortschrittFeld[]
  kommentare: AufgabenKommentarEintrag[]
}

// Zeichnet einen Aufgaben-Block in drei Spalten -- links Titel/Zeit/
// Fortschritts-Prozent, mittig alle fuer das Projekt hinterlegten
// Fortschrittfelder mit Haken beim aktuellen, rechts Kommentare mit Fotos.
// Mit nurMessen=true wird nichts gezeichnet, nur die benoetigte Hoehe anhand
// derselben Zeilenumbrueche/Fonts ermittelt, um vor dem Zeichnen einen
// Seitenumbruch entscheiden zu koennen, ohne den Block auf zwei Seiten zu
// zerreissen. Gibt die Y-Position am unteren Ende des hoechsten Spalten
// zurueck.
function aufgabenBlock(doc: jsPDF, yStart: number, daten: AufgabenBlockDaten, nurMessen: boolean): number {
  // Spalte 1: Titel, Techniker, Zeit, Fortschritts-Prozent, Material
  let y1 = yStart
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  const titelZeilen = doc.splitTextToSize(daten.titel, AUFGABEN_SPALTE1_BREITE)
  if (!nurMessen) {
    doc.setTextColor(...FARBE.text)
    doc.text(titelZeilen, AUFGABEN_SPALTE1_X, y1)
  }
  y1 += titelZeilen.length * 4.4 + 1.8
  doc.setFont('helvetica', 'normal')

  if (daten.technikerNamen) {
    doc.setFontSize(7.5)
    const zeilen = doc.splitTextToSize(daten.technikerNamen, AUFGABEN_SPALTE1_BREITE)
    if (!nurMessen) {
      doc.setTextColor(...FARBE.dezent)
      doc.text(zeilen, AUFGABEN_SPALTE1_X, y1)
    }
    y1 += zeilen.length * 3.6 + 1
  }

  if (daten.zeitText) {
    doc.setFontSize(8.5)
    if (!nurMessen) {
      doc.setTextColor(...FARBE.text)
      doc.text(daten.zeitText, AUFGABEN_SPALTE1_X, y1)
    }
    y1 += 4.8
  }

  if (daten.abnahmeNummer) {
    doc.setFontSize(7.5)
    if (!nurMessen) {
      doc.setTextColor(...FARBE.dezent)
      doc.text('Abnahme-Nr.: ', AUFGABEN_SPALTE1_X, y1)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...FARBE.text)
      doc.text(daten.abnahmeNummer, AUFGABEN_SPALTE1_X + doc.getTextWidth('Abnahme-Nr.: '), y1)
      doc.setFont('helvetica', 'normal')
    }
    y1 += 4.2
  }

  const aktiverIndex = daten.fortschrittfelder.findIndex((f) => f.aktiv)
  if (daten.fortschrittfelder.length > 0 && aktiverIndex >= 0) {
    const prozent = Math.round(((aktiverIndex + 1) / daten.fortschrittfelder.length) * 100)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    if (!nurMessen) {
      doc.setTextColor(...FARBE.marke)
      doc.text(`${prozent}% abgeschlossen`, AUFGABEN_SPALTE1_X, y1)
    }
    y1 += 3.2
    if (!nurMessen) {
      doc.setFillColor(...FARBE.rahmen)
      doc.rect(AUFGABEN_SPALTE1_X, y1, AUFGABEN_SPALTE1_BREITE, 1.6, 'F')
      doc.setFillColor(...FARBE.marke)
      doc.rect(AUFGABEN_SPALTE1_X, y1, (AUFGABEN_SPALTE1_BREITE * prozent) / 100, 1.6, 'F')
    }
    y1 += 4.6
    doc.setFont('helvetica', 'normal')
  }
  doc.setTextColor(...FARBE.text)

  if (daten.materialChips.length > 0) {
    doc.setFontSize(7.5)
    if (!nurMessen) {
      doc.setTextColor(...FARBE.dezent)
      doc.text('Material', AUFGABEN_SPALTE1_X, y1)
    }
    y1 += 3.6
    if (nurMessen) {
      let x = AUFGABEN_SPALTE1_X
      let y = y1
      doc.setFontSize(7.5)
      for (const item of daten.materialChips) {
        const breite = doc.getTextWidth(item) + 4.2
        if (x + breite > AUFGABEN_SPALTE1_X + AUFGABEN_SPALTE1_BREITE) {
          x = AUFGABEN_SPALTE1_X
          y += 6
        }
        x += breite + 1.8
      }
      y1 = y + 5.5
    } else {
      y1 = zeichneChips(doc, daten.materialChips, AUFGABEN_SPALTE1_X, y1, AUFGABEN_SPALTE1_X + AUFGABEN_SPALTE1_BREITE)
    }
  }
  doc.setTextColor(...FARBE.text)

  // Spalte 2: fuer das Projekt hinterlegte Fortschrittfelder, Haken beim aktuellen
  let y2 = yStart
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  if (!nurMessen) {
    doc.setTextColor(...FARBE.dezent)
    doc.text('Fortschritt', AUFGABEN_SPALTE2_X, y2)
  }
  y2 += 4.8
  doc.setFont('helvetica', 'normal')
  if (daten.fortschrittfelder.length === 0) {
    doc.setFontSize(8)
    if (!nurMessen) {
      doc.setTextColor(...FARBE.dezent)
      doc.text('Keine Fortschrittfelder hinterlegt', AUFGABEN_SPALTE2_X, y2)
    }
    y2 += 4.5
  } else {
    for (const feld of daten.fortschrittfelder) {
      doc.setFontSize(8.3)
      doc.setFont('helvetica', feld.aktiv ? 'bold' : 'normal')
      const labelZeilen = doc.splitTextToSize(feld.titel, AUFGABEN_SPALTE2_BREITE - 4.8)
      if (!nurMessen) {
        // Box auf die Kapitalhoehe der 8.3pt-Schrift zentriert (~2.05mm ueber
        // der Grundlinie) statt auf eine fest gewaehlte Groesse -- sonst
        // schwebt das Kaestchen sichtbar ueber dem Text statt mittig zu sitzen.
        const boxGroesse = 2.5
        const boxY = y2 - 2.2
        if (feld.aktiv) {
          doc.setFillColor(...hexZuRgb(feld.farbe))
          doc.setDrawColor(...hexZuRgb(feld.farbe))
          doc.roundedRect(AUFGABEN_SPALTE2_X, boxY, boxGroesse, boxGroesse, 0.5, 0.5, 'FD')
          doc.setDrawColor(255, 255, 255)
          doc.setLineWidth(0.4)
          doc.line(AUFGABEN_SPALTE2_X + 0.5, boxY + 1.3, AUFGABEN_SPALTE2_X + 1.0, boxY + 1.9)
          doc.line(AUFGABEN_SPALTE2_X + 1.0, boxY + 1.9, AUFGABEN_SPALTE2_X + 2.1, boxY + 0.5)
          doc.setLineWidth(0.2)
        } else {
          doc.setDrawColor(...FARBE.rahmen)
          doc.roundedRect(AUFGABEN_SPALTE2_X, boxY, boxGroesse, boxGroesse, 0.5, 0.5, 'S')
        }
        doc.setTextColor(...(feld.aktiv ? FARBE.text : FARBE.gedaempft))
        doc.text(labelZeilen, AUFGABEN_SPALTE2_X + 4.4, y2)
      }
      y2 += Math.max(labelZeilen.length * 3.8, 4.6)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...FARBE.text)
    }
  }

  // Spalte 3: Kommentare mit Fotos
  let y3 = yStart
  const fotoGroesse = 26
  if (daten.kommentare.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    if (!nurMessen) {
      doc.setTextColor(...FARBE.dezent)
      doc.text('Keine Kommentare', AUFGABEN_SPALTE3_X, y3)
    }
    doc.setFont('helvetica', 'normal')
    y3 += 4.5
  } else {
    let fotoX = AUFGABEN_SPALTE3_X
    let fotoReiheOffen = false
    const fotoZeileAbschliessen = () => {
      if (fotoReiheOffen) {
        y3 += fotoGroesse + 3
        fotoX = AUFGABEN_SPALTE3_X
        fotoReiheOffen = false
      }
    }
    for (const k of daten.kommentare) {
      if (k.text) {
        fotoZeileAbschliessen()
        const zeilen = doc.splitTextToSize(`„${k.text}"`, AUFGABEN_SPALTE3_BREITE - 4)
        if (!nurMessen) {
          y3 = zeichneKommentar(doc, k.text, k.autor, AUFGABEN_SPALTE3_X, y3, AUFGABEN_SPALTE3_BREITE)
        } else {
          y3 += zeilen.length * 4 + 4.5
        }
      }
      if (k.bild) {
        const { breite, hoehe } = bildGroesseInBox(k.bild.breite, k.bild.hoehe, fotoGroesse, fotoGroesse)
        if (fotoX + fotoGroesse > AUFGABEN_SPALTE3_X + AUFGABEN_SPALTE3_BREITE) {
          fotoX = AUFGABEN_SPALTE3_X
          y3 += fotoGroesse + 3
        }
        if (!nurMessen) {
          const boxX = fotoX + (fotoGroesse - breite) / 2
          const boxY = y3 + (fotoGroesse - hoehe) / 2
          doc.addImage(k.bild.dataUrl, 'PNG', boxX, boxY, breite, hoehe)
          doc.setDrawColor(...FARBE.rahmen)
          doc.roundedRect(fotoX, y3, fotoGroesse, fotoGroesse, 1.2, 1.2, 'S')
        }
        fotoX += fotoGroesse + 3
        fotoReiheOffen = true
      }
    }
    fotoZeileAbschliessen()
  }

  return Math.max(y1, y2, y3)
}

// Rendert einen einzelnen Tagesbericht-Block (Datum, Wetter, Tueren-Stand,
// Zeiterfassung je Aufgabe mit Fortschritt, Material, Kommentaren, Fotos).
// Wird sowohl fuer den Sammel-Export (alle Berichte) als auch fuer das
// Oeffnen/Exportieren eines einzelnen Berichts verwendet.
async function zeichneTagesberichtTag(
  doc: jsPDF,
  yStart: number,
  seitenEnde: number,
  b: Tagesbericht,
  dokName: string,
  zeiten: Zeiterfassung[],
  maengel: Mangel[],
  material: MangelMaterial[],
  kommentare: MangelKommentar[],
  tueren: TagesberichtTuer[],
  nameOf: (id: string | null) => string,
  fortschrittCache: FortschrittCache,
): Promise<number> {
  let y = yStart

  doc.setFillColor(...FARBE.marke)
  doc.circle(15.3, y - 1.4, 1.1, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12.5)
  doc.setTextColor(...FARBE.text)
  doc.text(formatDatum(b.datum), 19, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...FARBE.dezent)
  doc.text(`erstellt von ${nameOf(b.erstellt_von)}`, 196, y, { align: 'right' })
  y += 4.6
  doc.setFontSize(7)
  doc.setTextColor(...FARBE.dezent)
  doc.text(dokName, 19, y)
  doc.setFontSize(8)
  y += 4.2

    const metaChips = [
      b.wetter ? `☁ ${b.wetter}` : null,
      b.temperatur !== null ? `${b.temperatur}°C` : null,
      b.personal_anzahl !== null ? `Personal: ${b.personal_anzahl}` : null,
    ].filter((z): z is string => Boolean(z))
    if (metaChips.length > 0) {
      y = zeichneChips(doc, metaChips, 19, y, 196)
    }

    const tuerenDesBerichts = tueren.filter((t) => t.tagesbericht_id === b.id)
    if (tuerenDesBerichts.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: 19, right: 14 },
        head: [['Tür / Aufgabe', 'Stand']],
        body: tuerenDesBerichts.map((t) => [t.titel, t.stand]),
        styles: { fontSize: 8, textColor: FARBE.text, lineColor: FARBE.rahmen },
        headStyles: { fillColor: FARBE.marke, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: FARBE.flaeche },
        tableWidth: 177,
      })
      // @ts-expect-error jspdf-autotable haengt lastAutoTable zur Laufzeit an, ohne eigenen Typ
      y = doc.lastAutoTable.finalY + 4
    }

    // Vor der Aenderung an handleAutoErstellen enthalten bereits gespeicherte
    // Berichte noch den vollstaendigen "Noch offen"-Dump im Freitext -- der
    // ist redundant zur Tueren-Tabelle oben und wird hier herausgefiltert.
    const taetigkeitenOhneDump = b.taetigkeiten?.replace(/\n*Noch offen:\n(?:- .+\n?)+/, '').trim()
    if (taetigkeitenOhneDump) {
      doc.setFontSize(9)
      doc.setTextColor(...FARBE.text)
      const zeilen = doc.splitTextToSize(taetigkeitenOhneDump, 175)
      doc.text(zeilen, 19, y)
      y += zeilen.length * 4.2 + 2
    }

    if (b.besonderheiten) {
      doc.setFontSize(9)
      doc.setTextColor(...FARBE.warnung)
      const zeilen = doc.splitTextToSize(`⚠ Besonderheiten: ${b.besonderheiten}`, 175)
      doc.text(zeilen, 19, y)
      y += zeilen.length * 4.2 + 2
      doc.setTextColor(...FARBE.text)
    }

    const tagesZeiten = zeiten.filter((z) => z.datum === b.datum)
    // Kommentare/Fotos sind nicht an eine Zeiterfassung gebunden -- ohne
    // diese zusaetzliche Quelle blieb eine Aufgabe, an der nur kommentiert
    // (aber keine Zeit erfasst) wurde, an diesem Tag komplett unsichtbar.
    const kommentareHeute = kommentare.filter((k) => k.erstellt_am.slice(0, 10) === b.datum)
    if (tagesZeiten.length > 0 || kommentareHeute.length > 0) {
      const gruppen = new Map<string, Zeiterfassung[]>()
      for (const z of tagesZeiten) {
        const key = z.mangel_id ?? '__allgemein__'
        const liste = gruppen.get(key) ?? []
        liste.push(z)
        gruppen.set(key, liste)
      }
      for (const k of kommentareHeute) {
        if (!gruppen.has(k.mangel_id)) gruppen.set(k.mangel_id, [])
      }

      for (const [key, eintraege] of gruppen) {
        if (y > seitenEnde - 12) {
          doc.addPage()
          y = 20
        }

        if (key === '__allgemein__') {
          for (const z of eintraege) {
            doc.setFontSize(9)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(...FARBE.text)
            doc.text('Allgemein', 19, y)
            doc.setTextColor(...FARBE.dezent)
            doc.text(
              `${nameOf(z.user_id)} · ${z.end_zeit ? formatDauer(eintragMinuten(z)) : 'läuft noch'}`,
              196,
              y,
              { align: 'right' },
            )
            y += 5
          }
          continue
        }

        const m = maengel.find((x) => x.id === key)
        const technikerNamen = [...new Set(eintraege.map((e) => nameOf(e.user_id)))].join(', ') || null
        const gesamtDauer = eintraege.reduce((sum, e) => sum + eintragMinuten(e), 0)
        const materialListe = material.filter((x) => x.mangel_id === key)
        const materialChips = materialListe.map(
          (mm) => `${mm.bezeichnung} (${mm.menge}${mm.einheit ? ` ${mm.einheit}` : ''})`,
        )
        const fortschrittfelder = m ? await holeFortschrittfelder(m, fortschrittCache) : []

        const kommentareDaten: AufgabenKommentarEintrag[] = []
        const kommentareListe = kommentareHeute.filter((x) => x.mangel_id === key && (x.text || x.foto_pfad))
        for (const k of kommentareListe) {
          const bild = k.foto_pfad ? await bildFuerPdf(k.foto_pfad, 'mangel-fotos') : null
          kommentareDaten.push({ text: k.text, autor: nameOf(k.erstellt_von), bild })
        }
        for (const e of eintraege.filter((z) => z.foto_pfad)) {
          const bild = await bildFuerPdf(e.foto_pfad!, 'mangel-fotos')
          if (bild) kommentareDaten.push({ text: null, autor: nameOf(e.user_id), bild })
        }

        const daten: AufgabenBlockDaten = {
          titel: m?.titel ?? 'Aufgabe',
          technikerNamen,
          zeitText: eintraege.length > 0 ? formatDauer(gesamtDauer) : null,
          abnahmeNummer: m?.abnahme_nummer ?? null,
          materialChips,
          fortschrittfelder,
          kommentare: kommentareDaten,
        }

        const benoetigteHoehe = aufgabenBlock(doc, 0, daten, true)
        if (y + benoetigteHoehe > seitenEnde) {
          doc.addPage()
          y = 20
        }
        y = aufgabenBlock(doc, y, daten, false) + 4
        if (y < seitenEnde - 4) {
          doc.setDrawColor(...FARBE.rahmen)
          doc.line(19, y - 2.5, 196, y - 2.5)
        }
        y += AUFGABENBLOCK_ABSTAND_NACH_TRENNLINIE
      }
      y += 1
    }

  return y
}

export async function exportTagesberichtePdf(
  baustelle: Baustelle,
  berichte: Tagesbericht[],
  zeiten: Zeiterfassung[],
  maengel: Mangel[],
  material: MangelMaterial[],
  kommentare: MangelKommentar[],
  tueren: TagesberichtTuer[],
  nameOf: (id: string | null) => string,
) {
  const doc = new jsPDF()
  const unternehmen = await holeUnternehmen()
  let y = await kopfzeile(doc, 'Bautagebuch', baustelle, unternehmen)
  const seitenEnde = 278
  const nummern = tagesberichtNummern(berichte)
  const fortschrittCache = neueFortschrittCache()

  for (const b of berichte) {
    if (y > seitenEnde - 20) {
      doc.addPage()
      y = 20
    }
    y = await zeichneTagesberichtTag(
      doc,
      y,
      seitenEnde,
      b,
      tagesberichtName(baustelle, b, nummern[b.id]),
      zeiten,
      maengel,
      material,
      kommentare,
      tueren,
      nameOf,
      fortschrittCache,
    )
    y += 3
    doc.setDrawColor(...FARBE.rahmen)
    doc.line(14, y, 196, y)
    y += 8
  }

  fusszeilenEinfuegen(doc, unternehmen?.name ?? null)
  await pdfSpeichernOderTeilen(doc, `${baustelle.name}-bautagebuch.pdf`)
}

// Baut den PDF-Dokument einzeln fuer einen Bericht, ohne ihn zu speichern/
// teilen -- der Aufrufer zeigt ihn typischerweise erst in einem internen
// Viewer an (siehe PdfViewerModal) und bietet erst von dort aus Teilen an.
export async function erzeugeEinzelnenTagesberichtPdf(
  baustelle: Baustelle,
  bericht: Tagesbericht,
  zeiten: Zeiterfassung[],
  maengel: Mangel[],
  material: MangelMaterial[],
  kommentare: MangelKommentar[],
  tueren: TagesberichtTuer[],
  nameOf: (id: string | null) => string,
  dokumentname: string,
): Promise<jsPDF> {
  const doc = new jsPDF()
  const unternehmen = await holeUnternehmen()
  let y = await kopfzeile(doc, 'Bautagebuch', baustelle, unternehmen)
  const seitenEnde = 278

  await zeichneTagesberichtTag(
    doc,
    y,
    seitenEnde,
    bericht,
    dokumentname,
    zeiten,
    maengel,
    material,
    kommentare,
    tueren,
    nameOf,
    neueFortschrittCache(),
  )

  fusszeilenEinfuegen(doc, unternehmen?.name ?? null)
  return doc
}
