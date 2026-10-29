// 3D-Ansicht eines Gebaeudes: Geschosse gestapelt und nach Status eingefaerbt,
// ein ausgewaehltes Geschoss wird "aufgeschnitten" (darueberliegende Etagen
// nur noch als Umriss) und zeigt seine Einheiten als anklickbare Bloecke.
// Wird per React.lazy geladen (three.js ist gross) -- daher Default-Export.

import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Edges, OrbitControls } from '@react-three/drei'
import type { Einheit, Gebaeude, Geschoss } from '../types/database'
import { type GebaeudeAuswertung, STATUS_FARBE, STATUS_TEXT, einheitenAufteilen } from '../lib/gebaeude3d'
import { Schild3D } from './Schild3D'

interface Props {
  gebaeude: Gebaeude
  geschosse: Geschoss[]
  einheiten: Einheit[]
  auswertung: GebaeudeAuswertung
  geschossId: string | null
  einheitId: string | null
  onGeschoss: (id: string | null) => void
  onEinheit: (id: string | null) => void
}

const NEUTRAL = '#e5e7eb'
const DECKE = 0.3

export default function Gebaeude3D({ gebaeude, geschosse, einheiten, auswertung, geschossId, einheitId, onGeschoss, onEinheit }: Props) {
  const [hover, setHover] = useState<string | null>(null)
  const breite = Number(gebaeude.breite_m) || 24
  const tiefe = Number(gebaeude.tiefe_m) || 14

  // Geschosse von unten nach oben; EG (Ebene 0) beginnt auf Hoehe 0.
  const stapel = useMemo(() => {
    const sortiert = [...geschosse].sort((a, b) => a.ebene - b.ebene)
    const unterEG = sortiert.filter((g) => g.ebene < 0).reduce((s, g) => s + Number(g.hoehe_m), 0)
    let y = -unterEG
    return sortiert.map((g) => {
      const h = Number(g.hoehe_m) || 3
      const eintrag = { g, y, h }
      y += h
      return eintrag
    })
  }, [geschosse])

  const gesamtHoehe = stapel.reduce((s, x) => s + x.h, 0) || 3
  const ausgewaehlt = stapel.find((s) => s.g.id === geschossId) ?? null
  const einheitenDesGeschosses = useMemo(
    () => (ausgewaehlt ? einheiten.filter((e) => e.geschoss_id === ausgewaehlt.g.id) : []),
    [einheiten, ausgewaehlt],
  )
  const aufteilung = useMemo(() => einheitenAufteilen(einheitenDesGeschosses, breite, tiefe), [einheitenDesGeschosses, breite, tiefe])
  const groesse = Math.max(breite, tiefe, gesamtHoehe)
  const abstand = groesse * 2.1
  const schildHoehe = Math.max(groesse / 11, 1.4)

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [abstand * 0.75, gesamtHoehe * 0.6 + abstand * 0.55, abstand * 0.85], fov: 40 }}
      onPointerMissed={() => (einheitId ? onEinheit(null) : onGeschoss(null))}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[30, 50, 20]} intensity={1.1} />
      <directionalLight position={[-20, 20, -30]} intensity={0.35} />

      {/* Baugrund */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[breite * 3, tiefe * 4]} />
        <meshStandardMaterial color="#f1f0e8" />
      </mesh>

      {stapel.map(({ g, y, h }) => {
        const status = auswertung.geschoss.get(g.id)?.status ?? 'leer'
        const farbe = status === 'leer' ? NEUTRAL : STATUS_FARBE[status]

        // Ueber dem ausgewaehlten Geschoss: nur Umriss, damit der Blick frei ist.
        if (ausgewaehlt && g.ebene > ausgewaehlt.g.ebene) {
          return (
            <mesh key={`geist-${g.id}`} position={[0, y + h / 2, 0]} raycast={() => null}>
              <boxGeometry args={[breite, h - 0.12, tiefe]} />
              <meshBasicMaterial transparent opacity={0.05} depthWrite={false} color="#94a3b8" />
              <Edges color="#cbd5e1" />
            </mesh>
          )
        }

        if (ausgewaehlt?.g.id === g.id) {
          // Aufgeschnittenes Geschoss: Bodenplatte + Einheiten als Bloecke.
          return (
            <group key={`schnitt-${g.id}`} position={[0, y, 0]}>
              <mesh position={[0, DECKE / 2, 0]}>
                <boxGeometry args={[breite, DECKE, tiefe]} />
                <meshStandardMaterial color="#cbd5e1" />
                <Edges color="#64748b" />
              </mesh>
              {einheitenDesGeschosses.map((e) => {
                const r = aufteilung.get(e.id)
                if (!r) return null
                const st = auswertung.einheit.get(e.id)?.status ?? 'leer'
                const aktiv = einheitId === e.id
                const hoehe = (h - DECKE) * 0.55
                return (
                  <group key={e.id} position={[r.x, DECKE + hoehe / 2, r.z]}>
                    <mesh
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onEinheit(aktiv ? null : e.id)
                      }}
                      onPointerOver={(ev) => {
                        ev.stopPropagation()
                        setHover(e.id)
                      }}
                      onPointerOut={() => setHover(null)}
                    >
                      <boxGeometry args={[r.breite, hoehe, r.tiefe]} />
                      <meshStandardMaterial
                        color={STATUS_FARBE[st]}
                        emissive={aktiv || hover === e.id ? '#4f46e5' : '#000000'}
                        emissiveIntensity={aktiv ? 0.35 : 0.15}
                      />
                      <Edges color={aktiv ? '#4f46e5' : '#475569'} />
                    </mesh>
                    <Schild3D
                      position={[0, hoehe / 2 + schildHoehe, 0]}
                      titel={e.name}
                      untertitel={STATUS_TEXT[st]}
                      aktiv={aktiv}
                      hoehe={schildHoehe}
                      onClick={() => onEinheit(aktiv ? null : e.id)}
                    />
                  </group>
                )
              })}
            </group>
          )
        }

        return (
          <group key={`etage-${g.id}`} position={[0, y + h / 2, 0]}>
            <mesh
              onClick={(ev) => {
                ev.stopPropagation()
                onEinheit(null)
                onGeschoss(g.id)
              }}
              onPointerOver={(ev) => {
                ev.stopPropagation()
                setHover(g.id)
              }}
              onPointerOut={() => setHover(null)}
            >
              <boxGeometry args={[breite, h - 0.12, tiefe]} />
              <meshStandardMaterial color={farbe} emissive={hover === g.id ? '#4f46e5' : '#000000'} emissiveIntensity={0.18} />
              <Edges color="#64748b" />
            </mesh>
            {/* angedeutete Fensterreihe */}
            <mesh position={[0, h * 0.05, 0]} raycast={() => null}>
              <boxGeometry args={[breite + 0.04, h * 0.32, tiefe + 0.04]} />
              <meshStandardMaterial color="#475569" />
            </mesh>
            {!ausgewaehlt && (
              <Schild3D position={[breite / 2 + schildHoehe * 1.6, 0, tiefe / 2]} titel={g.name} hoehe={schildHoehe * 0.85} onClick={() => onGeschoss(g.id)} />
            )}
          </group>
        )
      })}

      {stapel.length === 0 && (
        <mesh position={[0, 1.5, 0]}>
          <boxGeometry args={[breite, 3, tiefe]} />
          <meshBasicMaterial color={NEUTRAL} transparent opacity={0.5} depthWrite={false} />
          <Edges color="#94a3b8" />
        </mesh>
      )}

      <OrbitControls
        makeDefault
        enableDamping
        target={[0, ausgewaehlt ? ausgewaehlt.y + ausgewaehlt.h / 2 : gesamtHoehe / 3, 0]}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={groesse * 0.6}
        maxDistance={abstand * 3}
      />
    </Canvas>
  )
}
