// Liest Grundriss-PDFs aus, um ein Gebaeude in 3D aufzubauen: Geschoss (aus
// dem Plantitel), Massstab, Aussenumriss (aus den grau gefuellten Wandflaechen),
// Einheiten (grosse Raum-/Zimmernummern) und Achsraster (zum exakten
// Uebereinanderlegen der Etagen). Laeuft komplett im Browser mit pdfjs.
//
// Koordinaten: Meter auf dem Blatt, x nach rechts, z nach unten (wie der Plan
// gezeichnet ist). gebaeudeZusammensetzen() verschiebt alle Etagen in ein
// gemeinsames, um den Gebaeudemittelpunkt zentriertes System.

import type { PDFPageProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { pdfjsLaden } from './pdfLaden'

export type Punkt = [number, number]

export interface Lage {
  x: number
  z: number
  breite: number
  tiefe: number
}

export interface SeitenAnalyse {
  seite: number
  ebene: number | null
  // Woher die Ebene stammt: Plantitel auf dem Blatt oder Name des Plans
  ebeneQuelle: 'titel' | 'name' | null
  titel: string | null
  massstab: number
  massstabErkannt: boolean
  achsenX: Record<string, number>
  achsenY: Record<string, number>
  umriss: Punkt[] | null
  flaecheM2: number
  einheiten: { name: string; x: number; z: number }[]
  raeume: Raum[]
  waende: WandRaster | null
}

/**
 * Waende 1:1 aus dem Plan als Rechtecke im Raster (aufloesung Meter pro
 * Zelle): rechtecke = [x, z, breite, tiefe, x, z, ...] in Zellen, Ursprung
 * (x0, z0) in Metern. Oeffnungen im Plan (Tueren, Fenster) bleiben Luecken.
 */
export interface WandRaster {
  aufloesung: number
  x0: number
  z0: number
  rechtecke: number[]
}

/** Raum aus dem Grundriss: Flaeche zwischen den Waenden, 1:1 in Metern. */
export interface Raum {
  punkte: Punkt[]
  // Raumnummer aus dem Raumstempel (z. B. "301.20") und Einheit in Klammern ("301")
  nr: string | null
  einheit: string | null
  flaeche: number
  // 'flur': langer, schmaler Raum (Gang)
  typ?: 'flur' | null
}

const PT_IN_M = 0.0254 / 72
const MASKE_M_PRO_PX = 0.1
// Raeume brauchen feinere Aufloesung: Trockenbauwaende sind nur ~10 cm dick
const RAUM_M_PRO_PX = 0.05
// Tueroeffnungen bis ca. 1 m schliessen, damit Raeume nicht ineinanderlaufen
const TUER_M = 0.6
// 1,25 cm pro Pixel: Plantexte (1:50, ~10 cm hoch) bleiben beim Heranzoomen lesbar
const BILD_M_PRO_PX = 0.0125
const BILD_MAX_PX = 8192
// Fenster und Tueren in Aussenwaenden ueberbruecken: erst bis ca. 2,4 m, bei
// zu wenig geschlossener Flaeche schrittweise groessere Luecken
const SCHLIESSEN_M = [1.2, 2, 3]
const UEBLICHE_MASSSTAEBE = new Set([10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000])

interface Text {
  str: string
  x: number
  y: number
  h: number
  // Nachtraeglich eingetragene PDF-Anmerkung (z. B. Zimmernummer als FreeText)
  anmerkung?: boolean
}

/** Ebene aus Texten wie "Grundriss 3.Obergeschoss", "1.UG", "Erdgeschoss". */
export function ebeneAusText(text: string, nurGrundriss: boolean): { ebene: number; treffer: string } | null {
  const vorsatz = nurGrundriss ? 'Grundriss\\s*,?\\s*' : '(?:^|[^\\w])'
  const muster: [RegExp, (m: RegExpMatchArray) => number][] = [
    [new RegExp(`${vorsatz}(\\d{1,2})\\s*\\.?\\s*(?:Obergeschoss|OG)`, 'i'), (m) => Number(m[1])],
    [new RegExp(`${vorsatz}(\\d{1,2})\\s*\\.?\\s*(?:Untergeschoss|UG|Kellergeschoss|KG)`, 'i'), (m) => -Number(m[1])],
    [new RegExp(`${vorsatz}(?:Erdgeschoss|EG)(?![a-zäöü])`, 'i'), () => 0],
    [new RegExp(`${vorsatz}(?:Untergeschoss|UG|Kellergeschoss|KG)(?![a-zäöü])`, 'i'), () => -1],
  ]
  for (const [re, ebene] of muster) {
    const m = text.match(re)
    if (m) return { ebene: ebene(m), treffer: m[0].trim() }
  }
  return null
}

function texteLesen(seite: PDFPageProxy, util: { transform: (a: number[], b: number[]) => number[] }) {
  const vp = seite.getViewport({ scale: 1 })
  return seite.getTextContent().then((inhalt) =>
    (inhalt.items as TextItem[])
      .filter((t) => typeof t.str === 'string' && t.str.trim())
      .map((t): Text => {
        const tx = util.transform(vp.transform, t.transform)
        const h = Math.hypot(tx[2], tx[3])
        const laenge = Math.hypot(tx[0], tx[1]) || 1
        const ux = tx[0] / laenge
        const uy = tx[1] / laenge
        // Mitte des Textes: Grundlinie + halbe Breite in Schreibrichtung + halbe Hoehe nach oben
        return {
          str: t.str.trim(),
          x: tx[4] + (ux * t.width) / 2 + tx[2] / 2,
          y: tx[5] + (uy * t.width) / 2 + tx[3] / 2,
          h,
        }
      }),
  )
}

/** Text aus PDF-Anmerkungen (FreeText/Notiz), z. B. von Hand ergaenzte Zimmernummern. */
async function anmerkungenLesen(seite: PDFPageProxy): Promise<Text[]> {
  const vp = seite.getViewport({ scale: 1 })
  const anmerkungen = (await seite.getAnnotations()) as { subtype?: string; rect?: number[]; contentsObj?: { str?: string } }[]
  return anmerkungen
    .filter((a) => (a.subtype === 'FreeText' || a.subtype === 'Text') && a.rect && a.contentsObj?.str?.trim())
    .map((a) => {
      const [x1, y1] = vp.convertToViewportPoint(a.rect![0], a.rect![1])
      const [x2, y2] = vp.convertToViewportPoint(a.rect![2], a.rect![3])
      return { str: a.contentsObj!.str!.trim(), x: (x1 + x2) / 2, y: (y1 + y2) / 2, h: Math.abs(y2 - y1), anmerkung: true }
    })
}

function median(werte: number[]) {
  if (!werte.length) return 0
  const s = [...werte].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function massstabErmitteln(texte: Text[]) {
  const zaehler = new Map<number, number>()
  for (const t of texte) {
    for (const m of t.str.matchAll(/(?:^|[^\d])1\s*:\s*(\d{2,4})(?!\d)/g)) {
      const wert = Number(m[1])
      if (UEBLICHE_MASSSTAEBE.has(wert)) zaehler.set(wert, (zaehler.get(wert) ?? 0) + 1)
    }
  }
  const besterTreffer = [...zaehler.entries()].sort((a, b) => b[1] - a[1])[0]
  return besterTreffer ? { massstab: besterTreffer[0], erkannt: true } : { massstab: 100, erkannt: false }
}

/** Achsbeschriftungen (1, 2, ... / A, B, ...), die oben und unten bzw. links und rechts am Blatt stehen. */
function achsenErmitteln(texte: Text[], breite: number, hoehe: number, mProPt: number) {
  const mh = median(texte.map((t) => t.h))
  const kandidaten = texte.filter((t) => /^([0-9]{1,2}|[A-Z])$/.test(t.str) && t.h >= mh * 1.5)
  const achsenX: Record<string, number> = {}
  const achsenY: Record<string, number> = {}
  const gruppen = new Map<string, Text[]>()
  for (const t of kandidaten) gruppen.set(t.str, [...(gruppen.get(t.str) ?? []), t])
  for (const [name, liste] of gruppen) {
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        const a = liste[i]
        const b = liste[j]
        if (Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) > hoehe * 0.5) achsenX[name] = ((a.x + b.x) / 2) * mProPt
        if (Math.abs(a.y - b.y) < 3 && Math.abs(a.x - b.x) > breite * 0.5) achsenY[name] = ((a.y + b.y) / 2) * mProPt
      }
    }
  }
  return { achsenX, achsenY }
}

