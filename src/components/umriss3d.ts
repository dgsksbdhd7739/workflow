// Geometrien fuer Geschosse mit echtem Grundriss-Umriss (aus Plaenen, siehe
// src/lib/planAnalyse.ts). Nur von den lazy geladenen 3D-Komponenten genutzt.

import { useEffect, useMemo, useState } from 'react'
import { ExtrudeGeometry, LinearFilter, SRGBColorSpace, Shape, type Texture, TextureLoader } from 'three'
import { getSignedUrl } from '../lib/backend'

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
