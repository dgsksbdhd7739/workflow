// Vektor-Auswertung von Grundriss-PDFs fuer die Wanderkennung: liest den
// Operator-Strom von pdfjs selbst (Pfadgeometrie mit Farbe, Linienstaerke und
// Transformation) und zeichnet nur, was nach Zeichenkonvention Wand ist.
//
// Regeln (ermittelt an Werkplaenen 1:50, siehe Agents.md):
// - Wandschnitte: neutral-grau gefuellte Flaechen (Grau 30-85 %)
// - Wandkanten: dunkle neutrale Linien ab 0,27 pt (Moebel/Bemassung sind duenner)
// - Neue Trockenbauwaende: kraeftig rote Linien 0,4-0,9 pt (nur achsparallele
//   Abschnitte -- schraege rote Linien sind Hinweislinien) und rote Fuellungen.
//   Hellrot/rosa ist Moeblierung, rot ab 0,9 pt sind Beschriftungskaesten.
// - Duenne Waende als Linienpaar: zwei parallele gerade Linien (neutral, bis
//   Grau 82 %) >= 1 m lang, 5-30 cm Abstand, ueberwiegend ueberlappend, und an
//   beiden Enden an Wand/Zarge angeschlossen -- Moebel (Schrank, Bettkopfteil,
//   Sofalehne) stehen hoechstens mit einem Ende an einer Wand.
// - Schraffur geschnittener Waende: kurze graue Striche (< 0,6 m), diagonal
//   (20-70 Grad) oder punktfoermig, nicht zu Linienzuegen verbunden, ohne
//   Boegen (Kreise, Moebelsymbole, Konturen fallen damit heraus).

import type { PDFPageProxy } from 'pdfjs-dist'
import { pdfjsLaden } from './pdfLaden'

type Matrix = [number, number, number, number, number, number]

interface Zustand {
  ctm: Matrix
  fuellung: string | null
  linie: string | null
  breite: number
  // Gestrichelt (Achsen, verdeckte/darueberliegende Bauteile) -- nie eine geschnittene Wand
  gestrichelt: boolean
}