function grauwert(stil: unknown): number | null {
  if (typeof stil !== 'string') return null
  const m = stil.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return null
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16))
  return Math.max(r, g, b) - Math.min(r, g, b) <= 8 ? r : null
}

/**
 * Zeichnet nur die neutral-grau gefuellten Flaechen (Wandschnitte in
 * Werkplaenen) schwarz auf weiss. Dafuer bekommt pdfjs einen Zeichenkontext,
 * der alle anderen Zeichenbefehle (Linien, Texte, Bilder, farbige Flaechen)
 * verschluckt.
 */
// Wandkanten sind in CAD-Plaenen mit dickeren Stiften gezeichnet als Moebel,
// Bemassung und Schraffur (dort 0,18-0,25 pt); Trockenbauwaende sind oft nur
// so gezeichnet und nicht grau gefuellt.
const WANDLINIE_MIN_PT = 0.27

/**
 * mitLinien: zusaetzlich dunkle, neutrale Linien ab WANDLINIE_MIN_PT (fuer die
 * Raumerkennung). Die echte Linienbreite wird beim Setzen von lineWidth
 * mitgelesen -- beim Strich selbst hat pdfjs duenne Linien bereits auf 1 Pixel
 * verbreitert (erkennbar daran, dass Breite x Massstab genau 1 ergibt).
 */
