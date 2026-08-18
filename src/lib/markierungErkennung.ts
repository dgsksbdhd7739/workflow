// Automatische Erkennung bereits im Plan eingezeichneter Positions-Markierungen
// (farbige, abgerundete Kaesten mit Pfeil/Linie zu einer Zielposition, wie sie
// Planer z. B. in Bluebeam als Callout einfuegen). Rote Kaesten sind bewusst
// ausgeschlossen - sie enthalten in der Praxis Zusatzinfos (z. B. "E-Oeffner"),
// nicht die eigentliche Positions-Nummer.
//
// Die Beschriftung im Kasten ist bei exportierten CAD-Plaenen meist kein
// echter PDF-Text (sondern in Pfade gewandelt) - deshalb wird sie per OCR
// (Tesseract, siehe planOcr.ts) aus einem eng zugeschnittenen Bildausschnitt
// gelesen. Dieses Modul liefert dafuer nur die reine Bild-/Formanalyse:
// Kasten finden, vom Umrandungstext befreiten Kern-Ausschnitt fuer die OCR
// bestimmen, und die Zielposition (Pfeilspitze bzw. letzter Verbindungspunkt,
// nicht die Kasten-Mitte - der Kasten steht ja bewusst neben der eigentlichen
// Stelle im Plan) berechnen.

export interface ErkannterKasten {
  cx: number
  cy: number
  zielX: number
  zielY: number
  cropRect: { x: number; y: number; w: number; h: number }
  farbe: string
}

// Findet einen Positions-Code irgendwo im (oft verrauschten) OCR-Text -
// erlaubt dabei, dass der Punkt direkt nach dem Buchstaben-Praefix fehlt
// (haeufiger OCR-Fehler bei kleinem Punkt), verlangt aber mindestens eine
// weitere durch Punkt getrennte Zifferngruppe, um Fehltreffer zu vermeiden.
const POSITIONS_CODE_SUCHE = /[A-Za-zÄÖÜäöü]{1,3}\.?\d{1,4}(?:\.[0-9A-Za-zÄÖÜäöü]{1,4}){1,4}/g

export function extrahierePositionsCode(ocrText: string): string | null {
  const treffer = ocrText.match(POSITIONS_CODE_SUCHE)
  if (!treffer || treffer.length === 0) return null
  const bester = treffer.reduce((a, b) => (b.length > a.length ? b : a))
  return /^[A-Za-zÄÖÜäöü]{1,3}\d/.test(bester) ? bester.replace(/^([A-Za-zÄÖÜäöü]{1,3})(\d)/, '$1.$2') : bester
}

const FARB_FENSTER = [
  { hueMin: 195, hueMax: 225 }, // blau
  { hueMin: 100, hueMax: 140 }, // gruen
]
const SAETTIGUNG_MIN = 0.55
const HELLIGKEIT_MIN = 0.4

const BOX_MIN_FLAECHE = 2500
const FRAGMENT_MAX_ABSTAND = 900
const CROP_PAD = 10

interface Komponente {
  minX: number
  maxX: number
  minY: number
  maxY: number
  anzahl: number
  cx: number
  cy: number
  r: number
  g: number
  b: number
  pxX: number[]
  pxY: number[]
}

export function erkenneKaesten(canvas: HTMLCanvasElement): ErkannterKasten[] {
  const breite = canvas.width
  const hoehe = canvas.height
  if (!breite || !hoehe) return []
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  const { data } = ctx.getImageData(0, 0, breite, hoehe)

  const komponenten = findeKomponenten(data, breite, hoehe)
  const boxen = komponenten.filter((k) => k.anzahl >= BOX_MIN_FLAECHE)
  const fragmente = komponenten.filter((k) => k.anzahl < BOX_MIN_FLAECHE)

  const ergebnisse: ErkannterKasten[] = []
  for (const box of boxen) {
    // Eigener, am weitesten vom Schwerpunkt entfernter Pixel (deckt kurze,
    // durchgehend verbundene Pfeile ab, die Teil derselben Komponente sind)
    let zielX = box.cx
    let zielY = box.cy
    let besterAbstand = 0
    for (let i = 0; i < box.pxX.length; i++) {
      const d = Math.hypot(box.pxX[i] - box.cx, box.pxY[i] - box.cy)
      if (d > besterAbstand) {
        besterAbstand = d
        zielX = box.pxX[i]
        zielY = box.pxY[i]
      }
    }
    // Nahe, getrennte Fragmente (z. B. Verbindungspunkte einer mehrteiligen
    // Linie, die durch Antialiasing vom Kasten abgerissen sind) koennen weiter
    // reichen als der eigene Pfeilrest - nur uebernehmen, wenn dieser Kasten
    // das naechstgelegene Ziel fuer das Fragment ist.
    for (const f of fragmente) {
      const abstandZurBox = Math.hypot(f.cx - box.cx, f.cy - box.cy)
      if (abstandZurBox > FRAGMENT_MAX_ABSTAND || abstandZurBox <= besterAbstand) continue
      const istNaechsteBox = boxen.every(
        (andere) => andere === box || Math.hypot(f.cx - andere.cx, f.cy - andere.cy) >= abstandZurBox,
      )
      if (!istNaechsteBox) continue
      besterAbstand = abstandZurBox
      zielX = f.cx
      zielY = f.cy
    }

    ergebnisse.push({
      cx: box.cx,
      cy: box.cy,
      zielX,
      zielY,
      cropRect: kernAusschnitt(box),
      farbe: rgbZuHex(Math.round(box.r), Math.round(box.g), Math.round(box.b)),
    })
  }

  return ergebnisse
}

