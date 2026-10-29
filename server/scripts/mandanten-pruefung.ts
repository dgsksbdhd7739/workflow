// Prueft mit echten Daten, ob irgendein Nutzer Zeilen einer fremden Firma
// sieht. Laeuft gegen eine KOPIE der Produktivdatenbank (nur lesend):
//
//   auf dem Server:  sudo -u postgres createdb -T workflow workflow_kopie
//   lokal:           npm run tunnel   (in einem zweiten Terminal)
//                    PRUEF_DATABASE_URL=postgresql://workflow_api:...@127.0.0.1:5433/workflow_kopie \
//                      node --env-file-if-exists=.env scripts/mandanten-pruefung.ts
//
// Fuer jede ueber die API freigegebene Tabelle wird die besitzende Firma jeder
// Zeile ueber die Fremdschluessel ermittelt (unternehmen_id direkt oder ueber
// projekt_id, aufgabe_id, user_id ... bis zur Firma). Dann wird jeder Nutzer
// simuliert (gleicher Mechanismus wie die API) und verglichen.

import { Datenbank, type Claims } from '../src/datenbank.ts'
import { ladeSchema, type Tabelle } from '../src/daten/schema.ts'

const url = process.env.PRUEF_DATABASE_URL
if (!url || !/\/workflow_kopie(\?|$)/.test(url)) {
  console.error('PRUEF_DATABASE_URL muss auf die Datenbank workflow_kopie zeigen.')
  process.exit(1)
}
const db = new Datenbank(url)
const schema = await ladeSchema(db)

interface Fk {
  spalte: string
  ziel: string
  zielSpalte: string
}

const fks = await db.alsDienst(async (v) => {
  const { rows } = await v.query<{ tabelle: string; spalte: string; ziel: string; ziel_spalte: string }>(`
    select c.conrelid::regclass::text as tabelle, a.attname as spalte,
           c.confrelid::regclass::text as ziel, af.attname as ziel_spalte
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
     where c.contype = 'f' and array_length(c.conkey, 1) = 1
       and c.connamespace = 'public'::regnamespace`)
  const karte = new Map<string, Fk[]>()
  for (const r of rows) {
    const ziel = r.ziel.replace(/^public\./, '')
    const liste = karte.get(r.tabelle) ?? []
    liste.push({ spalte: r.spalte, ziel, zielSpalte: r.ziel_spalte })
    karte.set(r.tabelle, liste)
  }
  return karte
})

// Bevorzugte Wege zur Firma, falls eine Tabelle mehrere Fremdschluessel hat.
const VORRANG = ['projekt_id', 'aufgabe_id', 'tagesbericht_id', 'plan_id', 'ordner_id', 'formular_id', 'user_id']

/** SQL-Ausdruck, der fuer Zeile alias der Tabelle die Firmen-ID liefert, oder null. */
function firmaAusdruck(tabelle: string, alias: string, tiefe = 0): string | null {
  if (tabelle === 'unternehmen') return `${alias}.id`
  const t = schema.get(tabelle)
  if (t?.spalten.has('unternehmen_id')) return `${alias}.unternehmen_id`
  if (tiefe > 4) return null
  const kandidaten = (fks.get(tabelle) ?? []).sort(
    (a, b) => (VORRANG.indexOf(a.spalte) + 1 || 99) - (VORRANG.indexOf(b.spalte) + 1 || 99),
  )
  for (const fk of kandidaten) {
    if (fk.ziel === tabelle) continue
    const innen = `z${tiefe}`
    const ausdruck = firmaAusdruck(fk.ziel, innen, tiefe + 1)
    if (ausdruck) {
      return `(select ${ausdruck} from public."${fk.ziel}" ${innen} where ${innen}."${fk.zielSpalte}" = ${alias}."${fk.spalte}")`
    }
  }
  return null
}

function schluessel(t: Tabelle) {
  const pk = t.primaerschluessel.length ? t.primaerschluessel : [...t.spalten.keys()]
  return `json_build_array(${pk.map((s) => `t."${s}"`).join(', ')})::text`
}

const nutzer = await db.alsDienst(async (v) => {
  const { rows } = await v.query<{ id: string; email: string; unternehmen_id: string; role: string; plattform: boolean }>(`
    select u.id, u.email, p.unternehmen_id, p.role,
           exists (select 1 from public.plattform_admins a where a.user_id = u.id) as plattform
      from auth.users u join public.profiles p on p.id = u.id order by p.unternehmen_id, p.role`)
  return rows
})

let verstoesse = 0
const ohneZuordnung: string[] = []
console.log(`Nutzer: ${nutzer.length}, Tabellen: ${schema.size}\n`)

for (const t of [...schema.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const firma = firmaAusdruck(t.name, 't')
  const besitz = await db.alsDienst(async (v) => {
    const { rows } = await v.query<{ k: string; f: string | null }>(
      `select ${schluessel(t)} as k, ${firma ?? 'null'}::text as f from public."${t.name}" t`,
    )
    return new Map(rows.map((r) => [r.k, r.f]))
  })
  if (!firma) ohneZuordnung.push(`${t.name} (${besitz.size} Zeilen)`)

  const zeilen: string[] = []
  for (const n of nutzer) {
    const claims: Claims = { sub: n.id, role: 'authenticated', email: n.email, aal: 'aal2', session_id: '00000000-0000-0000-0000-000000000000' }
    const sichtbar = await db.alsNutzer(claims, async (v) => (await v.query<{ k: string }>(`select ${schluessel(t)} as k from public."${t.name}" t`)).rows)
    const fremd = sichtbar.filter((r) => {
      const f = besitz.get(r.k)
      return f !== null && f !== undefined && f !== n.unternehmen_id
    })
    if (fremd.length && !n.plattform) verstoesse += fremd.length
    zeilen.push(`${n.role}${n.plattform ? '+plattform' : ''}@${n.unternehmen_id.slice(0, 4)}: ${sichtbar.length}${fremd.length ? ` (FREMD: ${fremd.length})` : ''}`)
  }
  console.log(`${t.name.padEnd(30)} gesamt ${String(besitz.size).padStart(3)} | ${zeilen.join(' | ')}`)
}

console.log(`\nOhne ermittelbare Firma (manuell pruefen): ${ohneZuordnung.join(', ') || '-'}`)
console.log(verstoesse ? `\nVERSTOESSE: ${verstoesse} fremde Zeilen sichtbar (ohne Plattform-Admins)` : '\nKeine fremden Zeilen sichtbar (Plattform-Admins ausgenommen).')
await db.schliessen()
process.exit(verstoesse ? 1 : 0)