async function wandMaske(seite: PDFPageProxy, pxProPt: number, mitLinien = false, schraffur = false) {
  const viewport = seite.getViewport({ scale: pxProPt })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const istWand = () => {
    if (schraffur) return false
    const g = grauwert(ctx.fillStyle)
    return g !== null && g >= 77 && g <= 217
  }
  let linienPt = 0
  const geraetMassstab = () => {
    const m = ctx.getTransform()
    return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))
  }
  const istWandlinie = () => {
    const g = grauwert(ctx.strokeStyle)
    // Schraffur geschnittener Waende: duenne graue Linien zwischen den Wandkanten
    if (schraffur) return g !== null && g >= 90 && g <= 210
    return mitLinien && g !== null && g <= 153 && linienPt >= WANDLINIE_MIN_PT
  }
  const filter = new Proxy(ctx, {
    get(ziel, name) {
      if (name === 'stroke') {
        return (...args: unknown[]) => {
          if (!istWandlinie()) return
          const vorher = ziel.strokeStyle
          ziel.strokeStyle = '#000000'
          ;(ziel.stroke as (...a: unknown[]) => void).apply(ziel, args)
          ziel.strokeStyle = vorher
        }
      }
      if (name === 'fill' || name === 'fillRect') {
        return (...args: unknown[]) => {
          if (!istWand()) return
          const vorher = ziel.fillStyle
          ziel.fillStyle = '#000000'
          ;(ziel[name] as (...a: unknown[]) => void).apply(ziel, args)
          ziel.fillStyle = vorher
        }
      }
      if (['fillText', 'strokeText', 'drawImage', 'putImageData', 'strokeRect'].includes(name as string)) {
        return () => {}
      }
      const wert = Reflect.get(ziel, name)
      return typeof wert === 'function' ? wert.bind(ziel) : wert
    },
    set(ziel, name, wert) {
      if (name === 'lineWidth' && typeof wert === 'number') {
        const geraetBreite = wert * geraetMassstab()
        if (Math.abs(geraetBreite - 1) > 1e-6) linienPt = geraetBreite / pxProPt
      }
      return Reflect.set(ziel, name, wert)
    },
  })
  // Nur canvasContext uebergeben: mit "canvas" holt sich pdfjs 6 selbst einen
  // (ungefilterten) Kontext.
  await seite.render({ canvas: null, canvasContext: filter as CanvasRenderingContext2D, viewport, background: '#ffffff' }).promise
  const daten = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const maske = new Uint8Array(canvas.width * canvas.height)
  for (let i = 0; i < maske.length; i++) maske[i] = daten[i * 4] < 128 ? 1 : 0
  return { maske, breite: canvas.width, hoehe: canvas.height }
}

/** Dilatation (max) bzw. Erosion (min) mit quadratischem Fenster, zeilen- und spaltenweise ueber laufende Summen. */
function morph(m: Uint8Array, w: number, h: number, r: number, art: 'dilatieren' | 'erodieren') {
  const aus = new Uint8Array(m.length)
  const tmp = new Uint8Array(m.length)
  const k = 2 * r + 1
  const rand = art === 'erodieren' ? 1 : 0
  for (let y = 0; y < h; y++) {
    let summe = rand * r
    for (let x = 0; x <= r && x < w; x++) summe += m[y * w + x]
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = art === 'dilatieren' ? (summe > 0 ? 1 : 0) : summe === k ? 1 : 0
      const rein = x + r + 1 < w ? m[y * w + x + r + 1] : rand
      const raus = x - r >= 0 ? m[y * w + x - r] : rand
      summe += rein - raus
    }
  }
  for (let x = 0; x < w; x++) {
    let summe = rand * r
    for (let y = 0; y <= r && y < h; y++) summe += tmp[y * w + x]
    for (let y = 0; y < h; y++) {
      aus[y * w + x] = art === 'dilatieren' ? (summe > 0 ? 1 : 0) : summe === k ? 1 : 0
      const rein = y + r + 1 < h ? tmp[(y + r + 1) * w + x] : rand
      const raus = y - r >= 0 ? tmp[(y - r) * w + x] : rand
      summe += rein - raus
    }
  }
  return aus
}

