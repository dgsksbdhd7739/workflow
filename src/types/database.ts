export type MangelStatus = 'offen' | 'in_bearbeitung' | 'erledigt'
export type MangelPrioritaet = 'niedrig' | 'mittel' | 'hoch'

export interface Profile {
  id: string
  full_name: string
  role: 'admin' | 'polier' | 'arbeiter'
  created_at: string
}

export interface Baustelle {
  id: string
  name: string
  adresse: string | null
  created_by: string
  created_at: string
}

export interface Mangel {
  id: string
  baustelle_id: string
  titel: string
  beschreibung: string | null
  status: MangelStatus
  prioritaet: MangelPrioritaet
  verantwortlicher_id: string | null
  faellig_am: string | null
  foto_url: string | null
  plan_id: string | null
  position_x: number | null
  position_y: number | null
  farbe: string | null
  status_wert_id: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface Plan {
  id: string
  baustelle_id: string
  name: string
  datei_url: string
  statusvorlage_id: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface Tagesbericht {
  id: string
  baustelle_id: string
  datum: string
  wetter: string | null
  temperatur: number | null
  personal_anzahl: number | null
  taetigkeiten: string | null
  besonderheiten: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface Zeiterfassung {
  id: string
  baustelle_id: string
  user_id: string
  datum: string
  start_zeit: string
  end_zeit: string | null
  pause_minuten: number
  taetigkeit: string | null
  erstellt_am: string
}

export interface Leistung {
  id: string
  baustelle_id: string
  position_nr: number
  bezeichnung: string
  menge: number
  einheit: string
  einzelpreis: number
  erstellt_von: string
  erstellt_am: string
}

export type TerminStatus = 'geplant' | 'laufend' | 'abgeschlossen' | 'verzoegert'

export interface Termin {
  id: string
  baustelle_id: string
  titel: string
  start_datum: string
  end_datum: string
  status: TerminStatus
  vorgaenger_id: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface MangelPhase {
  id: string
  mangel_id: string
  titel: string
  reihenfolge: number
  status: MangelStatus
  notiz: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface MangelKommentar {
  id: string
  mangel_id: string
  text: string | null
  foto_url: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface StatusVorlage {
  id: string
  name: string
  erstellt_von: string
  erstellt_am: string
}

export interface StatusVorlageWert {
  id: string
  statusvorlage_id: string
  titel: string
  farbe: string
  reihenfolge: number
  ist_standard: boolean
  erstellt_am: string
}
