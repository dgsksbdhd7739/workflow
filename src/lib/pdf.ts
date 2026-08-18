import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getSignedUrl, supabase } from './supabase'
import { formatKundenAdresse, formatProjektAdresse, formatUnternehmenAdresse } from './adresse'
import { formatDatum } from './datum'
import type {
  Baustelle,
  Mangel,
  MangelKommentar,
  MangelMaterial,
  MangelPrioritaet,
  MangelStatus,
  StatusVorlageWert,
  Tagesbericht,
  TagesberichtTuer,
  Unternehmen,
  Zeiterfassung,
} from '../types/database'

const statusLabel: Record<MangelStatus, string> = {
  offen: 'Stopp',
  in_bearbeitung: 'In Arbeit',
  erledigt: 'Abgeschlossen',
}

const prioritaetLabel: Record<MangelPrioritaet, string> = {
  niedrig: 'Niedrig',
  mittel: 'Mittel',
  hoch: 'Hoch',
}

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

const statusFarbe: Record<MangelStatus, { text: RGB; flaeche: RGB }> = {
  offen: { text: FARBE.gefahr, flaeche: FARBE.gefahrFlaeche },
  in_bearbeitung: { text: FARBE.warnung, flaeche: FARBE.warnungFlaeche },
  erledigt: { text: FARBE.erfolg, flaeche: FARBE.erfolgFlaeche },
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

export async function exportMaengelPdf(baustelle: Baustelle, maengel: Mangel[], nameOf: (id: string | null) => string) {
  const doc = new jsPDF()
  const unternehmen = await holeUnternehmen()
  const startY = await kopfzeile(doc, 'Aufgabenliste', baustelle, unternehmen)
  autoTable(doc, {
    startY,
    margin: { left: 14, right: 14 },
    head: [['Titel', 'Status', 'Priorität', 'Verantwortlich']],
    body: maengel.map((m) => [
      m.titel,
      statusLabel[m.status],
      prioritaetLabel[m.prioritaet],
      nameOf(m.verantwortlicher_id),
    ]),
    styles: { fontSize: 9, textColor: FARBE.text, lineColor: FARBE.rahmen },
    headStyles: { fillColor: FARBE.marke, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: FARBE.flaeche },
  })
  fusszeilenEinfuegen(doc, unternehmen?.name ?? null)
  doc.save(`${baustelle.name}-aufgabenliste.pdf`)
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
  doc.save(`${baustelle.name}-materialliste.pdf`)
}

export async function exportTagesberichtePdf(
  baustelle: Baustelle,
  berichte: Tagesbericht[],
  zeiten: Zeiterfassung[],
  maengel: Mangel[],
  material: MangelMaterial[],
  kommentare: MangelKommentar[],
  tueren: TagesberichtTuer[],
  werteMap: Record<string, StatusVorlageWert>,
  nameOf: (id: string | null) => string,
) {
  const doc = new jsPDF()
  const unternehmen = await holeUnternehmen()
  let y = await kopfzeile(doc, 'Bautagebuch', baustelle, unternehmen)
  const seitenEnde = 278

  for (const b of berichte) {
    if (y > seitenEnde - 20) {
      doc.addPage()
      y = 20
    }

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
    y += 6.5

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

    if (b.taetigkeiten) {
      doc.setFontSize(9)
      doc.setTextColor(...FARBE.text)
      const zeilen = doc.splitTextToSize(b.taetigkeiten, 175)
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
    if (tagesZeiten.length > 0) {
      const gruppen = new Map<string, Zeiterfassung[]>()
      for (const z of tagesZeiten) {
        const key = z.mangel_id ?? '__allgemein__'
        const liste = gruppen.get(key) ?? []
        liste.push(z)
        gruppen.set(key, liste)
      }

      const fotoGroesse = 30

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
        const aufgabe = m?.titel ?? 'Aufgabe'
        const fortschrittWert = m?.status_wert_id ? werteMap[m.status_wert_id] : null
        const technikerNamen = [...new Set(eintraege.map((e) => nameOf(e.user_id)))].join(', ')
        const gesamtDauer = eintraege.reduce((sum, e) => sum + eintragMinuten(e), 0)

        doc.setFontSize(9.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...FARBE.text)
        doc.text(aufgabe, 19, y)
        const titelBreite = doc.getTextWidth(aufgabe)
        if (fortschrittWert) {
          zeichnePill(doc, 19 + titelBreite + 3, y, fortschrittWert.titel, hexZuRgb(fortschrittWert.farbe), [255, 255, 255])
        } else if (m) {
          const sf = statusFarbe[m.status]
          zeichnePill(doc, 19 + titelBreite + 3, y, statusLabel[m.status], sf.flaeche, sf.text)
        }
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...FARBE.dezent)
        doc.text(`${technikerNamen} · ${formatDauer(gesamtDauer)}`, 196, y, { align: 'right' })
        y += 5.2

        if (m?.abnahme_nummer) {
          doc.setFontSize(8)
          doc.setTextColor(...FARBE.dezent)
          doc.text(`Abnahme-Nummer: `, 19, y)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...FARBE.text)
          doc.text(m.abnahme_nummer, 19 + doc.getTextWidth('Abnahme-Nummer: '), y)
          doc.setFont('helvetica', 'normal')
          y += 4.5
        }

        const materialListe = material.filter((x) => x.mangel_id === key)
        if (materialListe.length > 0) {
          doc.setFontSize(7.5)
          doc.setTextColor(...FARBE.dezent)
          doc.text('Material', 19, y)
          y += 3.6
          const chips = materialListe.map((mm) => `${mm.bezeichnung} (${mm.menge}${mm.einheit ? ` ${mm.einheit}` : ''})`)
          y = zeichneChips(doc, chips, 19, y, 196)
        }

        const kommentareListe = kommentare.filter((x) => x.mangel_id === key && x.text)
        for (const k of kommentareListe) {
          const geschaetzteHoehe = doc.splitTextToSize(`„${k.text}"`, 175 - 4).length * 4 + 6
          if (y + geschaetzteHoehe > seitenEnde) {
            doc.addPage()
            y = 20
          }
          y = zeichneKommentar(doc, k.text!, nameOf(k.erstellt_von), 19, y, 175)
        }

        const fotoEintraege = eintraege.filter((e) => e.foto_pfad)
        if (fotoEintraege.length > 0) {
          let x = 19
          if (y + fotoGroesse > seitenEnde) {
            doc.addPage()
            y = 20
          }
          for (const e of fotoEintraege) {
            const bild = await bildFuerPdf(e.foto_pfad!, 'mangel-fotos')
            if (!bild) continue
            if (x + fotoGroesse > 196) {
              x = 19
              y += fotoGroesse + 3
            }
            if (y + fotoGroesse > seitenEnde) {
              doc.addPage()
              y = 20
              x = 19
            }
            const { breite, hoehe } = bildGroesseInBox(bild.breite, bild.hoehe, fotoGroesse, fotoGroesse)
            const boxX = x + (fotoGroesse - breite) / 2
            const boxY = y + (fotoGroesse - hoehe) / 2
            doc.addImage(bild.dataUrl, 'PNG', boxX, boxY, breite, hoehe)
            doc.setDrawColor(...FARBE.rahmen)
            doc.roundedRect(x, y, fotoGroesse, fotoGroesse, 1.2, 1.2, 'S')
            x += fotoGroesse + 3
          }
          y += fotoGroesse + 4
        }

        y += 3.5
      }
      y += 1
    }

    y += 3
    doc.setDrawColor(...FARBE.rahmen)
    doc.line(14, y, 196, y)
    y += 8
  }

  fusszeilenEinfuegen(doc, unternehmen?.name ?? null)
  doc.save(`${baustelle.name}-bautagebuch.pdf`)
}
