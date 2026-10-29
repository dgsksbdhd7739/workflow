import type { Datenbank } from '../datenbank.ts'

export interface Spalte {
  // udt_name aus information_schema, z. B. uuid, text, jsonb, _text (Array)
  typ: string
}

export interface Tabelle {
  name: string
  spalten: Map<string, Spalte>
  primaerschluessel: string[]
}

/**
 * Freigabeliste fuer die Daten-Schnittstelle: alle Tabellen im Schema public,
 * auf denen Row Level Security aktiv ist. Eine Tabelle ohne RLS taucht hier
 * bewusst nicht auf und ist damit ueber die API unerreichbar -- vergisst eine
 * kuenftige Migration die Policies, entsteht so kein Datenleck zwischen Firmen.
 * Wird beim Start geladen; neue Migrationen werden mit dem Neustart des
 * Dienstes beim Deploy wirksam.
 */
export async function ladeSchema(db: Datenbank): Promise<Map<string, Tabelle>> {
  return db.alsDienst(async (v) => {
    const { rows } = await v.query<{ tabelle: string; spalte: string; typ: string; pk: boolean }>(`
      select c.relname as tabelle, a.attname as spalte, t.typname as typ,
             coalesce(a.attnum = any(i.indkey), false) as pk
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        join pg_type t on t.oid = a.atttypid
        left join pg_index i on i.indrelid = c.oid and i.indisprimary
       where c.relkind in ('r', 'p') and c.relrowsecurity
       order by c.relname, a.attnum`)
    const tabellen = new Map<string, Tabelle>()
    for (const r of rows) {
      let t = tabellen.get(r.tabelle)
      if (!t) {
        t = { name: r.tabelle, spalten: new Map(), primaerschluessel: [] }
        tabellen.set(r.tabelle, t)
      }
      t.spalten.set(r.spalte, { typ: r.typ })
      if (r.pk) t.primaerschluessel.push(r.spalte)
    }
    return tabellen
  })
}
