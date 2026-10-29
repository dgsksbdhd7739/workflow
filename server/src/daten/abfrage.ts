import { AnfrageFehler } from '../anfrage.ts'
import type { Tabelle } from './schema.ts'

// Wire-Format der Daten-Schnittstelle. Bildet genau den Funktionsumfang ab,
// den das Frontend (frueher ueber supabase-js) nutzt -- keine Joins, keine
// freien Ausdruecke. Tabellen-/Spaltennamen werden gegen das Schema geprueft,
// alle Werte gehen als Parameter an Postgres.

const OPERATOREN = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'like',
  ilike: 'ilike',
} as const

export type Operator = keyof typeof OPERATOREN | 'in' | 'is'

export interface Filter {
  spalte: string
  op: Operator
  wert: unknown
  nicht?: boolean
}

export interface Abfrage {
  aktion: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  spalten?: string
  rueckgabe?: boolean
  werte?: Record<string, unknown> | Record<string, unknown>[]
  konflikt?: string
  filter?: Filter[]
  sortierung?: { spalte: string; absteigend?: boolean }[]
  limit?: number
  zaehlen?: boolean
  nurZaehlen?: boolean
}

export interface SqlAnweisung {
  text: string
  werte: unknown[]
}

const MAX_IN_WERTE = 1000

function bezeichner(name: string) {
  return `"${name.replace(/"/g, '""')}"`
}

class Bauer {
  readonly werte: unknown[] = []
  private readonly tabelle: Tabelle

  constructor(tabelle: Tabelle) {
    this.tabelle = tabelle
  }

  spalte(name: unknown): string {
    if (typeof name !== 'string' || !this.tabelle.spalten.has(name)) {
      throw new AnfrageFehler(400, `Unbekannte Spalte "${String(name)}" in ${this.tabelle.name}.`, 'spalte_unbekannt')
    }
    return bezeichner(name)
  }

  // Wert fuer eine Spalte als Parameter anhaengen. json/jsonb explizit
  // serialisieren -- sonst wuerde node-pg ein JS-Array als Postgres-Array senden.
  parameter(spalte: string, wert: unknown): string {
    const typ = this.tabelle.spalten.get(spalte)?.typ
    const istJson = typ === 'json' || typ === 'jsonb'
    this.werte.push(istJson && wert !== null && wert !== undefined ? JSON.stringify(wert) : wert)
    return `$${this.werte.length}`
  }

  spaltenliste(spalten: unknown): string {
    if (spalten === undefined || spalten === null || spalten === '*') return '*'
    if (typeof spalten !== 'string') throw new AnfrageFehler(400, 'Ungültige Spaltenauswahl.')
    const namen = spalten.split(',').map((s) => s.trim())
    if (namen.some((n) => n === '*')) return '*'
    return namen.map((n) => this.spalte(n)).join(', ')
  }

  bedingungen(filter: unknown): string {
    if (filter === undefined) return ''
    if (!Array.isArray(filter)) throw new AnfrageFehler(400, 'Ungültige Filter.')
    const teile = filter.map((f: Filter) => {
      const spalte = this.spalte(f?.spalte)
      let ausdruck: string
      if (f.op === 'in') {
        if (!Array.isArray(f.wert) || f.wert.length > MAX_IN_WERTE) {
          throw new AnfrageFehler(400, `"in" erwartet eine Liste mit höchstens ${MAX_IN_WERTE} Werten.`)
        }
        ausdruck = `${spalte} = any(${this.parameter(f.spalte, f.wert)})`
      } else if (f.op === 'is') {
        const literal = f.wert === null ? 'null' : f.wert === true ? 'true' : f.wert === false ? 'false' : undefined
        if (!literal) throw new AnfrageFehler(400, '"is" erlaubt nur null, true oder false.')
        ausdruck = `${spalte} is ${literal}`
      } else if (Object.hasOwn(OPERATOREN, f.op)) {
        ausdruck = `${spalte} ${OPERATOREN[f.op as keyof typeof OPERATOREN]} ${this.parameter(f.spalte, f.wert)}`
      } else {
        throw new AnfrageFehler(400, `Unbekannter Filter "${String(f.op)}".`)
      }
      return f.nicht ? `not (${ausdruck})` : ausdruck
    })
    return teile.length ? ` where ${teile.join(' and ')}` : ''
  }

  sortierung(sortierung: Abfrage['sortierung']): string {
    if (!sortierung?.length) return ''
    if (!Array.isArray(sortierung)) throw new AnfrageFehler(400, 'Ungültige Sortierung.')
    return ` order by ${sortierung.map((s) => `${this.spalte(s?.spalte)} ${s.absteigend ? 'desc' : 'asc'}`).join(', ')}`
  }
}

