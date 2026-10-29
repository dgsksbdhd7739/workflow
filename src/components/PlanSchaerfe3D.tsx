// Scharfer Plan beim Heranzoomen: Das Bodenbild eines Geschosses hat eine
// feste Aufloesung (und wird auf Handys zusaetzlich auf deren Texturgrenze
// verkleinert). Sobald die Kamera naeher ist, als das Bild hergibt, wird der
// sichtbare Ausschnitt direkt aus der PDF in Bildschirmaufloesung gezeichnet
// und als zweite Ebene darueber gelegt -- wie ein PDF-Betrachter, der beim
// Zoomen nachzeichnet. Nur innerhalb von Gebaeude3D (Canvas) verwenden.

import { useEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { CanvasTexture, LinearFilter, Plane, Raycaster, SRGBColorSpace, Vector2, Vector3 } from 'three'
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { backend } from '../lib/backend'
import { pdfDokument, pdfSeite } from '../lib/pdfLaden'
import type { Geschoss } from '../types/database'

const PT_IN_M = 0.0254 / 72
const MAX_PX = 2048

interface Ausschnitt {
  textur: CanvasTexture
  x: number
  z: number
  breite: number
  tiefe: number
}

/** bodenY: Hoehe der Bodenflaeche in Weltkoordinaten; hoeheLokal: dieselbe Flaeche in der Gruppe des Geschosses. */
export function PlanSchaerfe3D({ g, bodenY, hoeheLokal, basisPxProM }: { g: Geschoss; bodenY: number; hoeheLokal: number; basisPxProM: number }) {
  const { camera, size, gl, invalidate } = useThree()
  const steuerung = useThree((s) => s.controls) as unknown as EventTarget | null
  const [ausschnitt, setAusschnitt] = useState<Ausschnitt | null>(null)
  const seiteRef = useRef<Promise<PDFPageProxy | null> | null>(null)
  const lage = g.plan_bild_lage

  useEffect(() => {
    if (!steuerung || !g.plan_id || !g.massstab || !lage || lage.blatt_x == null || lage.blatt_z == null) return
    const mProPt = PT_IN_M * g.massstab
    const versatzX = lage.blatt_x - lage.x
    const versatzZ = lage.blatt_z - lage.z
    let zeitgeber: ReturnType<typeof setTimeout> | undefined
    let auftrag: RenderTask | null = null
    let aktiv = true

    const seiteLaden = () => {
      seiteRef.current ??= (async () => {
        const { data } = await backend.from('plaene').select('datei_pfad, seite').eq('id', g.plan_id!).maybeSingle()
        if (!data) return null
        return pdfSeite(await pdfDokument('plaene', data.datei_pfad), g.plan_seite ?? data.seite ?? 1)
      })().catch(() => null)
      return seiteRef.current
    }

    const aktualisieren = async () => {
      // Sichtbaren Bodenbereich bestimmen: Bildschirmecken auf die Bodenebene projizieren
      const strahl = new Raycaster()
      const ebene = new Plane(new Vector3(0, 1, 0), -bodenY)
      const treffer: Vector3[] = []
      for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
        strahl.setFromCamera(new Vector2(nx, ny), camera)
        const p = strahl.ray.intersectPlane(ebene, new Vector3())
        if (p) treffer.push(p)
      }
      if (treffer.length < 3) return setAusschnitt(null)
      const minX = Math.max(lage.x, Math.min(...treffer.map((p) => p.x)))
      const maxX = Math.min(lage.x + lage.breite, Math.max(...treffer.map((p) => p.x)))
      const minZ = Math.max(lage.z, Math.min(...treffer.map((p) => p.z)))
      const maxZ = Math.min(lage.z + lage.tiefe, Math.max(...treffer.map((p) => p.z)))
      const breite = maxX - minX
      const tiefe = maxZ - minZ
      if (breite <= 0.2 || tiefe <= 0.2) return setAusschnitt(null)

      // Nur nachzeichnen, wenn der Bildschirm mehr Pixel pro Meter zeigt, als das Bodenbild hat
      const bildschirmPxProM = (size.width * gl.getPixelRatio()) / breite
      if (bildschirmPxProM < basisPxProM * 1.3) return setAusschnitt(null)

      const seite = await seiteLaden()
      if (!seite || !aktiv) return
      const pxProM = Math.min(bildschirmPxProM, MAX_PX / breite, MAX_PX / tiefe)
      const pxProPt = pxProM * mProPt
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(breite * pxProM)
      canvas.height = Math.ceil(tiefe * pxProM)
      const viewport = seite.getViewport({
        scale: pxProPt,
        offsetX: -(minX + versatzX) * pxProM,
        offsetY: -(minZ + versatzZ) * pxProM,
      })
      auftrag?.cancel()
      auftrag = seite.render({ canvas, viewport, background: '#ffffff' })
      try {
        await auftrag.promise
      } catch {
        return // abgebrochen, ein neuerer Auftrag laeuft
      }
      if (!aktiv) return
      const textur = new CanvasTexture(canvas)
      textur.colorSpace = SRGBColorSpace
      textur.minFilter = LinearFilter
      textur.generateMipmaps = false
      setAusschnitt((alt) => {
        alt?.textur.dispose()
        return { textur, x: minX, z: minZ, breite, tiefe }
      })
      invalidate()
    }

    const planen = () => {
      clearTimeout(zeitgeber)
      zeitgeber = setTimeout(aktualisieren, 350)
    }
    steuerung.addEventListener('change', planen)
    planen()
    return () => {
      aktiv = false
      clearTimeout(zeitgeber)
      auftrag?.cancel()
      steuerung.removeEventListener('change', planen)
    }
  }, [steuerung, g.plan_id, g.plan_seite, g.massstab, lage, bodenY, camera, size.width, gl, basisPxProM, invalidate])

  useEffect(() => () => ausschnitt?.textur.dispose(), [ausschnitt])

  if (!ausschnitt) return null
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[ausschnitt.x + ausschnitt.breite / 2, hoeheLokal, ausschnitt.z + ausschnitt.tiefe / 2]}
      raycast={() => null}
    >
      <planeGeometry args={[ausschnitt.breite, ausschnitt.tiefe]} />
      <meshBasicMaterial map={ausschnitt.textur} toneMapped={false} />
    </mesh>
  )
}
