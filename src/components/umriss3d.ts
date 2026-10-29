// Geometrien fuer Geschosse mit echtem Grundriss-Umriss (aus Plaenen, siehe
// src/lib/planAnalyse.ts). Nur von den lazy geladenen 3D-Komponenten genutzt.

import { useEffect, useMemo, useState } from 'react'
import { BoxGeometry, type BufferGeometry, ExtrudeGeometry, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, Shape, ShapeGeometry, type Texture, TextureLoader } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getSignedUrl } from '../lib/backend'

type Polygon = [number, number][]
type TuerDaten = { x: number; z: number; breite: number; winkel: 0 | 90 }

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

/** Tuerblaetter (leicht geoeffnet) als ein zusammengefasster Koerper, y = 0 bis hoehe. */
export function useTuerGeometrie(tueren: TuerDaten[] | null | undefined, hoehe: number) {
  const geometrie = useMemo(() => {
    if (!tueren?.length) return null
    const teile = tueren.map((t) => {
      const blatt = Math.max(t.breite - 0.08, 0.4)
      const box = new BoxGeometry(blatt, hoehe, 0.05)
      // Drehpunkt an einem Ende der Oeffnung, Blatt um 30 Grad aufgeschwenkt
      box.translate(blatt / 2, hoehe / 2, 0)
      box.rotateY((t.winkel === 90 ? -Math.PI / 2 : 0) - Math.PI / 6)
      const ux = t.winkel === 0 ? 1 : 0
      const uz = t.winkel === 0 ? 0 : 1
      box.translate(t.x - (ux * t.breite) / 2, 0, t.z - (uz * t.breite) / 2)
      return box
    })
    const gesamt = mergeGeometries(teile)
    teile.forEach((t) => t.dispose())
    return gesamt
  }, [tueren, hoehe])
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