function zeilenVon(werte: Abfrage['werte']): Record<string, unknown>[] {
  const zeilen = Array.isArray(werte) ? werte : werte ? [werte] : []
  if (zeilen.some((z) => typeof z !== 'object' || z === null || Array.isArray(z))) {
    throw new AnfrageFehler(400, 'Ungültige Werte.')
  }
  return zeilen
}

function limitKlausel(limit: unknown) {
  if (limit === undefined || limit === null) return ''
  if (!Number.isInteger(limit) || (limit as number) < 0 || (limit as number) > 100_000) {
    throw new AnfrageFehler(400, 'Ungültiges Limit.')
  }
  return ` limit ${limit as number}`
}

/** Hauptabfrage; bei zaehlen zusaetzlich eine count-Anweisung mit denselben Filtern. */
export function baueSql(tabelle: Tabelle, a: Abfrage): { haupt: SqlAnweisung | null; zaehlung: SqlAnweisung | null } {
  const name = `public.${bezeichner(tabelle.name)}`

  if (a.aktion === 'select') {
    const zaehlung = a.zaehlen || a.nurZaehlen ? zaehlSql(tabelle, a) : null
    if (a.nurZaehlen) return { haupt: null, zaehlung }
    const b = new Bauer(tabelle)
    const text = `select ${b.spaltenliste(a.spalten)} from ${name}${b.bedingungen(a.filter)}${b.sortierung(a.sortierung)}${limitKlausel(a.limit)}`
    return { haupt: { text, werte: b.werte }, zaehlung }
  }

  const b = new Bauer(tabelle)
  const rueckgabe = a.rueckgabe ? ` returning ${b.spaltenliste(a.spalten)}` : ''

  if (a.aktion === 'insert' || a.aktion === 'upsert') {
    const zeilen = zeilenVon(a.werte)
    if (zeilen.length === 0) return { haupt: null, zaehlung: null }
    const spalten = [...new Set(zeilen.flatMap((z) => Object.keys(z)))]
    const kopf = spalten.map((s) => b.spalte(s))
    // Fehlt ein Schluessel in einer Zeile, gilt der Spalten-Default (wie bisher).
    const werteTeil = zeilen
      .map((z) => `(${spalten.map((s) => (Object.hasOwn(z, s) ? b.parameter(s, z[s]) : 'default')).join(', ')})`)
      .join(', ')
    let konflikt = ''
    if (a.aktion === 'upsert') {
      const schluessel = a.konflikt ? a.konflikt.split(',').map((s) => s.trim()) : tabelle.primaerschluessel
      if (schluessel.length === 0) throw new AnfrageFehler(400, 'Upsert braucht Konfliktspalten.')
      const ziel = schluessel.map((s) => b.spalte(s)).join(', ')
      const aendern = spalten.filter((s) => !schluessel.includes(s))
      konflikt = aendern.length
        ? ` on conflict (${ziel}) do update set ${aendern.map((s) => `${bezeichner(s)} = excluded.${bezeichner(s)}`).join(', ')}`
        : ` on conflict (${ziel}) do nothing`
    }
    return { haupt: { text: `insert into ${name} (${kopf.join(', ')}) values ${werteTeil}${konflikt}${rueckgabe}`, werte: b.werte }, zaehlung: null }
  }

  // update/delete nie ohne Filter -- schuetzt vor versehentlichen Massenaenderungen.
  if (!Array.isArray(a.filter) || a.filter.length === 0) {
    throw new AnfrageFehler(400, `${a.aktion} ohne Filter ist nicht erlaubt.`)
  }

  if (a.aktion === 'update') {
    const [zeile] = zeilenVon(a.werte)
    const spalten = zeile ? Object.keys(zeile) : []
    if (spalten.length === 0) throw new AnfrageFehler(400, 'Keine Werte zum Ändern.')
    const setzen = spalten.map((s) => `${b.spalte(s)} = ${b.parameter(s, zeile[s])}`).join(', ')
    return { haupt: { text: `update ${name} set ${setzen}${b.bedingungen(a.filter)}${rueckgabe}`, werte: b.werte }, zaehlung: null }
  }

  if (a.aktion === 'delete') {
    return { haupt: { text: `delete from ${name}${b.bedingungen(a.filter)}${rueckgabe}`, werte: b.werte }, zaehlung: null }
  }

  throw new AnfrageFehler(400, `Unbekannte Aktion "${String(a.aktion)}".`)
}

function zaehlSql(tabelle: Tabelle, a: Abfrage): SqlAnweisung {
  const b = new Bauer(tabelle)
  return { text: `select count(*)::int as anzahl from public.${bezeichner(tabelle.name)}${b.bedingungen(a.filter)}`, werte: b.werte }
}
