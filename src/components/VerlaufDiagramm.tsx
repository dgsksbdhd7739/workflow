// Liniendiagramm fuer Zeitverlaeufe (Seite Serverzustand): eine y-Achse,
// duenne Linien, Luecken bei fehlenden Messungen, Fadenkreuz mit Tooltip.

import { useEffect, useRef, useState } from 'react'

export interface Serie {
  name: string
  // Tailwind-Klassen fuer Linie bzw. Punkt (inkl. dark:-Variante)
  linie: string
  punkt: string
  flaeche?: string
}

export interface Verlaufspunkt {
  zeit: number
  werte: (number | null)[]
}

interface Props {
  titel: string
  serien: Serie[]
  punkte: Verlaufspunkt[]
  // Abstand zweier Messpunkte; groessere Luecken (Server aus) unterbrechen die Linie
  rasterMs: number
  vonMs: number
  bisMs: number
  yMax?: number
  formatY: (wert: number) => string
}

const HOEHE = 170
const RAND = { oben: 10, unten: 22, links: 44 }

function schoeneObergrenze(wert: number) {
  if (wert <= 0) return 1
  const stufe = 10 ** Math.floor(Math.log10(wert))
  for (const f of [1, 2, 2.5, 5, 10]) if (f * stufe >= wert) return f * stufe
  return 10 * stufe
}