// OCR-Ausschnitt: die volle Bounding-Box der Komponente plus etwas Rand. Bei
// kurzen Pfeilen (die meisten Faelle) ist das exakt der Kasten; bei sehr
// lang auslaufenden Pfeilen kann etwas Planinhalt mit hineinrutschen - das
// stoert Tesseract in der Praxis aber deutlich weniger als eine zu knapp
// (und dadurch manchmal Text abschneidende) Kernband-Heuristik.
function kernAusschnitt(box: Komponente): { x: number; y: number; w: number; h: number } {
  return {
    x: box.minX - CROP_PAD,
    y: box.minY - CROP_PAD,
    w: box.maxX - box.minX + CROP_PAD * 2,
    h: box.maxY - box.minY + CROP_PAD * 2,
  }
}

function findeKomponenten(data: Uint8ClampedArray, breite: number, hoehe: number): Komponente[] {
  const anzahlPixel = breite * hoehe
  const maske = new Uint8Array(anzahlPixel)
  for (let i = 0; i < anzahlPixel; i++) {
    const o = i * 4
    const { hue, saturation, value } = rgbZuHsv(data[o], data[o + 1], data[o + 2])
    if (saturation < SAETTIGUNG_MIN || value < HELLIGKEIT_MIN) continue
    if (FARB_FENSTER.some((f) => hue >= f.hueMin && hue <= f.hueMax)) maske[i] = 1
  }

  const besucht = new Uint8Array(anzahlPixel)
  const komponenten: Komponente[] = []
  const stapel: number[] = []

  for (let start = 0; start < anzahlPixel; start++) {
    if (maske[start] !== 1 || besucht[start] === 1) continue
    stapel.length = 0
    stapel.push(start)
    besucht[start] = 1
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    let anzahl = 0
    let sx = 0
    let sy = 0
    let sr = 0
    let sg = 0
    let sb = 0
    const pxX: number[] = []
    const pxY: number[] = []

    while (stapel.length > 0) {
      const idx = stapel.pop()!
      const x = idx % breite
      const y = (idx / breite) | 0
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      anzahl++
      sx += x
      sy += y
      pxX.push(x)
      pxY.push(y)
      const o = idx * 4
      sr += data[o]
      sg += data[o + 1]
      sb += data[o + 2]

      const nachbarn = [
        x > 0 ? idx - 1 : -1,
        x < breite - 1 ? idx + 1 : -1,
        y > 0 ? idx - breite : -1,
        y < hoehe - 1 ? idx + breite : -1,
      ]
      for (const n of nachbarn) {
        if (n >= 0 && maske[n] === 1 && besucht[n] === 0) {
          besucht[n] = 1
          stapel.push(n)
        }
      }
    }

    komponenten.push({
      minX,
      maxX,
      minY,
      maxY,
      anzahl,
      cx: sx / anzahl,
      cy: sy / anzahl,
      r: sr / anzahl,
      g: sg / anzahl,
      b: sb / anzahl,
      pxX,
      pxY,
    })
  }

  return komponenten
}

function rgbZuHsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const value = max / 255
  const saturation = max === 0 ? 0 : (max - min) / max
  let hue = 0
  if (max !== min) {
    const d = max - min
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) hue = ((b - r) / d + 2) * 60
    else hue = ((r - g) / d + 4) * 60
  }
  return { hue, saturation, value }
}

function rgbZuHex(r: number, g: number, b: number) {
  const teil = (n: number) => n.toString(16).padStart(2, '0')
  return `#${teil(r)}${teil(g)}${teil(b)}`
}