/** Groesste zusammenhaengende Flaeche innerhalb der (geschlossenen) Waende, Loecher gefuellt. */
function hauptflaeche(wand: Uint8Array, w: number, h: number) {
  const aussen = new Uint8Array(wand.length)
  const warteschlange = new Int32Array(wand.length)
  let kopf = 0
  let ende = 0
  const besuchen = (i: number) => {
    if (!wand[i] && !aussen[i]) {
      aussen[i] = 1
      warteschlange[ende++] = i
    }
  }
  for (let x = 0; x < w; x++) {
    besuchen(x)
    besuchen((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    besuchen(y * w)
    besuchen(y * w + w - 1)
  }
  while (kopf < ende) {
    const i = warteschlange[kopf++]
    const x = i % w
    if (x > 0) besuchen(i - 1)
    if (x < w - 1) besuchen(i + 1)
    if (i >= w) besuchen(i - w)
    if (i < wand.length - w) besuchen(i + w)
  }
  const marke = new Int32Array(wand.length)
  let beste = 0
  let besteGroesse = 0
  let nummer = 0
  for (let start = 0; start < wand.length; start++) {
    if (aussen[start] || marke[start]) continue
    nummer++
    kopf = 0
    ende = 0
    marke[start] = nummer
    warteschlange[ende++] = start
    while (kopf < ende) {
      const i = warteschlange[kopf++]
      const x = i % w
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (n >= 0 && n < wand.length && !aussen[n] && !marke[n]) {
          marke[n] = nummer
          warteschlange[ende++] = n
        }
      }
    }
    if (ende > besteGroesse) {
      besteGroesse = ende
      beste = nummer
    }
  }
  const flaeche = new Uint8Array(wand.length)
  for (let i = 0; i < wand.length; i++) flaeche[i] = marke[i] === beste && beste ? 1 : 0
  return { flaeche, pixel: besteGroesse }
}

/**
 * Aussenkontur einer Pixelflaeche als Polygon (Ecken der Pixelraender, rechte
 * Hand an der Flaeche). f enthaelt je Pixel eine Marke; verfolgt wird die
 * Flaeche mit Marke "wert", beginnend beim ersten Pixel in Zeilenreihenfolge.
 */
function kontur(f: ArrayLike<number> & { indexOf(w: number, ab?: number): number }, w: number, h: number, wert = 1, ab = 0): Punkt[] {
  const innen = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && f[y * w + x] === wert
  const startIndex = f.indexOf(wert, ab)
  if (startIndex < 0) return []
  const sx = startIndex % w
  const sy = Math.floor(startIndex / w)
  let px = sx
  let py = sy
  let dx = 1
  let dy = 0
  const punkte: Punkt[] = [[px, py]]
  for (let schritte = 0; schritte < 4 * f.length; schritte++) {
    px += dx
    py += dy
    if (px === sx && py === sy) break
    // Zellen vorne links / vorne rechts relativ zur Laufrichtung (y nach unten)
    const lx = dy
    const ly = -dx
    const vorneLinks = innen(Math.floor(px + 0.5 * dx + 0.5 * lx), Math.floor(py + 0.5 * dy + 0.5 * ly))
    const vorneRechts = innen(Math.floor(px + 0.5 * dx - 0.5 * lx), Math.floor(py + 0.5 * dy - 0.5 * ly))
    let ndx = dx
    let ndy = dy
    if (!vorneRechts) {
      ndx = -dy
      ndy = dx
    } else if (vorneLinks) {
      ndx = dy
      ndy = -dx
    }
    if (ndx !== dx || ndy !== dy) punkte.push([px, py])
    dx = ndx
    dy = ndy
  }
  return punkte
}

/**
 * Raeume: freie Flaechen zwischen den (an Tueren geschlossenen) Waenden,
 * nur innerhalb des Gebaeudes (dort sind auch die Fenster geschlossen, sonst
 * liefe jedes Zimmer ueber sein Fenster nach draussen).
 */
function raeumeErmitteln(
  wand: Uint8Array,
  w: number,
  h: number,
  fensterMeter: number,
  schraffur: Uint8Array,
): { raeume: { punkte: Punkt[]; pixel: number; typ: 'flur' | null }[]; rechtecke: number[] } {
  const rf = Math.round(fensterMeter / RAUM_M_PRO_PX)
  const zuGross = morph(morph(wand, w, h, rf, 'dilatieren'), w, h, rf, 'erodieren')
  const { flaeche: gebaeude } = hauptflaeche(zuGross, w, h)
  const r = Math.round(TUER_M / RAUM_M_PRO_PX)
  const zu = morph(morph(wand, w, h, r, 'dilatieren'), w, h, r, 'erodieren')
  for (let i = 0; i < zu.length; i++) if (!gebaeude[i]) zu[i] = 1
  const marke = new Int32Array(zu.length)
  const warteschlange = new Int32Array(zu.length)
  const minPixel = 1.5 / RAUM_M_PRO_PX ** 2
  const maxPixel = 1500 / RAUM_M_PRO_PX ** 2
  const ergebnis: { punkte: Punkt[]; pixel: number }[] = []
  let nummer = 0
  for (let start = 0; start < zu.length; start++) {
    if (zu[start] || marke[start]) continue
    nummer++
    let kopf = 0
    let ende = 0
    let amRand = false
    marke[start] = nummer
    warteschlange[ende++] = start
    while (kopf < ende) {
      const i = warteschlange[kopf++]
      const x = i % w
      if (x === 0 || x === w - 1 || i < w || i >= zu.length - w) amRand = true
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (n >= 0 && n < zu.length && !zu[n] && !marke[n]) {
          marke[n] = nummer
          warteschlange[ende++] = n
        }
      }
    }
    if (amRand || ende < minPixel || ende > maxPixel) continue
    const punkte = vereinfachen(kontur(marke, w, h, nummer, start), 2).map(([x, y]): Punkt => [x * RAUM_M_PRO_PX, y * RAUM_M_PRO_PX])
    if (punkte.length >= 3) ergebnis.push({ punkte, pixel: ende })
  }

  // Volle Wandflaeche: gefuellte Wandschnitte, dicke Wandkanten und die Schraffur
  // zwischen ihnen (nur nahe an Wandlinien, damit Achs-/Masslinien quer durch
  // Raeume keine Waende erzeugen); Doppellinien duenner Waende bis 20 cm geschlossen.
  const nahWand = morph(wand, w, h, 4, 'dilatieren')
  const schraffurFlaeche = morph(morph(schraffur, w, h, 3, 'dilatieren'), w, h, 3, 'erodieren')
  const roh = new Uint8Array(wand.length)
  for (let i = 0; i < roh.length; i++) roh[i] = wand[i] || (schraffurFlaeche[i] && nahWand[i]) ? 1 : 0
  const geschlossen = morph(morph(roh, w, h, 2, 'dilatieren'), w, h, 2, 'erodieren')
  const imGebaeude = morph(gebaeude, w, h, 2, 'dilatieren')
  for (let i = 0; i < geschlossen.length; i++) if (!imGebaeude[i]) geschlossen[i] = 0
  // Kleine Einzelteile (dick gezeichnete Sanitaerobjekte, Moebel, Symbole) unter 0,3 m2 verwerfen
  const fest = new Uint8Array(geschlossen.length)
  {
    const gesehen = new Uint8Array(geschlossen.length)
    const minWand = 0.3 / RAUM_M_PRO_PX ** 2
    for (let start = 0; start < geschlossen.length; start++) {
      if (!geschlossen[start] || gesehen[start]) continue
      let kopf = 0
      let ende = 0
      gesehen[start] = 1
      warteschlange[ende++] = start
      while (kopf < ende) {
        const i = warteschlange[kopf++]
        const x = i % w
        for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
          if (n >= 0 && n < geschlossen.length && geschlossen[n] && !gesehen[n]) {
            gesehen[n] = 1
            warteschlange[ende++] = n
          }
        }
      }
      if (ende >= minWand) for (let k = 0; k < ende; k++) fest[warteschlange[k]] = 1
    }
  }

  // Waende 1:1 als Rechtecke (Laeufe je Zeile, gleiche Laeufe in Folgezeilen verlaengert)
  const rechtecke: number[] = []
  let offen = new Map<number, { x0: number; x1: number; y0: number }>()
  for (let y = 0; y <= h; y++) {
    const jetzt = new Map<number, { x0: number; x1: number; y0: number }>()
    if (y < h) {
      let x = 0
      while (x < w) {
        const i = y * w + x
        if (!fest[i]) {
          x++
          continue
        }
        const x0 = x
        while (x < w && fest[y * w + x]) x++
        const schluessel = x0 * 100000 + x
        jetzt.set(schluessel, offen.get(schluessel) ?? { x0, x1: x, y0: y })
      }
    }
    for (const [schluessel, l] of offen) {
      if (!jetzt.has(schluessel)) rechtecke.push(l.x0, l.y0, l.x1 - l.x0, y - l.y0)
    }
    offen = jetzt
  }

  // Flure: lang und schmal nach Aussenmass
  const raeume = ergebnis.map(({ punkte, pixel }) => {
    const flaecheM2 = pixel * RAUM_M_PRO_PX * RAUM_M_PRO_PX
    const g = grenzen(punkte)
    const lang = Math.max(g.maxX - g.minX, g.maxZ - g.minZ)
    // Breite, wenn die Flaeche ueber die ganze Laenge verteilt waere (gerader Gang)
    const breite = flaecheM2 / Math.max(lang, 0.01)
    const flur = lang >= 8 && breite <= 2.6 && lang / breite >= 4
    return { punkte, pixel, typ: flur ? ('flur' as const) : null }
  })

  return { raeume, rechtecke }
}