export interface VektorMasken {
  breite: number
  hoehe: number
  // Wandschnitte + Wandkanten (+ rote Waende, wenn mitLinien)
  wand: Uint8Array
  // Schraffur-Striche (nur wenn mitLinien)
  schraffur: Uint8Array
  // Duenne Waende aus Linienpaaren (nur wenn mitLinien); erst innerhalb des
  // Gebaeudes verwenden -- Tabellenzeilen ausserhalb bilden ebenfalls Paare
  paare: Uint8Array
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
const kraeftigRot = (c: [number, number, number]) => c[0] >= 204 && c[1] <= 90 && c[2] <= 90

/**
 * Masken im Raster (pxProPt Pixel pro PDF-Punkt). mitLinien: zusaetzlich
 * dunkle und rote Wandlinien sowie die Schraffur (fuer Raeume/Waende 1:1);
 * ohne: nur gefuellte Wandschnitte (fuer den Aussenumriss).
 */
export async function vektorMasken(seite: PDFPageProxy, pxProPt: number, mProPt: number, mitLinien: boolean): Promise<VektorMasken> {
  const pdfjs = await pdfjsLaden()
  const vp = seite.getViewport({ scale: 1 })
  const breite = Math.ceil(vp.width * pxProPt)
  const hoehe = Math.ceil(vp.height * pxProPt)
  // Eigene Absicht "print": nicht mit der Anzeige teilen, die die Pfaddaten beim Zeichnen durch Path2D ersetzt
  const liste = await seite.getOperatorList({ intent: 'print' })
  const { OPS } = pdfjs

  const wandCanvas = document.createElement('canvas')
  wandCanvas.width = breite
  wandCanvas.height = hoehe
  const wand = wandCanvas.getContext('2d', { willReadFrequently: true })!
  const schrCanvas = document.createElement('canvas')
  schrCanvas.width = breite
  schrCanvas.height = hoehe
  const schr = schrCanvas.getContext('2d', { willReadFrequently: true })!
  for (const ctx of [wand, schr]) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, breite, hoehe)
    ctx.fillStyle = '#000000'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1
  }

  let z: Zustand = { ctm: [...vp.transform] as Matrix, fuellung: '#000000', linie: '#000000', breite: 1, gestrichelt: false }
  const stapel: Zustand[] = []

  // Kandidaten fuer Linienpaare: [x1, y1, x2, y2] in Pixeln, waagerecht bzw. senkrecht
  const waagerecht: number[][] = []
  const senkrecht: number[][] = []
  const minPaarLaengePx = 1.0 / (mProPt / pxProPt)

  const fuellOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
  const linienOps = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
  const geradeOderParallel = (dx: number, dy: number) => Math.min(Math.abs(dx), Math.abs(dy)) <= 0.05 * Math.max(Math.abs(dx), Math.abs(dy))

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
      case OPS.setLineWidth:
        z.breite = args[0] as number
        break
      case OPS.setDash:
        z.gestrichelt = Array.isArray(args[0]) && (args[0] as number[]).some((v) => v > 0)
        break
      case OPS.setGState:
        for (const [schluessel, wert] of args[0] as [string, unknown][]) {
          if (schluessel === 'LW') z.breite = wert as number
          if (schluessel === 'D') z.gestrichelt = Array.isArray((wert as unknown[])?.[0]) && ((wert as number[][])[0]).some((v) => v > 0)
        }
        break
      case OPS.setFillRGBColor:
        z.fuellung = typeof args[0] === 'string' ? args[0] : null
        break
      case OPS.setStrokeRGBColor:
        z.linie = typeof args[0] === 'string' ? args[0] : null
        break
      case OPS.setFillTransparent:
        z.fuellung = null
        break
      case OPS.setStrokeTransparent:
        z.linie = null
        break
      case OPS.constructPath: {
        const op = args[0] as number
        const daten = (args[1] as unknown[])?.[0]
        if (!daten || !(ArrayBuffer.isView(daten) || Array.isArray(daten))) break
        const d = daten as ArrayLike<number>
        const fuellen = fuellOps.has(op)
        const linien = linienOps.has(op)
        if (!fuellen && !linien) break

        const m = z.ctm
        const tx = (x: number, y: number) => (m[0] * x + m[2] * y + m[4]) * pxProPt
        const ty = (x: number, y: number) => (m[1] * x + m[3] * y + m[5]) * pxProPt
        const fc = fuellen ? rgb(z.fuellung) : null
        const lc = linien ? rgb(z.linie) : null
        const breitePt = z.breite * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))

        const flaecheWand = !!fc && ((neutral(fc) && fc[0] >= 77 && fc[0] <= 217) || kraeftigRot(fc))
        const durchgezogen = !z.gestrichelt
        const kante = !!lc && mitLinien && durchgezogen && neutral(lc) && lc[0] <= 153 && breitePt >= 0.27
        const roteWand = !!lc && mitLinien && durchgezogen && kraeftigRot(lc) && breitePt >= 0.4 && breitePt < 0.9
        const schraffurKandidat = !!lc && mitLinien && neutral(lc) && lc[0] >= 90 && lc[0] <= 210 && !kante
        const paarKandidat = !!lc && mitLinien && durchgezogen && neutral(lc) && lc[0] <= 210
        if (!flaecheWand && !kante && !roteWand && !schraffurKandidat && !paarKandidat) break

        // Pfad in Geraetekoordinaten aufbauen; Liniensegmente fuer die Regeln sammeln
        const pfad = new Path2D()
        const segmente: number[] = []
        let hatKurven = false
        let sx = 0, sy = 0, cx = 0, cy = 0
        for (let k = 0; k < d.length; ) {
          const befehl = d[k++]
          if (befehl === MOVE) {
            cx = sx = d[k++]
            cy = sy = d[k++]
            pfad.moveTo(tx(cx, cy), ty(cx, cy))
          } else if (befehl === LINE) {
            const x = d[k++], y = d[k++]
            segmente.push(tx(cx, cy), ty(cx, cy), tx(x, y), ty(x, y))
            pfad.lineTo(tx(x, y), ty(x, y))
            cx = x
            cy = y
          } else if (befehl === CURVE) {
            const [x1, y1, x2, y2, x, y] = [d[k++], d[k++], d[k++], d[k++], d[k++], d[k++]]
            pfad.bezierCurveTo(tx(x1, y1), ty(x1, y1), tx(x2, y2), ty(x2, y2), tx(x, y), ty(x, y))
            hatKurven = true
            cx = x
            cy = y
          } else if (befehl === QUAD) {
            const [x1, y1, x, y] = [d[k++], d[k++], d[k++], d[k++]]
            pfad.quadraticCurveTo(tx(x1, y1), ty(x1, y1), tx(x, y), ty(x, y))
            hatKurven = true
            cx = x
            cy = y
          } else if (befehl === CLOSE) {
            if (cx !== sx || cy !== sy) segmente.push(tx(cx, cy), ty(cx, cy), tx(sx, sy), ty(sx, sy))
            pfad.closePath()
            cx = sx
            cy = sy
          } else break
        }

        if (paarKandidat) {
          for (let k = 0; k < segmente.length; k += 4) {
            const [x1, y1, x2, y2] = [segmente[k], segmente[k + 1], segmente[k + 2], segmente[k + 3]]
            if (Math.abs(y2 - y1) < 0.5 && Math.abs(x2 - x1) >= minPaarLaengePx) waagerecht.push([Math.min(x1, x2), (y1 + y2) / 2, Math.max(x1, x2)])
            else if (Math.abs(x2 - x1) < 0.5 && Math.abs(y2 - y1) >= minPaarLaengePx) senkrecht.push([Math.min(y1, y2), (x1 + x2) / 2, Math.max(y1, y2)])
          }
        }
        if (flaecheWand) {
          wand.fill(pfad, op === OPS.eoFill || op === OPS.eoFillStroke || op === OPS.closeEOFillStroke ? 'evenodd' : 'nonzero')
          // Mit Kontur: Wandschraffuren aus vielen winzigen gefuellten Streifen
          // blieben sonst kantengeglaettet fast weiss
          wand.stroke(pfad)
        }
        if (kante) wand.stroke(pfad)
        if (roteWand) {
          wand.beginPath()
          for (let k = 0; k < segmente.length; k += 4) {
            if (!geradeOderParallel(segmente[k + 2] - segmente[k], segmente[k + 3] - segmente[k + 1])) continue
            wand.moveTo(segmente[k], segmente[k + 1])
            wand.lineTo(segmente[k + 2], segmente[k + 3])
          }
          wand.stroke()
        }
        if (schraffurKandidat && !hatKurven) {
          const anzahl = segmente.length / 4
          let verbunden = 0
          for (let k = 4; k < segmente.length; k += 4) {
            if (Math.abs(segmente[k] - segmente[k - 2]) < 0.01 && Math.abs(segmente[k + 1] - segmente[k - 1]) < 0.01) verbunden++
          }
          // Zusammenhaengende Linienzuege sind Konturen/Symbole, keine Schraffur
          if (anzahl >= 4 && verbunden > anzahl * 0.5) break
          const mProPx = mProPt / pxProPt
          schr.beginPath()
          for (let k = 0; k < segmente.length; k += 4) {
            const dx = segmente[k + 2] - segmente[k]
            const dy = segmente[k + 3] - segmente[k + 1]
            const laenge = Math.hypot(dx, dy) * mProPx
            if (laenge > 0.6) continue
            const winkel = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) % 90
            if (laenge > 0.08 && (winkel < 20 || winkel > 70)) continue
            schr.moveTo(segmente[k], segmente[k + 1])
            schr.lineTo(segmente[k + 2], segmente[k + 3])
          }
          schr.stroke()
        }
        break
      }
    }
  }

  const lesen = (ctx: CanvasRenderingContext2D) => {
    const daten = ctx.getImageData(0, 0, breite, hoehe).data
    const maske = new Uint8Array(breite * hoehe)
    // Duenne Waende (wenige Pixel) zeichnet der Browser kantengeglaettet nur hellgrau -- jede nennenswerte Deckung zaehlt
    for (let i = 0; i < maske.length; i++) maske[i] = daten[i * 4] < 215 ? 1 : 0
    return maske
  }
  const wandMaske = lesen(wand)
  const paare = new Uint8Array(breite * hoehe)
  if (mitLinien) linienpaare(wandMaske, paare, breite, hoehe, waagerecht, senkrecht, mProPt / pxProPt)
  return { breite, hoehe, wand: wandMaske, schraffur: mitLinien ? lesen(schr) : new Uint8Array(breite * hoehe), paare }
}

