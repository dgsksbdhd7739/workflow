import pg from 'pg'

// Inhalt von request.jwt.claims -- dieselben Felder, die auth.uid()/auth.role()
// und die RLS-Policies (urspruenglich fuer Supabase geschrieben) auslesen.
export interface Claims {
  sub: string
  role: 'authenticated'
  email: string
  aal: 'aal1' | 'aal2'
  session_id: string
}

export type Verbindung = pg.PoolClient

/**
 * Zugriff auf Postgres als workflow_api. Die Rolle hat selbst keine Rechte
 * (NOINHERIT); jede Anfrage laeuft in einer Transaktion, die per SET LOCAL
 * ROLE in authenticated (RLS greift) oder service_role (RLS umgangen, nur fuer
 * serverseitige Verwaltungsaufgaben) wechselt. So erzwingen die bestehenden
 * Policies die Mandantentrennung, nicht der Anwendungscode.
 */
export class Datenbank {
  readonly pool: pg.Pool

  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 20 })
  }

  alsNutzer<T>(claims: Claims, arbeit: (v: Verbindung) => Promise<T>): Promise<T> {
    return this.transaktion('authenticated', claims, arbeit)
  }

  alsDienst<T>(arbeit: (v: Verbindung) => Promise<T>): Promise<T> {
    return this.transaktion('service_role', { role: 'service_role' }, arbeit)
  }

  async schliessen() {
    await this.pool.end()
  }

  private async transaktion<T>(
    rolle: 'authenticated' | 'service_role',
    claims: object,
    arbeit: (v: Verbindung) => Promise<T>,
  ): Promise<T> {
    const v = await this.pool.connect()
    try {
      await v.query('begin')
      // rolle stammt nur aus dem Union-Typ oben, nie aus Nutzereingaben.
      await v.query(`set local role ${rolle}`)
      await v.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)])
      const ergebnis = await arbeit(v)
      await v.query('commit')
      return ergebnis
    } catch (fehler) {
      await v.query('rollback').catch(() => {})
      throw fehler
    } finally {
      v.release()
    }
  }
}