function vereinfachen(punkte: Punkt[], toleranz: number): Punkt[] {
  if (punkte.length < 4) return punkte
  const abstand = (p: Punkt, a: Punkt, b: Punkt) => {
    const [x, y] = p
    const [x1, y1] = a
    const [x2, y2] = b
    const l = Math.hypot(x2 - x1, y2 - y1)
    return l === 0 ? Math.hypot(x - x1, y - y1) : Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / l
  }
  const dp = (liste: Punkt[]): Punkt[] => {
    let max = 0
    let index = 0
    for (let i = 1; i < liste.length - 1; i++) {
      const d = abstand(liste[i], liste[0], liste[liste.length - 1])
      if (d > max) {
        max = d
        index = i
      }
    }
    if (max <= toleranz) return [liste[0], liste[liste.length - 1]]
    return [...dp(liste.slice(0, index + 1)).slice(0, -1), ...dp(liste.slice(index))]
  }
  // Geschlossenen Ring an zwei weit entfernten Punkten aufteilen
  const mitte = Math.floor(punkte.length / 2)
  const ergebnis = [...dp(punkte.slice(0, mitte + 1)).slice(0, -1), ...dp([...punkte.slice(mitte), punkte[0]]).slice(0, -1)]
  return ergebnis.length >= 3 ? ergebnis : punkte
}

export function flaeche(polygon: Punkt[]) {
  let s = 0
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i]
    const [x2, z2] = polygon[(i + 1) % polygon.length]
    s += x1 * z2 - x2 * z1
  }
  return Math.abs(s) / 2
}

export function punktInPolygon([x, z]: Punkt, polygon: Punkt[]) {
  let drin = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) drin = !drin
  }
  return drin
}