/**
 * Duenne Waende aus parallelen Linienpaaren in die Maske eintragen. Linien je
 * Richtung als [von, quer, bis] (Pixel). Paar: Abstand 5-30 cm, Ueberlappung
 * >= 70 % der kuerzeren Linie und >= 1 m; uebernommen nur, wenn das Wandstueck
 * an beiden Enden an vorhandene Wand stoesst.
 */
function linienpaare(maske: Uint8Array, ziel: Uint8Array, w: number, h: number, waagerecht: number[][], senkrecht: number[][], mProPx: number) {
  const minAbstand = 0.05 / mProPx
  const maxAbstand = 0.3 / mProPx
  const minUeberlappung = 1.0 / mProPx
  const istWand = (x: number, y: number) => {
    const xi = Math.round(x)
    const yi = Math.round(y)
    return xi >= 0 && yi >= 0 && xi < w && yi < h && maske[yi * w + xi] === 1
  }
  const eintragen: [number, number, number, number][] = []
  for (const [liste, quer] of [[waagerecht, false], [senkrecht, true]] as const) {
    liste.sort((a, b) => a[1] - b[1])
    for (let i = 0; i < liste.length; i++) {
      const [v1, q1, b1] = liste[i]
      for (let j = i + 1; j < liste.length && liste[j][1] - q1 <= maxAbstand; j++) {
        const [v2, q2, b2] = liste[j]
        if (q2 - q1 < minAbstand) continue
        const von = Math.max(v1, v2)
        const bis = Math.min(b1, b2)
        const ueberlappung = bis - von
        if (ueberlappung < minUeberlappung || ueberlappung < 0.7 * Math.min(b1 - v1, b2 - v2)) continue
        // An einem Ende (kurz davor/dahinter, 15 cm) muss Wand anschliessen
        const mitte = (q1 + q2) / 2
        const reichweite = 0.15 / mProPx
        const anschluss = (laengs: number) =>
          quer ? istWand(mitte, laengs) || istWand(q1, laengs) || istWand(q2, laengs) : istWand(laengs, mitte) || istWand(laengs, q1) || istWand(laengs, q2)
        let anfang = false
        let ende = false
        for (let t = 0; t <= reichweite; t++) {
          anfang ||= anschluss(von - t)
          ende ||= anschluss(bis + t)
        }
        if (!anfang || !ende) continue
        eintragen.push(quer ? [q1, von, q2, bis] : [von, q1, bis, q2])
      }
    }
  }
  for (const [x1, y1, x2, y2] of eintragen) {
    for (let y = Math.floor(y1); y <= Math.ceil(y2); y++) {
      if (y < 0 || y >= h) continue
      for (let x = Math.floor(x1); x <= Math.ceil(x2); x++) if (x >= 0 && x < w) ziel[y * w + x] = 1
    }
  }
}
