// 3D-Ansicht eines Gebaeudes: Geschosse gestapelt und nach Status eingefaerbt,
// ein ausgewaehltes Geschoss wird "aufgeschnitten" (darueberliegende Etagen
// nur noch als Umriss) und zeigt seine Einheiten als anklickbare Bloecke.
// Geschosse mit Grundriss aus Plaenen (geschosse.grundriss) bekommen ihre
// echte Form, das gewaehlte zusaetzlich das Planbild als Boden.
// Wird per React.lazy geladen (three.js ist gross) -- daher Default-Export.

import { useMemo, useState, type ReactNode } from 'react'
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber'
import { DoubleSide } from 'three'
import { Edges, OrbitControls } from '@react-three/drei'
import type { Einheit, Gebaeude, Geschoss } from '../types/database'
import { type GebaeudeAuswertung, STATUS_FARBE, STATUS_TEXT, einheitenAufteilen } from '../lib/gebaeude3d'
import { Schild3D } from './Schild3D'
import { PlanSchaerfe3D } from './PlanSchaerfe3D'
import { useFlaechenGeometrie, useGrundrissTextur, useRasterWaende, useUmrissGeometrie, useWandGeometrie } from './umriss3d'

interface Props {
  gebaeude: Gebaeude
  geschosse: Geschoss[]
  einheiten: Einheit[]
  auswertung: GebaeudeAuswertung
  geschossId: string | null
  einheitId: string | null
  onGeschoss: (id: string | null) => void
  onEinheit: (id: string | null) => void
  // Planbild je Geschoss ein-/ausblenden
  planSichtbar?: (geschossId: string) => boolean
  // Waende halbhoch statt geschosshoch (freier Blick in die Raeume)
  waendeHalb?: boolean
}

const NEUTRAL = '#e5e7eb'
const DECKE = 0.3
// Flure/Gaenge hell-gelb, damit Wege durch das Geschoss sofort erkennbar sind
const FLUR_FARBE = '#facc15'

/** Mittelpunkt eines Raums (Mittel der Eckpunkte) auf Hoehe y. */
function schwerpunkt(punkte: [number, number][], y: number): [number, number, number] {
  const x = punkte.reduce((s, p) => s + p[0], 0) / punkte.length
  const z = punkte.reduce((s, p) => s + p[1], 0) / punkte.length
  return [x, y, z]
}

interface KoerperProps {
  umriss: [number, number][] | null
  breite: number
  tiefe: number
  hoehe: number
  children: ReactNode
  onClick?: (ev: ThreeEvent<MouseEvent>) => void
  onPointerOver?: (ev: ThreeEvent<PointerEvent>) => void
  onPointerOut?: () => void
  anklickbar?: boolean
}

/** Etagenkoerper von y = 0 bis hoehe: echte Form aus dem Grundriss, sonst Quader. */
function Koerper({ umriss, breite, tiefe, hoehe, children, anklickbar = true, ...ereignisse }: KoerperProps) {
  const geometrie = useUmrissGeometrie(umriss, hoehe)
  const raycast = anklickbar ? undefined : () => null
  if (geometrie) {
    return (
      <mesh geometry={geometrie} rotation={[-Math.PI / 2, 0, 0]} raycast={raycast} {...ereignisse}>
        {children}
      </mesh>
    )
  }
  return (
    <mesh position={[0, hoehe / 2, 0]} raycast={raycast} {...ereignisse}>
      <boxGeometry args={[breite, hoehe, tiefe]} />
      {children}
    </mesh>
  )
}

type RaumDaten = NonNullable<Geschoss['raeume']>[number]

/** Bodenflaeche eines Raums; mit Einheit in deren Statusfarbe und anklickbar. */
function RaumBoden({ raum, farbe, aktiv, ohnePlan = false, onClick }: { raum: RaumDaten; farbe: string | null; aktiv: boolean; ohnePlan?: boolean; onClick?: () => void }) {
  const geometrie = useFlaechenGeometrie(raum.punkte)
  return (
    <mesh
      geometry={geometrie}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, DECKE + 0.05, 0]}
      raycast={onClick ? undefined : () => null}
      onClick={(ev) => {
        if (!onClick) return
        ev.stopPropagation()
        onClick()
      }}
    >
      <meshBasicMaterial
        color={aktiv ? '#4f46e5' : (farbe ?? '#ffffff')}
        transparent
        // Ohne Planbild deckende helle Boeden, sonst durchscheinend ueber dem Plan
        opacity={ohnePlan ? 0.9 : farbe || aktiv ? 0.35 : 0.08}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