/** Abstand eines Punkts zum Rand des Polygons (0, wenn innen). */
function abstandZumPolygon(p: Punkt, polygon: Punkt[]) {
  if (punktInPolygon(p, polygon)) return 0
  let min = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i]
    const [x2, z2] = polygon[(i + 1) % polygon.length]
    const l2 = (x2 - x1) ** 2 + (z2 - z1) ** 2
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - x1) * (x2 - x1) + (p[1] - z1) * (z2 - z1)) / l2)) : 0
    min = Math.min(min, Math.hypot(p[0] - (x1 + t * (x2 - x1)), p[1] - (z1 + t * (z2 - z1))))
  }
  return min
}

function grenzen(polygon: Punkt[]) {
  const xs = polygon.map((p) => p[0])
  const zs = polygon.map((p) => p[1])
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
}

/**
 * Planausschnitt um den Umriss als Bild (Boden der Etage in 3D). umriss in
 * Blatt-Metern; die Lage des Bilds kommt ebenfalls in Blatt-Metern zurueck.
 */
export async function grundrissBild(seite: PDFPageProxy, massstab: number, umriss: Punkt[]) {
  const mProPt = PT_IN_M * massstab
  const g = grenzen(umriss)
  const rand = 2
  let mProPx = BILD_M_PRO_PX
  const breiteM = g.maxX - g.minX + 2 * rand
  const tiefeM = g.maxZ - g.minZ + 2 * rand
  // Groesser kann kaum eine Grafikkarte; Geraete mit kleinerem Limit verkleinert three.js selbst
  mProPx = Math.max(mProPx, breiteM / BILD_MAX_PX, tiefeM / BILD_MAX_PX)
  const pxProPt = mProPt / mProPx
  const lage: Lage = { x: g.minX - rand, z: g.minZ - rand, breite: breiteM, tiefe: tiefeM }
  const viewport = seite.getViewport({ scale: pxProPt, offsetX: -lage.x / mProPx, offsetY: -lage.z / mProPx })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(breiteM / mProPx)
  canvas.height = Math.ceil(tiefeM / mProPx)
  const ctx = canvas.getContext('2d')!
  await seite.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' }).promise
  const bild = await new Promise<Blob | null>((fertig) => canvas.toBlob(fertig, 'image/webp', 0.85))
  return { bild, lage }
}

