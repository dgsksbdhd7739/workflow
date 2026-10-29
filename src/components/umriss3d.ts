// Geometrien fuer Geschosse mit echtem Grundriss-Umriss (aus Plaenen, siehe
// src/lib/planAnalyse.ts). Nur von den lazy geladenen 3D-Komponenten genutzt.

import { useEffect, useMemo, useState } from 'react'
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, ExtrudeGeometry, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, Shape, ShapeGeometry, type Texture, TextureLoader } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getSignedUrl } from '../lib/backend'

type Polygon = [number, number][]
type TuerDaten = { x: number; z: number; breite: number; tiefe?: number; winkel: 0 | 90 }
type WandRaster = { aufloesung: number; x0: number; z0: number; rechtecke: number[] }

// Bauteilhoehen: Fensterbruestung
// 0,90 m (Aufenthaltsraeume, je nach Landesbauordnung 0,80-0,90 m), Fenstersturz
// 2,135 m (Hoehe der hohen Normtuer nach DIN 18101).
export const BRUESTUNG = 0.9
export const FENSTER_STURZ = 2.135

/** Sammelt achsparallele Quader (ohne Boden) direkt als Dreiecke -- tausende Wandstuecke in einer Geometrie. */
function quaderSammler() {
  const pos: number[] = []
  const nor: number[] = []
  const viereck = (a: number[], b: number[], c: number[], d: number[], n: number[]) => {
    for (const p of [a, b, c, a, c, d]) {
      pos.push(p[0], p[1], p[2])
      nor.push(n[0], n[1], n[2])
    }
  }
  return {
    quader(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
      if (x1 - x0 < 0.005 || y1 - y0 < 0.005 || z1 - z0 < 0.005) return
      viereck([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0])
      viereck([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0])
      viereck([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0])
      viereck([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1])
      viereck([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1])
    },
    geometrie() {
      if (!pos.length) return null
      const g = new BufferGeometry()
      g.setAttribute('position', new Float32BufferAttribute(pos, 3))
      g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
      return g
    },
  }
}

/** Grundflaeche einer Oeffnung (Tuer/Fenster) als Rechteck x0..x1, z0..z1. */
function oeffnungsFlaeche(t: TuerDaten) {
  const tiefe = (t.tiefe ?? 0.3) + 0.02
  const [bx, bz] = t.winkel === 0 ? [t.breite, tiefe] : [tiefe, t.breite]
  return { x0: t.x - bx / 2, x1: t.x + bx / 2, z0: t.z - bz / 2, z1: t.z + bz / 2 }
}

/**
 * Waende 1:1 aus dem Wandraster des Plans (y = 0 bis hoehe). Tueroeffnungen
 * sind im Raster frei und bleiben ein offenes Loch in der Wand (kein Tuerblatt,
 * kein Sturz); Fenster bekommen Bruestung und Sturz, dazwischen Glas.
 */
export function useRasterWaende(raster: WandRaster | null | undefined, fenster: TuerDaten[] | null | undefined, hoehe: number) {
  const ergebnis = useMemo(() => {
    if (!raster?.rechtecke.length) return null
    const wand = quaderSammler()
    const glas = quaderSammler()
    const { aufloesung: a, x0, z0, rechtecke } = raster
    for (let i = 0; i + 3 < rechtecke.length; i += 4) {
      const x = x0 + rechtecke[i] * a
      const z = z0 + rechtecke[i + 1] * a
      wand.quader(x, 0, z, x + rechtecke[i + 2] * a, hoehe, z + rechtecke[i + 3] * a)
    }
    for (const t of fenster ?? []) {
      const f = oeffnungsFlaeche(t)
      wand.quader(f.x0, 0, f.z0, f.x1, Math.min(BRUESTUNG, hoehe), f.z1)
      if (hoehe > FENSTER_STURZ) wand.quader(f.x0, FENSTER_STURZ, f.z0, f.x1, hoehe, f.z1)
      if (hoehe > BRUESTUNG) {
        const mx = (f.x0 + f.x1) / 2
        const mz = (f.z0 + f.z1) / 2
        const [gx, gz] = t.winkel === 0 ? [(f.x1 - f.x0) / 2, 0.01] : [0.01, (f.z1 - f.z0) / 2]
        glas.quader(mx - gx, BRUESTUNG, mz - gz, mx + gx, Math.min(FENSTER_STURZ, hoehe), mz + gz)
      }
    }
    return { wand: wand.geometrie(), glas: glas.geometrie() }
  }, [raster, fenster, hoehe])
  useEffect(
    () => () => {
      ergebnis?.wand?.dispose()
      ergebnis?.glas?.dispose()
    },
    [ergebnis],
  )
  return ergebnis
}

/**
 * Waende 1:1 aus dem Plan als ein zusammengefasster Koerper (Weltkoordinaten,
 * y = 0 bis hoehe): jede Raumkante als duenne Wand, der Gebaeudeumriss als
 * Fassade. Robuster als Aussparungen im Umriss, die sich nicht schneiden duerfen.
 */