function zeitText(ms: number, mitTag: boolean) {
  const d = new Date(ms)
  return mitTag
    ? `${d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')} ${d.getDate()}.`
    : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

export function VerlaufDiagramm({ titel, serien, punkte, rasterMs, vonMs, bisMs, yMax, formatY }: Props) {
  const rahmen = useRef<HTMLDivElement>(null)
  const [breite, setBreite] = useState(600)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = rahmen.current
    if (!el) return
    const beobachter = new ResizeObserver(([e]) => setBreite(Math.max(e.contentRect.width, 240)))
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [])

  // Rechts Platz fuer die direkte Beschriftung, wenn mehrere Linien gezeichnet werden.
  const rechts = serien.length > 1 ? 72 : 16
  const hoechster = Math.max(0, ...punkte.flatMap((p) => p.werte.map((w) => w ?? 0)))
  const oben = yMax ?? schoeneObergrenze(hoechster * 1.1)
  const innenB = breite - RAND.links - rechts
  const innenH = HOEHE - RAND.oben - RAND.unten
  const x = (ms: number) => RAND.links + ((ms - vonMs) / (bisMs - vonMs)) * innenB
  const y = (wert: number) => RAND.oben + innenH - (Math.min(wert, oben) / oben) * innenH

  const mehrtaegig = bisMs - vonMs > 36 * 3600_000
  // Beschriftungen mindestens 56 px auseinander, sonst nur jede zweite (dritte ...).
  let tickAbstand = mehrtaegig ? 24 * 3600_000 : 6 * 3600_000
  while ((tickAbstand / (bisMs - vonMs)) * innenB < 56) tickAbstand *= 2
  const ticks: number[] = []
  const start = new Date(vonMs)
  if (mehrtaegig) start.setHours(24, 0, 0, 0)
  else start.setHours(Math.ceil(start.getHours() / 6) * 6, 0, 0, 0)
  for (let t = start.getTime(); t <= bisMs; t += tickAbstand) if (t >= vonMs) ticks.push(t)

  // Pfade je Serie; neue Teilstrecke bei fehlendem Wert oder Zeitluecke.
  const pfade = serien.map((_, i) => {
    const strecken: [number, number][][] = []
    let aktuell: [number, number][] = []
    let vorher: number | null = null
    for (const p of punkte) {
      const w = p.werte[i]
      if (w == null || (vorher != null && p.zeit - vorher > rasterMs * 1.6)) {
        if (aktuell.length) strecken.push(aktuell)
        aktuell = []
      }
      if (w != null) aktuell.push([x(p.zeit), y(w)])
      vorher = p.zeit
    }
    if (aktuell.length) strecken.push(aktuell)
    return strecken
  })

  // Direkte Beschriftung am letzten Wert, bei Ueberlappung auseinandergeschoben.
  const endBeschriftung = serien
    .map((s, i) => {
      const letzter = [...punkte].reverse().find((p) => p.werte[i] != null)
      return letzter ? { name: s.name, y: y(letzter.werte[i]!) } : null
    })
    .filter((e): e is { name: string; y: number } => e != null)
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < endBeschriftung.length; i++) {
    if (endBeschriftung[i].y - endBeschriftung[i - 1].y < 12) endBeschriftung[i].y = endBeschriftung[i - 1].y + 12
  }

  const zeigerBewegen = (ev: React.PointerEvent<SVGRectElement>) => {
    if (!punkte.length) return
    const rect = ev.currentTarget.ownerSVGElement!.getBoundingClientRect()
    const ms = vonMs + ((ev.clientX - rect.left - RAND.links) / innenB) * (bisMs - vonMs)
    let naechster = 0
    for (let i = 1; i < punkte.length; i++) {
      if (Math.abs(punkte[i].zeit - ms) < Math.abs(punkte[naechster].zeit - ms)) naechster = i
    }
    setHover(naechster)
  }

  const h = hover != null ? punkte[hover] : null
  const hx = h ? x(h.zeit) : 0

  return (
    <div className="card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">{titel}</h3>
        {serien.length > 1 && (
          <div className="flex gap-3 text-xs text-text-muted">
            {serien.map((s) => (
              <span key={s.name} className="flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.punkt}`} />
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div ref={rahmen} className="relative">
        {punkte.length === 0 ? (
          <p className="flex h-[170px] items-center justify-center text-xs text-text-subtle">Noch keine Messwerte in diesem Zeitraum.</p>
        ) : (
          <svg width={breite} height={HOEHE} role="img" aria-label={`${titel}, Verlauf`} className="block">
            {[0, 0.5, 1].map((anteil) => (
              <g key={anteil}>
                <line
                  x1={RAND.links}
                  x2={breite - rechts}
                  y1={y(oben * anteil)}
                  y2={y(oben * anteil)}
                  className="stroke-border"
                  strokeWidth={1}
                />
                <text x={RAND.links - 6} y={y(oben * anteil) + 3} textAnchor="end" className="fill-text-subtle text-[10px]">
                  {formatY(oben * anteil)}
                </text>
              </g>
            ))}
            {ticks.map((t) => (
              <text key={t} x={x(t)} y={HOEHE - 6} textAnchor="middle" className="fill-text-subtle text-[10px]">
                {zeitText(t, mehrtaegig)}
              </text>
            ))}
            {serien.map((s, i) =>
              pfade[i].map((strecke, j) => {
                const linie = strecke.map(([px, py], k) => `${k ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')
                const unten = y(0)
                return (
                  <g key={`${s.name}-${j}`}>
                    {s.flaeche && strecke.length > 1 && (
                      <path d={`${linie}L${strecke[strecke.length - 1][0]},${unten}L${strecke[0][0]},${unten}Z`} className={s.flaeche} />
                    )}
                    <path d={linie} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className={s.linie} />
                  </g>
                )
              }),
            )}
            {serien.length > 1 &&
              endBeschriftung.map((e) => (
                <text key={e.name} x={breite - rechts + 6} y={e.y + 3} className="fill-text-muted text-[10px]">
                  {e.name}
                </text>
              ))}
            {h && (
              <g pointerEvents="none">
                <line x1={hx} x2={hx} y1={RAND.oben} y2={RAND.oben + innenH} className="stroke-text-subtle" strokeWidth={1} />
                {serien.map((s, i) =>
                  h.werte[i] != null ? (
                    <circle key={s.name} cx={hx} cy={y(h.werte[i]!)} r={4} strokeWidth={2} className={`${s.punkt} stroke-surface`} />
                  ) : null,
                )}
              </g>
            )}
            <rect
              x={RAND.links}
              y={RAND.oben}
              width={innenB}
              height={innenH}
              fill="transparent"
              onPointerMove={zeigerBewegen}
              onPointerDown={zeigerBewegen}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {h && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg"
            style={hx > breite / 2 ? { right: breite - hx + 10 } : { left: hx + 10 }}
          >
            <div className="mb-0.5 font-medium text-text">
              {new Date(h.zeit).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </div>
            {serien.map((s, i) => (
              <div key={s.name} className="flex items-center gap-1.5 text-text-muted">
                <span className={`inline-block h-2 w-2 rounded-full ${s.punkt}`} />
                {serien.length > 1 && `${s.name}: `}
                <span className="font-medium text-text">{h.werte[i] != null ? formatY(h.werte[i]!) : '–'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