/** Waende 1:1 aus dem Plan (Umriss minus Raeume), halbhoch fuer den Blick hinein. */
function Waende({ g, hoehe }: { g: Geschoss; hoehe: number }) {
  const raster = useRasterWaende(g.waende, g.fenster, hoehe)
  // Aeltere Aufbauten ohne Wandraster: Waende aus den Raumkanten
  const geometrie = useWandGeometrie(raster ? null : g.grundriss, raster ? null : g.raeume, hoehe, g.tueren)
  if (raster?.wand) {
    return (
      <>
        <mesh geometry={raster.wand} position={[0, DECKE, 0]} raycast={() => null}>
          <meshStandardMaterial color="#cbd5e1" side={DoubleSide} />
        </mesh>
        {raster.glas && (
          <mesh geometry={raster.glas} position={[0, DECKE, 0]} raycast={() => null}>
            <meshStandardMaterial color="#7dd3fc" transparent opacity={0.45} side={DoubleSide} depthWrite={false} />
          </mesh>
        )}
      </>
    )
  }
  if (!geometrie) return null
  return (
    <mesh geometry={geometrie} position={[0, DECKE, 0]} raycast={() => null}>
      <meshStandardMaterial color="#cbd5e1" />
    </mesh>
  )
}

/** Planbild als Boden des aufgeschnittenen Geschosses. */
function Planboden({ g, y }: { g: Geschoss; y: number }) {
  const anisotropie = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  const maxTextur = useThree((s) => s.gl.capabilities.maxTextureSize)
  const textur = useGrundrissTextur(g.plan_bild_pfad, anisotropie)
  const lage = g.plan_bild_lage
  if (!textur || !lage) return null
  // Tatsaechliche Aufloesung des Bodenbilds auf diesem Geraet (grosse Bilder verkleinert three.js aufs Texturlimit)
  const bildBreite = Math.min((textur.image as { width?: number } | null)?.width ?? 0, maxTextur)
  return (
    <>
      <PlanSchaerfe3D g={g} bodenY={y + DECKE + 0.03} hoeheLokal={DECKE + 0.03} basisPxProM={bildBreite / lage.breite} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[lage.x + lage.breite / 2, DECKE + 0.02, lage.z + lage.tiefe / 2]} raycast={() => null}>
        <planeGeometry args={[lage.breite, lage.tiefe]} />
        <meshBasicMaterial map={textur} toneMapped={false} transparent opacity={0.95} />
      </mesh>
    </>
  )
}

