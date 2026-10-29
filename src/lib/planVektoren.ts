// Vektor-Auswertung von Grundriss-PDFs fuer den Aussenumriss: liest den
// Operator-Strom von pdfjs selbst (Pfadgeometrie mit Farbe und Transformation)
// und zeichnet nur die neutral-grau gefuellten Wandschnitte (Grau 30-85 %) --
// daraus ergibt sich nach dem Schliessen von Fenster-/Tueroeffnungen der Umriss.

import type { PDFPageProxy } from 'pdfjs-dist'
import { pdfjsLaden } from './pdfLaden'

type Matrix = [number, number, number, number, number, number]

interface Zustand {
  ctm: Matrix
  fuellung: string | null
}

export interface VektorMasken {
  breite: number
  hoehe: number
  // Gefuellte Wandschnitte
  wand: Uint8Array
}

const MOVE = 0
const LINE = 1
const CURVE = 2
const QUAD = 3
const CLOSE = 4

function multiplizieren(a: Matrix, b: number[]): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

function rgb(farbe: string | null): [number, number, number] | null {
  if (!farbe) return null
  const m = farbe.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}
const neutral = (c: [number, number, number]) => Math.max(...c) - Math.min(...c) <= 8

/** Maske der gefuellten Wandschnitte im Raster (pxProPt Pixel pro PDF-Punkt). */
export async function vektorMasken(seite: PDFPageProxy, pxProPt: number): Promise<VektorMasken> {
  const pdfjs = await pdfjsLaden()
  const vp = seite.getViewport({ scale: 1 })
  const breite = Math.ceil(vp.width * pxProPt)
  const hoehe = Math.ceil(vp.height * pxProPt)
  // Eigene Absicht "print": nicht mit der Anzeige teilen, die die Pfaddaten beim Zeichnen durch Path2D ersetzt
  const liste = await seite.getOperatorList({ intent: 'print' })
  const { OPS } = pdfjs

  const leinwand = document.createElement('canvas')
  leinwand.width = breite
  leinwand.height = hoehe
  const ctx = leinwand.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, breite, hoehe)
  ctx.fillStyle = '#000000'
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1

  let z: Zustand = { ctm: [...vp.transform] as Matrix, fuellung: '#000000' }
  const stapel: Zustand[] = []
  const fuellOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
  const geradeOderUngerade = new Set([OPS.eoFill, OPS.eoFillStroke, OPS.closeEOFillStroke])

  for (let i = 0; i < liste.fnArray.length; i++) {
    const fn = liste.fnArray[i]
    const args = liste.argsArray[i] as unknown[]
    switch (fn) {
      case OPS.save:
        stapel.push({ ...z })
        break
      case OPS.restore:
        z = stapel.pop() ?? z
        break
      case OPS.transform:
        z.ctm = multiplizieren(z.ctm, args as number[])
        break
      case OPS.paintFormXObjectBegin:
        stapel.push({ ...z })
        if (Array.isArray(args[0]) || ArrayBuffer.isView(args[0])) z.ctm = multiplizieren(z.ctm, Array.from(args[0] as ArrayLike<number>))
        break
      case OPS.paintFormXObjectEnd:
        z = stapel.pop() ?? z
        break
      case OPS.setFillRGBColor:
        z.fuellung = typeof args[0] === 'string' ? args[0] : null
        break
      case OPS.setFillTransparent:
        z.fuellung = null
        break
      case OPS.constructPath: {
        const op = args[0] as number
        const daten = (args[1] as unknown[])?.[0]
        if (!fuellOps.has(op) || !daten || !(ArrayBuffer.isView(daten) || Array.isArray(daten))) break
        const fc = rgb(z.fuellung)
        if (!fc || !neutral(fc) || fc[0] < 77 || fc[0] > 217) break
        const d = daten as ArrayLike<number>
        const m = z.ctm
        const tx = (x: number, y: number) => (m[0] * x + m[2] * y + m[4]) * pxProPt
        const ty = (x: number, y: number) => (m[1] * x + m[3] * y + m[5]) * pxProPt
        const pfad = new Path2D()
        for (let k = 0; k < d.length; ) {
          const befehl = d[k++]
          if (befehl === MOVE) {
            pfad.moveTo(tx(d[k], d[k + 1]), ty(d[k], d[k + 1]))
            k += 2
          } else if (befehl === LINE) {
            pfad.lineTo(tx(d[k], d[k + 1]), ty(d[k], d[k + 1]))
            k += 2
          } else if (befehl === CURVE) {
            pfad.bezierCurveTo(tx(d[k], d[k + 1]), ty(d[k], d[k + 1]), tx(d[k + 2], d[k + 3]), ty(d[k + 2], d[k + 3]), tx(d[k + 4], d[k + 5]), ty(d[k + 4], d[k + 5]))
            k += 6
          } else if (befehl === QUAD) {
            pfad.quadraticCurveTo(tx(d[k], d[k + 1]), ty(d[k], d[k + 1]), tx(d[k + 2], d[k + 3]), ty(d[k + 2], d[k + 3]))
            k += 4
          } else if (befehl === CLOSE) {
            pfad.closePath()
          } else break
        }
        ctx.fill(pfad, geradeOderUngerade.has(op) ? 'evenodd' : 'nonzero')
        // Mit Kontur: Schraffuren aus vielen winzigen gefuellten Streifen blieben sonst kantengeglaettet fast weiss
        ctx.stroke(pfad)
        break
      }
    }
  }

  const pixel = ctx.getImageData(0, 0, breite, hoehe).data
  const wand = new Uint8Array(breite * hoehe)
  for (let i = 0; i < wand.length; i++) wand[i] = pixel[i * 4] < 215 ? 1 : 0
  return { breite, hoehe, wand }
}
