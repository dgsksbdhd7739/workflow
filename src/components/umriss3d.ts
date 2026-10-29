// Geometrien fuer Geschosse mit echtem Grundriss-Umriss (aus Plaenen, siehe
// src/lib/planAnalyse.ts). Nur von den lazy geladenen 3D-Komponenten genutzt.

import { useEffect, useMemo, useState } from 'react'
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, ExtrudeGeometry, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, Shape, ShapeGeometry, type Texture, TextureLoader } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getSignedUrl } from '../lib/backend'

type Polygon = [number, number][]
type WandRaster = { aufloesung: number; x0: number; z0: number; rechtecke: number[] }

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

/**
 * Waende 1:1 aus dem Wandraster des Plans (y = 0 bis hoehe). Was der Plan als
 * Oeffnung zeichnet, bleibt eine Luecke -- es wird nichts hineingedeutet.
 */
export function useRasterWaende(raster: WandRaster | null | undefined, hoehe: number) {
  const ergebnis = useMemo(() => {
    if (!raster?.rechtecke.length) return null
    const wand = quaderSammler()
    const { aufloesung: a, x0, z0, rechtecke } = raster
    for (let i = 0; i + 3 < rechtecke.length; i += 4) {
      const x = x0 + rechtecke[i] * a
      const z = z0 + rechtecke[i + 1] * a
      wand.quader(x, 0, z, x + rechtecke[i + 2] * a, hoehe, z + rechtecke[i + 3] * a)
    }
    return wand.geometrie()
  }, [raster, hoehe])
  useEffect(() => () => ergebnis?.dispose(), [ergebnis])
  return ergebnis
}

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
    const gesamt = teile.length ? mergeGeometries(teile) : null
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