export default function Gebaeude3D({
  gebaeude,
  geschosse,
  einheiten,
  auswertung,
  geschossId,
  einheitId,
  onGeschoss,
  onEinheit,
  planSichtbar = () => true,
  waendeHalb = false,
}: Props) {
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
  // Waende geschosshoch (Fenster mit Bruestung/Sturz sichtbar) oder halbhoch
  const wandHoehe = (h: number) => (waendeHalb ? Math.min(1.2, h - DECKE) : h - DECKE - 0.02)
  const ausgewaehlt = stapel.find((s) => s.g.id === geschossId) ?? null
  const einheitenDesGeschosses = useMemo(
    () => (ausgewaehlt ? einheiten.filter((e) => e.geschoss_id === ausgewaehlt.g.id) : []),
    [einheiten, ausgewaehlt],
  )
  const aufteilung = useMemo(() => einheitenAufteilen(einheitenDesGeschosses, breite, tiefe), [einheitenDesGeschosses, breite, tiefe])
  const groesse = Math.max(breite, tiefe, gesamtHoehe)
  // Grosse Gebaeude (z. B. aus Plaenen, 100 m lang) fuellen sonst nur einen kleinen Teil der Ansicht
  const abstand = groesse * (groesse > 40 ? 1.3 : 2.1)
  const schildHoehe = Math.min(Math.max(groesse / 11, 1.4), 5)
  // Einheiten liegen bei echten Grundrissen dicht (Hotelzimmer) -- kleinere Schilder
  const einheitSchild = Math.min(schildHoehe, Math.max(groesse / 40, 1.2))

  return (
    <Canvas
      // Kamera wird nur beim Anlegen gesetzt -- nach "Aus Plaenen aufbauen" aendert sich die Groesse
      key={Math.round(groesse)}
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
            <group key={`geist-${g.id}`} position={[0, y, 0]}>
              <Koerper umriss={g.grundriss} breite={breite} tiefe={tiefe} hoehe={h - 0.12} anklickbar={false}>
                <meshBasicMaterial transparent opacity={0.05} depthWrite={false} color="#94a3b8" />
                <Edges color="#cbd5e1" />
              </Koerper>
            </group>
          )
        }

        if (ausgewaehlt?.g.id === g.id) {
          // Aufgeschnittenes Geschoss: Bodenplatte + Einheiten als Bloecke.
          return (
            <group key={`schnitt-${g.id}`} position={[0, y, 0]}>
              <Koerper umriss={g.grundriss} breite={breite} tiefe={tiefe} hoehe={DECKE}>
                <meshStandardMaterial color="#cbd5e1" />
                <Edges color="#64748b" />
              </Koerper>
              {planSichtbar(g.id) && <Planboden g={g} y={y} />}
              {g.raeume?.length ? (
                <>
                  <Waende g={g} hoehe={wandHoehe(h)} />
                  {g.raeume.map((raum, i) => {
                    const e = raum.einheit ? einheitenDesGeschosses.find((x) => x.name === raum.einheit) : undefined
                    const st = e ? (auswertung.einheit.get(e.id)?.status ?? 'leer') : null
                    const flur = raum.typ === 'flur' && !e
                    return (
                      <group key={i}>
                        <RaumBoden
                          raum={raum}
                          farbe={flur ? FLUR_FARBE : st && st !== 'leer' ? STATUS_FARBE[st] : e ? '#cbd5e1' : null}
                          aktiv={!!e && einheitId === e.id}
                          ohnePlan={!planSichtbar(g.id)}
                          onClick={e ? () => onEinheit(einheitId === e.id ? null : e.id) : undefined}
                        />
                        {flur && raum.flaeche >= 6 && (
                          <Schild3D position={[...schwerpunkt(raum.punkte, DECKE + 0.4)]} titel="Flur" hoehe={1} bildschirm />
                        )}
                      </group>
                    )
                  })}
                </>
              ) : null}
              {einheitenDesGeschosses.map((e) => {
                // Lage aus dem Plan (Nummer im Grundriss), sonst automatisch verteilt
                const r =
                  e.lage_x != null && e.lage_z != null
                    ? { x: Number(e.lage_x), z: Number(e.lage_z), breite: 2.6, tiefe: 2.6 }
                    : aufteilung.get(e.id)
                if (!r) return null
                const st = auswertung.einheit.get(e.id)?.status ?? 'leer'
                const aktiv = einheitId === e.id
                const hoehe = e.lage_x != null ? (h - DECKE) * 0.35 : (h - DECKE) * 0.55
                if (g.raeume?.length) {
                  return (
                    <Schild3D
                      key={e.id}
                      position={[r.x, DECKE + wandHoehe(h) + 0.4, r.z]}
                      titel={e.name}
                      untertitel={STATUS_TEXT[st]}
                      aktiv={aktiv}
                      hoehe={einheitSchild}
                      bildschirm
                      onClick={() => onEinheit(aktiv ? null : e.id)}
                    />
                  )
                }
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
                      position={[0, hoehe / 2 + einheitSchild, 0]}
                      titel={e.name}
                      untertitel={STATUS_TEXT[st]}
                      aktiv={aktiv}
                      hoehe={einheitSchild}
                      bildschirm
                      onClick={() => onEinheit(aktiv ? null : e.id)}
                    />
                  </group>
                )
              })}
            </group>
          )
        }

        return (
          <group key={`etage-${g.id}`} position={[0, y, 0]}>
            <Koerper
              umriss={g.grundriss}
              breite={breite}
              tiefe={tiefe}
              hoehe={h - 0.12}
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
              <meshStandardMaterial color={farbe} emissive={hover === g.id ? '#4f46e5' : '#000000'} emissiveIntensity={0.18} />
              <Edges color="#64748b" threshold={20} />
            </Koerper>
            {/* angedeutete Fensterreihe, nur beim Quader */}
            {!g.grundriss && (
              <mesh position={[0, h * 0.55, 0]} raycast={() => null}>
                <boxGeometry args={[breite + 0.04, h * 0.32, tiefe + 0.04]} />
                <meshStandardMaterial color="#475569" />
              </mesh>
            )}
            {!ausgewaehlt && (
              <Schild3D position={[breite / 2 + schildHoehe * 1.6, h / 2, tiefe / 2]} titel={g.name} hoehe={Math.min(schildHoehe * 0.85, h * 0.85)} onClick={() => onGeschoss(g.id)} />
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
        // Bis auf wenige Meter heran, dorthin wo Maus/Finger sind -- zum Lesen des Plans
        minDistance={1.5}
        maxDistance={abstand * 3}
        zoomToCursor
        screenSpacePanning
      />
    </Canvas>
  )
}
