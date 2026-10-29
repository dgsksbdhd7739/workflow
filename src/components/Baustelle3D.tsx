// 3D-Uebersicht aller Gebaeude eines Projekts auf dem Baugrundstueck.
// Jedes Gebaeude als Stapel seiner Geschosse, eingefaerbt nach Gesamtstatus;
// Klick oeffnet das Gebaeude. Per React.lazy geladen -- daher Default-Export.

import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Edges, OrbitControls } from '@react-three/drei'
import type { Gebaeude, Geschoss } from '../types/database'
import { type BereichAuswertung, STATUS_FARBE, STATUS_TEXT } from '../lib/gebaeude3d'
import { Schild3D } from './Schild3D'

interface Props {
  gebaeude: Gebaeude[]
  geschosse: Geschoss[]
  auswertung: Map<string, BereichAuswertung>
  onOeffnen: (gebaeudeId: string) => void
}

const ABSTAND = 10

/** Angedeuteter Turmdrehkran neben Gebaeuden, an denen gearbeitet wird. */
function Kran({ hoehe }: { hoehe: number }) {
  const turm = hoehe + 8
  return (
    <group>
      <mesh position={[0, turm / 2, 0]}>
        <boxGeometry args={[0.8, turm, 0.8]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      <mesh position={[-6, turm, 0]}>
        <boxGeometry args={[18, 0.6, 0.6]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      <mesh position={[2.5, turm - 0.8, 0]}>
        <boxGeometry args={[1.6, 1.2, 1.2]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
    </group>
  )
}

export default function Baustelle3D({ gebaeude, geschosse, auswertung, onOeffnen }: Props) {
  const [hover, setHover] = useState<string | null>(null)

  // Lage: gespeichert oder automatisch nebeneinander (mittig ausgerichtet).
  const platziert = useMemo(() => {
    const breiten = gebaeude.map((g) => Number(g.breite_m) || 24)
    const gesamt = breiten.reduce((s, b) => s + b, 0) + ABSTAND * Math.max(gebaeude.length - 1, 0)
    let x = -gesamt / 2
    return gebaeude.map((g, i) => {
      const breite = breiten[i]
      const tiefe = Number(g.tiefe_m) || 14
      const auto = { x: x + breite / 2, z: 0 }
      x += breite + ABSTAND
      const etagen = geschosse.filter((s) => s.gebaeude_id === g.id && s.ebene >= 0)
      const hoehe = etagen.reduce((s, e) => s + (Number(e.hoehe_m) || 3), 0)
      return {
        g,
        breite,
        tiefe,
        hoehe: hoehe || 9,
        ohneEtagen: etagen.length === 0,
        x: g.lage_x != null ? Number(g.lage_x) : auto.x,
        z: g.lage_z != null ? Number(g.lage_z) : auto.z,
        drehung: ((Number(g.drehung_grad) || 0) * Math.PI) / 180,
      }
    })
  }, [gebaeude, geschosse])

  const ausdehnung = Math.max(
    40,
    ...platziert.map((p) => Math.abs(p.x) * 2 + p.breite),
    ...platziert.map((p) => Math.abs(p.z) * 2 + p.tiefe),
    ...platziert.map((p) => p.hoehe * 1.5),
  )
  const schildHoehe = Math.max(ausdehnung / 12, 2.5)

  return (
    <Canvas frameloop="demand" dpr={[1, 2]} camera={{ position: [ausdehnung * 0.8, ausdehnung * 0.7, ausdehnung * 0.9], fov: 40 }}>
      <ambientLight intensity={0.75} />
      <directionalLight position={[40, 60, 25]} intensity={1.1} />
      <directionalLight position={[-30, 25, -40]} intensity={0.3} />

      {/* Umgebung und Baufeld */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[ausdehnung * 3, ausdehnung * 3]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[ausdehnung * 1.15, ausdehnung * 0.9]} />
        <meshStandardMaterial color="#efe6cf" />
      </mesh>

      {platziert.map((p) => {
        const a = auswertung.get(p.g.id)
        const status = a?.status ?? 'leer'
        const farbe = status === 'leer' ? '#e5e7eb' : STATUS_FARBE[status]
        const aktiv = hover === p.g.id
        return (
          <group key={p.g.id} position={[p.x, 0, p.z]} rotation={[0, p.drehung, 0]}>
            <mesh
              position={[0, p.hoehe / 2, 0]}
              onClick={(ev) => {
                ev.stopPropagation()
                onOeffnen(p.g.id)
              }}
              onPointerOver={(ev) => {
                ev.stopPropagation()
                setHover(p.g.id)
                document.body.style.cursor = 'pointer'
              }}
              onPointerOut={() => {
                setHover(null)
                document.body.style.cursor = ''
              }}
            >
              <boxGeometry args={[p.breite, p.hoehe, p.tiefe]} />
              {/* key: three.js uebernimmt einen Wechsel von transparent nicht ohne Neuanlage */}
              <meshStandardMaterial
                key={p.ohneEtagen ? 'glas' : 'voll'}
                color={farbe}
                transparent={p.ohneEtagen}
                opacity={p.ohneEtagen ? 0.45 : 1}
                emissive={aktiv ? '#4f46e5' : '#000000'}
                emissiveIntensity={0.2}
              />
              <Edges color="#64748b" />
            </mesh>
            {(status === 'offen' || status === 'in_arbeit' || status === 'verzug') && (
              <group position={[p.breite / 2 + 3, 0, -p.tiefe / 2 - 3]}>
                <Kran hoehe={p.hoehe} />
              </group>
            )}
            <Schild3D
              position={[0, p.hoehe + schildHoehe * 1.4, 0]}
              titel={p.g.name}
              untertitel={`${a?.fortschritt != null ? `${Math.round(a.fortschritt * 100)} % · ` : ''}${
                p.ohneEtagen
                  ? 'keine Etagen'
                  : a?.verzoegerteTermine
                    ? `${a.verzoegerteTermine} Termin${a.verzoegerteTermine === 1 ? '' : 'e'} im Verzug`
                    : STATUS_TEXT[status]
              }`}
              aktiv={aktiv}
              hoehe={schildHoehe}
              onClick={() => onOeffnen(p.g.id)}
            />
          </group>
        )
      })}

      <OrbitControls makeDefault enableDamping target={[0, 4, 0]} maxPolarAngle={Math.PI / 2.1} minDistance={15} maxDistance={ausdehnung * 4} />
    </Canvas>
  )
}