export async function seiteAnalysieren(seite: PDFPageProxy, planName: string | null): Promise<SeitenAnalyse> {
  const pdfjs = await pdfjsLaden()
  const vp = seite.getViewport({ scale: 1 })
  const texte = [...(await texteLesen(seite, pdfjs.Util)), ...(await anmerkungenLesen(seite))]
  const { massstab, erkannt } = massstabErmitteln(texte)
  const mProPt = PT_IN_M * massstab

  // Titel des Blatts ("Grundriss 3.Obergeschoss ..."), sonst der Name des Plans
  const alles = texte.map((t) => t.str).join(' ')
  let ebeneTreffer = ebeneAusText(alles, true)
  let quelle: SeitenAnalyse['ebeneQuelle'] = ebeneTreffer ? 'titel' : null
  if (!ebeneTreffer && planName) {
    ebeneTreffer = ebeneAusText(planName.replace(/\.pdf$/i, ''), false)
    quelle = ebeneTreffer ? 'name' : null
  }

  const { achsenX, achsenY } = achsenErmitteln(texte, vp.width, vp.height, mProPt)

  const { maske, breite, hoehe } = await wandMaske(seite, mProPt / MASKE_M_PRO_PX)
  let umriss: Punkt[] | null = null
  let flaecheM2 = 0
  let fensterMeter = SCHLIESSEN_M[0]
  for (const meter of SCHLIESSEN_M) {
    fensterMeter = meter
    const r = Math.round(meter / MASKE_M_PRO_PX)
    const geschlossen = morph(morph(maske, breite, hoehe, r, 'dilatieren'), breite, hoehe, r, 'erodieren')
    const { flaeche: haupt, pixel } = hauptflaeche(geschlossen, breite, hoehe)
    flaecheM2 = pixel * MASKE_M_PRO_PX * MASKE_M_PRO_PX
    if (flaecheM2 < 30) continue
    umriss = vereinfachen(kontur(haupt, breite, hoehe), 2.5).map(([x, y]): Punkt => [x * MASKE_M_PRO_PX, y * MASKE_M_PRO_PX])
    // Bleibt eine Aussenwand offen, laeuft das Innere "nach draussen" und
    // uebrig bleibt nur ein duenner Wandring: wenig Flaeche im Verhaeltnis zur Ausdehnung.
    const g = grenzen(umriss)
    if (flaecheM2 >= (g.maxX - g.minX) * (g.maxZ - g.minZ) * 0.35) break
  }

  // Einheiten: grosse Raum-/Zimmernummern (z. B. 301) oder "Whg 3", "WE 12"
  const mh = median(texte.filter((t) => !t.anmerkung).map((t) => t.h))
  // Beschriftungen stehen oft an der Fassade -- daher 5 m Rand um den Umriss
  const g = umriss ? grenzen(umriss) : null
  const nahe = ([x, z]: Punkt) => !g || (x > g.minX - 5 && x < g.maxX + 5 && z > g.minZ - 5 && z < g.maxZ + 5)
  const gefunden = new Map<string, { name: string; x: number; z: number; n: number }>()
  for (const t of texte) {
    const nummer = /^\d{3,4}[a-z]?$/i.test(t.str) && (t.anmerkung || t.h >= mh * 2.5)
    const bezeichnung = /^(Whg|WE|Wohnung|App(artement)?|Zi(mmer)?|Einheit)\.?\s*\d+[a-z]?$/i.test(t.str) && t.h >= mh
    if (!nummer && !bezeichnung) continue
    const p: Punkt = [t.x * mProPt, t.y * mProPt]
    if (t.anmerkung ? !nahe(p) : umriss && !punktInPolygon(p, umriss)) continue
    const bisher = gefunden.get(t.str)
    if (bisher) {
      bisher.x += p[0]
      bisher.z += p[1]
      bisher.n++
    } else gefunden.set(t.str, { name: t.str, x: p[0], z: p[1], n: 1 })
  }
  const einheiten = [...gefunden.values()]
    .map((e) => ({ name: e.name, x: e.x / e.n, z: e.z / e.n }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))

  // Raeume 1:1 aus den Waenden; Raumstempel "301.20 (301)" geben Nummer und Einheit
  const fein = await wandMaske(seite, mProPt / RAUM_M_PRO_PX, true)
  const stempel = texte
    .map((t) => ({ t, m: t.str.match(/^(\d{1,4}[.,]\d{1,3}[a-z]?)(?:\s*\(\s*([\w.-]+)\s*\))?$/i) }))
    .filter((x): x is { t: Text; m: RegExpMatchArray } => !!x.m)
    .map(({ t, m }) => ({ p: [t.x * mProPt, t.y * mProPt] as Punkt, nr: m[1], einheit: m[2] ?? null }))
  const schraffur = await wandMaske(seite, mProPt / RAUM_M_PRO_PX, false, true)
  const raumErgebnis = raeumeErmitteln(fein.maske, fein.breite, fein.hoehe, fensterMeter, schraffur.maske)
  const waende: WandRaster = { aufloesung: RAUM_M_PRO_PX, x0: 0, z0: 0, rechtecke: raumErgebnis.rechtecke }
  const raeume: Raum[] = raumErgebnis.raeume.map(({ punkte, pixel, typ }) => {
    const drin = stempel.filter((s) => punktInPolygon(s.p, punkte))
    const bester = drin.find((s) => s.einheit) ?? drin[0]
    return {
      punkte,
      nr: bester?.nr ?? null,
      einheit: bester?.einheit ?? null,
      flaeche: Math.round(pixel * RAUM_M_PRO_PX * RAUM_M_PRO_PX * 10) / 10,
      typ,
    }
  })

  return {
    seite: seite.pageNumber,
    ebene: ebeneTreffer?.ebene ?? null,
    ebeneQuelle: quelle,
    titel: ebeneTreffer?.treffer ?? null,
    massstab,
    massstabErkannt: erkannt,
    achsenX,
    achsenY,
    umriss,
    flaecheM2,
    einheiten,
    raeume,
    waende,
  }
}

export interface Etage {
  ebene: number
  umriss: Punkt[] | null
  umrissUebernommen: boolean
  einheiten: { name: string; x: number; z: number }[]
  raeume: Raum[]
  waende: WandRaster | null
  // Gebaeudekoordinaten + blattVersatz = Blatt-Meter dieser Etage (fuer grundrissBild)
  blattVersatz: { x: number; z: number }
}

/**
 * Legt die Etagen uebereinander: Versatz ueber gemeinsame Achsbeschriftungen,
 * sonst ueber die Blattlage. Etagen ohne brauchbaren Umriss (z. B. Dachraum mit
 * Schraegen statt Waenden) uebernehmen den Umriss der Etage darunter.
 * Ergebnis zentriert auf den Gebaeudemittelpunkt.
 */
