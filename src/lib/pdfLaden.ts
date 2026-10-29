// Gemeinsames Laden von PDFs (pdfjs) fuer Plan-Ansicht, Vorschaubilder und
// die Plan-Auswertung fuer die 3D-Ansicht.

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { getSignedUrl, type StorageBucket } from './backend'

export async function pdfjsLaden() {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs
}

// Ein Satz Grundrisse liegt oft als eine grosse PDF vor (z. B. 29 MB, eine
// Seite je Geschoss), auf die mehrere Plaene zeigen. Ohne Zwischenspeicher
// wuerde jede Vorschau die ganze Datei erneut laden.
const dokumente = new Map<string, Promise<PDFDocumentProxy>>()

export function pdfDokument(bucket: StorageBucket, pfad: string): Promise<PDFDocumentProxy> {
  const schluessel = `${bucket}/${pfad}`
  let dokument = dokumente.get(schluessel)
  if (!dokument) {
    dokument = (async () => {
      const { url, error } = await getSignedUrl(bucket, pfad)
      if (!url) throw new Error(error ?? 'Kein Link zur Datei')
      const pdfjs = await pdfjsLaden()
      // Nur Fehler melden: Werkplaene erzeugen sonst Hunderte XFA-Warnungen
      return pdfjs.getDocument({ url, verbosity: pdfjs.VerbosityLevel.ERRORS }).promise
    })()
    dokument.catch(() => dokumente.delete(schluessel))
    dokumente.set(schluessel, dokument)
  }
  return dokument
}

/** Seite holen; liegt die gewuenschte Seite hinter dem Dokumentende, die letzte. */
export async function pdfSeite(dokument: PDFDocumentProxy, seite: number): Promise<PDFPageProxy> {
  return dokument.getPage(Math.min(Math.max(seite, 1), dokument.numPages))
}

/**
 * Zeichenmassstab begrenzen: Werkplaene im A0-Querformat und groesser (bis
 * 3 m breit) ergaeben bei Massstab 2 Leinwaende mit 80 Mio. Pixeln (~320 MB),
 * an denen Handys und Tablets scheitern. Desktop darf mehr als Mobilgeraete.
 */
export function begrenzterMassstab(seite: PDFPageProxy, gewuenscht: number) {
  const { width, height } = seite.getViewport({ scale: 1 })
  const mobil = typeof window !== 'undefined' && Math.min(window.screen.width, window.screen.height) < 820
  const maxPixel = mobil ? 16_000_000 : 32_000_000
  const maxSeite = mobil ? 8192 : 16384
  return Math.min(gewuenscht, Math.sqrt(maxPixel / (width * height)), maxSeite / Math.max(width, height))
}