export function useWandGeometrie(
  umriss: Polygon | null | undefined,
  raeume: { punkte: Polygon }[] | null | undefined,
  hoehe: number,
  tueren: TuerDaten[] | null | undefined = null,
) {
  const geometrie = useMemo(() => {
    if (!raeume?.length) return null
    const teile: BufferGeometry[] = []
    // Wandstueck von a bis b (Meter entlang der Kante) als Box
    const stueck = (x1: number, z1: number, ux: number, uz: number, a: number, b: number, dicke: number) => {
      const laenge = b - a
      if (laenge < 0.05) return
      const box = new BoxGeometry(laenge, hoehe, dicke)
      box.rotateY(-Math.atan2(uz, ux))
      const m = (a + b) / 2
      box.translate(x1 + ux * m, hoehe / 2, z1 + uz * m)
      teile.push(box)
    }
    const kanten = (punkte: Polygon, dicke: number) => {
      punkte.forEach(([x1, z1], i) => {
        const [x2, z2] = punkte[(i + 1) % punkte.length]
        const laenge = Math.hypot(x2 - x1, z2 - z1)
        if (laenge < 0.05) return
        const ux = (x2 - x1) / laenge
        const uz = (z2 - z1) / laenge
        // Tueren, die in dieser Wand liegen (gleiche Richtung, nah an der Kante), ausschneiden
        const luecken = (tueren ?? [])
          .filter((t) => (t.winkel === 0 ? Math.abs(ux) > 0.7 : Math.abs(uz) > 0.7))
          .map((t) => {
            const entlang = (t.x - x1) * ux + (t.z - z1) * uz
            const quer = Math.abs((t.x - x1) * uz - (t.z - z1) * ux)
            return { von: entlang - t.breite / 2, bis: entlang + t.breite / 2, quer }
          })
          .filter((l) => l.quer < 0.45 && l.bis > 0 && l.von < laenge)
          .sort((a, b) => a.von - b.von)
        let pos = -dicke / 2
        for (const l of luecken) {
          stueck(x1, z1, ux, uz, pos, Math.max(pos, l.von), dicke)
          pos = Math.max(pos, l.bis)
        }
        stueck(x1, z1, ux, uz, pos, laenge + dicke / 2, dicke)
      })
    }
    for (const raum of raeume) kanten(raum.punkte, 0.12)
    if (umriss) kanten(umriss, 0.3)
    const gesamt = teile.length ? mergeGeometries(teile) : null
    teile.forEach((t) => t.dispose())
    return gesamt
  }, [umriss, raeume, hoehe, tueren])
  useEffect(() => () => geometrie?.dispose(), [geometrie])
  return geometrie
}

/** Flache Bodenflaeche eines Raums (in der XY-Ebene, wie useUmrissGeometrie zu drehen). */
export function useFlaechenGeometrie(punkte: Polygon) {
  const geometrie = useMemo(() => {
    const form = new Shape()
    punkte.forEach(([x, z], i) => (i ? form.lineTo(x, -z) : form.moveTo(x, -z)))
    form.closePath()
    return new ShapeGeometry(form)
  }, [punkte])
  useEffect(() => () => geometrie.dispose(), [geometrie])
  return geometrie
}

/**
 * Umriss (x nach rechts, z nach unten wie auf dem Plan) als senkrecht
 * extrudierter Koerper von y = 0 bis y = hoehe. Die Form liegt in der XY-Ebene
 * mit y = -z und wird um -90 Grad um X gedreht (rotation={[-PI/2, 0, 0]}).
 */
export function useUmrissGeometrie(umriss: [number, number][] | null | undefined, hoehe: number) {
  const geometrie = useMemo(() => {
    if (!umriss || umriss.length < 3) return null
    const form = new Shape()
    umriss.forEach(([x, z], i) => (i ? form.lineTo(x, -z) : form.moveTo(x, -z)))
    form.closePath()
    return new ExtrudeGeometry(form, { depth: hoehe, bevelEnabled: false })
  }, [umriss, hoehe])
  useEffect(() => () => geometrie?.dispose(), [geometrie])
  return geometrie
}

/** Grundrissbild aus dem Bucket "plaene" als Textur (null, solange es laedt oder fehlt). */
export function useGrundrissTextur(pfad: string | null | undefined, anisotropie = 1) {
  const [textur, setTextur] = useState<Texture | null>(null)
  useEffect(() => {
    if (!pfad) return
    let abgebrochen = false
    let geladen: Texture | null = null
    getSignedUrl('plaene', pfad).then(({ url }) => {
      if (!url || abgebrochen) return
      new TextureLoader().load(url, (t) => {
        if (abgebrochen) {
          t.dispose()
          return
        }
        t.colorSpace = SRGBColorSpace
        // Mipmaps + anisotrope Filterung: scharf von nah und schraeg, ohne Flimmern von weitem
        t.minFilter = LinearMipmapLinearFilter
        t.magFilter = LinearFilter
        t.generateMipmaps = true
        t.anisotropy = anisotropie
        geladen = t
        setTextur(t)
      })
    })
    return () => {
      abgebrochen = true
      geladen?.dispose()
      setTextur(null)
    }
  }, [pfad, anisotropie])
  return textur
}