export function gebaeudeZusammensetzen(analysen: (SeitenAnalyse & { ebene: number })[]) {
  if (!analysen.length) return { etagen: [] as Etage[], breite: 0, tiefe: 0 }
  const referenz = [...analysen].sort(
    (a, b) => Object.keys(b.achsenX).length - Object.keys(a.achsenX).length || Math.abs(a.ebene) - Math.abs(b.ebene),
  )[0]
  const mitte = (u: Punkt[] | null) => {
    if (!u) return null
    const g = grenzen(u)
    return { x: (g.minX + g.maxX) / 2, z: (g.minZ + g.maxZ) / 2 }
  }
  const versatz = (a: SeitenAnalyse) => {
    const mittelwert = (ref: Record<string, number>, eigen: Record<string, number>) => {
      const gemeinsam = Object.keys(eigen).filter((k) => k in ref)
      // Erst ab zwei gemeinsamen Achsen verlaesslich (einzelne Buchstaben stehen auch anderswo)
      return gemeinsam.length >= 2 ? gemeinsam.reduce((s, k) => s + ref[k] - eigen[k], 0) / gemeinsam.length : null
    }
    const mr = mitte(referenz.umriss)
    const ma = mitte(a.umriss)
    const dx = mittelwert(referenz.achsenX, a.achsenX) ?? (mr && ma ? mr.x - ma.x : 0)
    // Ohne gemeinsame Querachsen: Plaene eines Satzes liegen meist gleich auf dem Blatt
    const dz = mittelwert(referenz.achsenY, a.achsenY) ?? 0
    return { dx, dz }
  }

  const sortiert = [...analysen].sort((a, b) => a.ebene - b.ebene)
  const etagen: Etage[] = []
  for (const a of sortiert) {
    const { dx, dz } = versatz(a)
    const schieben = ([x, z]: Punkt): Punkt => [x + dx, z + dz]
    let umriss = a.umriss?.map(schieben) ?? null
    let uebernommen = false
    const darunter = [...etagen].reverse().find((e) => e.umriss)
    const einheiten = a.einheiten.map((e) => ({ ...e, x: e.x + dx, z: e.z + dz }))
    // Umriss unplausibel, wenn mehr als ein Drittel der Einheiten deutlich ausserhalb liegt
    // (Nummern stehen oft knapp vor der Fassade, daher 3 m Spielraum)
    const ausserhalb = umriss ? einheiten.filter((e) => abstandZumPolygon([e.x, e.z], umriss!) > 3).length : 0
    // Gleich viele Einheiten wie darunter, aber deutlich kleiner: Wand nicht geschlossen erkannt
    const zuKlein =
      !!umriss && !!darunter?.umriss && einheiten.length >= 3 &&
      einheiten.length >= darunter.einheiten.length * 0.8 && flaeche(umriss) < flaeche(darunter.umriss) * 0.6
    const unplausibel = (einheiten.length >= 3 && ausserhalb > einheiten.length / 3) || zuKlein
    if (darunter?.umriss && (!umriss || unplausibel || flaeche(umriss) < flaeche(darunter.umriss) * 0.25)) {
      umriss = darunter.umriss
      uebernommen = true
    }
    // Nur Raeume innerhalb des Gebaeudes (Schwerpunkt im Umriss)
    const raeume = a.raeume
      .map((raum) => ({ ...raum, punkte: raum.punkte.map(schieben) }))
      .filter((raum) => {
        if (!umriss) return true
        const sx = raum.punkte.reduce((s, q) => s + q[0], 0) / raum.punkte.length
        const sz = raum.punkte.reduce((s, q) => s + q[1], 0) / raum.punkte.length
        return abstandZumPolygon([sx, sz], umriss) < 0.5
      })
    // Einheiten, die nur ueber Raumstempel bekannt sind, in die Mitte ihrer Raeume
    for (const name of new Set(raeume.map((x) => x.einheit).filter((x): x is string => !!x))) {
      if (einheiten.some((e) => e.name === name)) continue
      const punkte = raeume.filter((x) => x.einheit === name).flatMap((x) => x.punkte)
      einheiten.push({
        name,
        x: punkte.reduce((s, q) => s + q[0], 0) / punkte.length,
        z: punkte.reduce((s, q) => s + q[1], 0) / punkte.length,
      })
    }
    // Raumstempel stehen oft ausserhalb in Beschriftungskaesten: Raeume ohne
    // Einheit dem naechsten Einheiten-Schild zuordnen (Flure/Hallen > 80 m2 nicht)
    for (const raum of raeume) {
      if (raum.einheit || raum.flaeche > 80) continue
      let bester: { name: string; d: number } | null = null
      for (const e of einheiten) {
        const d = abstandZumPolygon([e.x, e.z], raum.punkte)
        if (d <= 4 && (!bester || d < bester.d)) bester = { name: e.name, d }
      }
      if (bester) raum.einheit = bester.name
    }
    etagen.push({
      ebene: a.ebene,
      umriss,
      umrissUebernommen: uebernommen,
      einheiten,
      raeume,
      waende: a.waende ? { ...a.waende, x0: a.waende.x0 + dx, z0: a.waende.z0 + dz } : null,
      blattVersatz: { x: -dx, z: -dz },
    })
  }

  const alle = etagen.flatMap((e) => e.umriss ?? [])
  if (!alle.length) return { etagen, breite: 0, tiefe: 0 }
  const g = grenzen(alle)
  const cx = (g.minX + g.maxX) / 2
  const cz = (g.minZ + g.maxZ) / 2
  const r = (v: number) => Math.round(v * 100) / 100
  const zentrieren = ([x, z]: Punkt): Punkt => [r(x - cx), r(z - cz)]
  return {
    breite: r(g.maxX - g.minX),
    tiefe: r(g.maxZ - g.minZ),
    etagen: etagen.map((e) => ({
      ...e,
      umriss: e.umriss?.map(zentrieren) ?? null,
      blattVersatz: { x: e.blattVersatz.x + cx, z: e.blattVersatz.z + cz },
      einheiten: e.einheiten.map((x) => {
        const [px, pz] = zentrieren([x.x, x.z])
        return { name: x.name, x: px, z: pz }
      }),
      raeume: e.raeume.map((x) => ({ ...x, punkte: x.punkte.map(zentrieren) })),
      waende: e.waende ? { ...e.waende, x0: r(e.waende.x0 - cx), z0: r(e.waende.z0 - cz) } : null,
    })),
  }
}
