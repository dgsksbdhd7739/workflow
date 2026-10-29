// Beschriftung fuer die 3D-Ansichten als Sprite mit Canvas-Textur: immer zur
// Kamera gedreht, immer obenauf, anklickbar. Bewusst kein <Html> aus drei --
// dessen eigene React-Wurzeln brechen unter React 19 beim Umschalten der
// Ansicht ("unmount a root while React was already rendering"), und es braucht
// keine nachgeladene Schrift (Systemschrift im Canvas).

import { useEffect, useMemo } from 'react'
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'
import type { ThreeEvent } from '@react-three/fiber'

interface Props {
  position: [number, number, number]
  titel: string
  untertitel?: string
  aktiv?: boolean
  // Hoehe des Schilds in Metern (Breite ergibt sich aus dem Text)
  hoehe?: number
  onClick?: () => void
}

const PIXEL_PRO_ZEILE = 44
const SCHRIFT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

export function Schild3D({ position, titel, untertitel, aktiv = false, hoehe = 1.4, onClick }: Props) {
  const { textur, seitenverhaeltnis } = useMemo(() => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const zeilen = untertitel ? 2 : 1
    const fett = `600 ${PIXEL_PRO_ZEILE * 0.62}px ${SCHRIFT}`
    const normal = `400 ${PIXEL_PRO_ZEILE * 0.5}px ${SCHRIFT}`
    ctx.font = fett
    let breite = ctx.measureText(titel).width
    if (untertitel) {
      ctx.font = normal
      breite = Math.max(breite, ctx.measureText(untertitel).width)
    }
    const rand = 18
    canvas.width = Math.ceil(breite + rand * 2)
    canvas.height = PIXEL_PRO_ZEILE * zeilen + 16

    ctx.fillStyle = aktiv ? '#4f46e5' : 'rgba(255,255,255,0.96)'
    ctx.strokeStyle = aktiv ? '#4338ca' : '#cbd5e1'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(1.5, 1.5, canvas.width - 3, canvas.height - 3, 14)
    ctx.fill()
    ctx.stroke()

    ctx.textBaseline = 'middle'
    ctx.fillStyle = aktiv ? '#ffffff' : '#0f172a'
    ctx.font = fett
    ctx.fillText(titel, rand, 8 + PIXEL_PRO_ZEILE / 2)
    if (untertitel) {
      ctx.fillStyle = aktiv ? 'rgba(255,255,255,0.85)' : '#64748b'
      ctx.font = normal
      ctx.fillText(untertitel, rand, 8 + PIXEL_PRO_ZEILE * 1.45)
    }

    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    t.minFilter = LinearFilter
    return { textur: t, seitenverhaeltnis: canvas.width / canvas.height }
  }, [titel, untertitel, aktiv])

  useEffect(() => () => textur.dispose(), [textur])

  const skaliertHoehe = untertitel ? hoehe * 1.6 : hoehe
  return (
    <sprite
      position={position}
      scale={[skaliertHoehe * seitenverhaeltnis, skaliertHoehe, 1]}
      renderOrder={10}
      onClick={
        onClick &&
        ((ev: ThreeEvent<MouseEvent>) => {
          ev.stopPropagation()
          onClick()
        })
      }
      onPointerOver={onClick && (() => (document.body.style.cursor = 'pointer'))}
      onPointerOut={onClick && (() => (document.body.style.cursor = ''))}
    >
      {/* toneMapped aus: sonst wirken weisse Schilder grau */}
      <spriteMaterial map={textur} depthTest={false} transparent toneMapped={false} />
    </sprite>
  )
}
