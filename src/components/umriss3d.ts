// Geometrien fuer Geschosse mit echtem Grundriss-Umriss (aus Plaenen, siehe
// src/lib/planAnalyse.ts). Nur von den lazy geladenen 3D-Komponenten genutzt.

import { useEffect, useMemo, useState } from 'react'
import { BoxGeometry, type BufferGeometry, ExtrudeGeometry, LinearFilter, SRGBColorSpace, Shape, ShapeGeometry, type Texture, TextureLoader } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getSignedUrl } from '../lib/backend'

type Polygon = [number, number][]

/**
 * Waende 1:1 aus dem Plan als ein zusammengefasster Koerper (Weltkoordinaten,
 * y = 0 bis hoehe): jede Raumkante als duenne Wand, der Gebaeudeumriss als
 * Fassade. Robuster als Aussparungen im Umriss, die sich nicht schneiden duerfen.
 */
export function useWandGeometrie(umriss: Polygon | null | undefined, raeume: { punkte: Polygon }[] | null | undefined, hoehe: number) {
  const geometrie = useMemo(() => {
    if (!raeume?.length) return null
    const teile: BufferGeometry[] = []
    const kanten = (punkte: Polygon, dicke: number) => {
      punkte.forEach(([x1, z1], i) => {
        const [x2, z2] = punkte[(i + 1) % punkte.length]
        const laenge = Math.hypot(x2 - x1, z2 - z1)
        if (laenge < 0.05) return
        const box = new BoxGeometry(laenge + dicke, hoehe, dicke)
        box.rotateY(-Math.atan2(z2 - z1, x2 - x1))
        box.translate((x1 + x2) / 2, hoehe / 2, (z1 + z2) / 2)
        teile.push(box)
      })
    }
    for (const raum of raeume) kanten(raum.punkte, 0.12)
    if (umriss) kanten(umriss, 0.3)
    const gesamt = mergeGeometries(teile)
    teile.forEach((t) => t.dispose())
    return gesamt
  }, [umriss, raeume, hoehe])
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
export function useGrundrissTextur(pfad: string | null | undefined) {
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
        t.minFilter = LinearFilter
        t.generateMipmaps = false
        geladen = t
        setTextur(t)
      })
    })
    return () => {
      abgebrochen = true
      geladen?.dispose()
      setTextur(null)
    }
  }, [pfad])
  return textur
}
