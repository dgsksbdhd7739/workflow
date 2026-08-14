import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Baustelle, Mangel, MangelPrioritaet, MangelStatus, Tagesbericht } from '../types/database'

const statusLabel: Record<MangelStatus, string> = {
  offen: 'Offen',
  in_bearbeitung: 'In Bearbeitung',
  erledigt: 'Erledigt',
}

const prioritaetLabel: Record<MangelPrioritaet, string> = {
  niedrig: 'Niedrig',
  mittel: 'Mittel',
  hoch: 'Hoch',
}

function kopfzeile(doc: jsPDF, titel: string, baustelle: Baustelle) {
  doc.setFontSize(16)
  doc.text(titel, 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(baustelle.name + (baustelle.adresse ? ` — ${baustelle.adresse}` : ''), 14, 25)
  doc.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, 14, 30)
  doc.setTextColor(0)
}

export function exportMaengelPdf(baustelle: Baustelle, maengel: Mangel[], nameOf: (id: string | null) => string) {
  const doc = new jsPDF()
  kopfzeile(doc, 'Mängelliste', baustelle)
  autoTable(doc, {
    startY: 36,
    head: [['Titel', 'Status', 'Priorität', 'Verantwortlich', 'Fällig']],
    body: maengel.map((m) => [
      m.titel,
      statusLabel[m.status],
      prioritaetLabel[m.prioritaet],
      nameOf(m.verantwortlicher_id),
      m.faellig_am ?? '—',
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
  })
  doc.save(`${baustelle.name}-maengelliste.pdf`)
}

export function exportTagesberichtePdf(baustelle: Baustelle, berichte: Tagesbericht[]) {
  const doc = new jsPDF()
  kopfzeile(doc, 'Bautagebuch', baustelle)
  autoTable(doc, {
    startY: 36,
    head: [['Datum', 'Wetter', 'Personal', 'Tätigkeiten', 'Besonderheiten']],
    body: berichte.map((b) => [
      b.datum,
      b.wetter ?? '—',
      b.personal_anzahl !== null ? String(b.personal_anzahl) : '—',
      b.taetigkeiten ?? '—',
      b.besonderheiten ?? '—',
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 3: { cellWidth: 45 }, 4: { cellWidth: 40 } },
  })
  doc.save(`${baustelle.name}-bautagebuch.pdf`)
}
