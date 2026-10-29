// 3D-Ansicht eines Gebaeudes: Geschosse gestapelt und nach Status eingefaerbt,
// ein ausgewaehltes Geschoss wird "aufgeschnitten" (darueberliegende Etagen
// fast transparent) und zeigt seine Einheiten als anklickbare Bloecke.
// Wird per React.lazy geladen (three.js ist gross) -- daher Default-Export.

import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Edges, Html, OrbitControls } from '@react-three/drei'
import type { Einheit, Gebaeude, Geschoss } from '../types/database'
import { type GebaeudeAuswertung, STATUS_FARBE, STATUS_TEXT, einheitenAufteilen } from '../lib/gebaeude3d'

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

function Fensterband({ breite, tiefe, hoehe }: { breite: number; tiefe: number; hoehe: number }) {
  // Dunkles Band rundum als angedeutete Fensterreihe.
  return (
    <mesh position={[0, hoehe * 0.05, 0]}>
      <boxGeometry args={[breite + 0.04, hoehe * 0.35, tiefe + 0.04]} />
      <meshStandardMaterial color="#334155" transparent opacity={0.55} />
    </mesh>
  )
}

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
  const abstand = Math.max(breite, tiefe, gesamtHoehe) * 1.6

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [abstand, gesamtHoehe * 0.8 + abstand * 0.45, abstand], fov: 40 }}
      onPointerMissed={() => (einheitId ? onEinheit(null) : onGeschoss(null))}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[30, 50, 20]} intensity={1.1} />
      <directionalLight position={[-20, 20, -30]} intensity={0.35} />

      {/* Baugrund */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[breite * 3, tiefe * 4]} />
        <meshStandardMaterial color="#f1f0e8" />
      </mesh>

      {stapel.map(({ g, y, h }) => {
        const ueberAuswahl = ausgewaehlt !== null && g.ebene > ausgewaehlt.g.ebene
        const istAuswahl = ausgewaehlt?.g.id === g.id
        const status = auswertung.geschoss.get(g.id)?.status ?? 'leer'
        const farbe = status === 'leer' ? NEUTRAL : STATUS_FARBE[status]

        if (istAuswahl) {
          // Aufgeschnittenes Geschoss: Bodenplatte + Einheiten als Bloecke.
          return (
            <group key={g.id} position={[0, y, 0]}>
              <mesh position={[0, DECKE / 2, 0]}>
                <boxGeometry args={[breite, DECKE, tiefe]} />
                <meshStandardMaterial color="#cbd5e1" />
                <Edges color="#64748b" />
              </mesh>
              {einheitenDesGeschosses.map((e) => {
                const r = aufteilung.get(e.id)
                if (!r) return null
                const ew = auswertung.einheit.get(e.id)
                const st = ew?.status ?? 'leer'
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
                      <meshStandardMaterial color={STATUS_FARBE[st]} emissive={aktiv || hover === e.id ? '#4f46e5' : '#000000'} emissiveIntensity={aktiv ? 0.35 : 0.15} />
                      <Edges color={aktiv ? '#4f46e5' : '#475569'} />
                    </mesh>
                    <Html position={[0, hoehe / 2 + 0.6, 0]} center distanceFactor={abstand * 0.9} zIndexRange={[20, 0]}>
                      <button
                        type="button"
                        onClick={() => onEinheit(aktiv ? null : e.id)}
                        className={`whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium shadow-sm ${aktiv ? 'border-brand bg-brand text-white' : 'border-border bg-surface/95 text-text'}`}
                      >
                        {e.name}
                        <span className={`ml-1 font-normal ${aktiv ? 'text-white/80' : 'text-text-muted'}`}>· {STATUS_TEXT[st]}</span>
                      </button>
                    </Html>
                  </group>
                )
              })}
            </group>
          )
        }

        return (
          <group key={g.id} position={[0, y + h / 2, 0]}>
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
              <meshStandardMaterial
                color={farbe}
                transparent={ueberAuswahl}
                opacity={ueberAuswahl ? 0.08 : 1}
                emissive={hover === g.id ? '#4f46e5' : '#000000'}
                emissiveIntensity={0.18}
              />
              {!ueberAuswahl && <Edges color="#64748b" />}
            </mesh>
            {!ueberAuswahl && <Fensterband breite={breite} tiefe={tiefe} hoehe={h} />}
            {!ausgewaehlt && (
              <Html position={[breite / 2 + 0.4, 0, tiefe / 2 + 0.4]} distanceFactor={abstand * 0.9} zIndexRange={[20, 0]}>
                <span className="whitespace-nowrap rounded bg-surface/90 px-1 text-[10px] font-semibold text-text-muted shadow-sm">{g.name}</span>
              </Html>
            )}
          </group>
        )
      })}

      {stapel.length === 0 && (
        <mesh position={[0, 1.5, 0]}>
          <boxGeometry args={[breite, 3, tiefe]} />
          <meshStandardMaterial color={NEUTRAL} transparent opacity={0.5} />
          <Edges color="#94a3b8" />
        </mesh>
      )}

      <OrbitControls
        makeDefault
        enableDamping
        target={[0, ausgewaehlt ? ausgewaehlt.y + ausgewaehlt.h / 2 : gesamtHoehe / 3, 0]}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={Math.max(breite, tiefe) * 0.6}
        maxDistance={abstand * 3}
      />
    </Canvas>
  )
}
