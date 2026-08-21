export type AufgabeStatus = 'offen' | 'in_bearbeitung' | 'erledigt'
export type AufgabePrioritaet = 'niedrig' | 'mittel' | 'hoch'

export type Rolle = 'admin' | 'planer' | 'techniker' | 'kunde'

export interface Profile {
  id: string
  full_name: string
  role: Rolle
  muss_passwort_aendern: boolean
  onboarding_gesehen: boolean
  deaktiviert: boolean
  unternehmen_id: string
  created_at: string
}

export interface Unternehmen {
  id: string
  name: string
  logo_pfad: string | null
  strasse: string | null
  hausnummer: string | null
  plz: string | null
  stadt: string | null
  land: string | null
  telefon: string | null
  email: string | null
  website: string | null
  erstellt_am: string
}

export interface ChatNachricht {
  id: string
  unternehmen_id: string
  user_id: string
  text: string
  erstellt_am: string
}

export interface ProjektChatNachricht {
  id: string
  projekt_id: string
  user_id: string
  text: string
  erstellt_am: string
}

export interface Projekt {
  id: string
  unternehmen_id: string
  name: string
  adresse: string | null
  projektnummer: string | null
  projektleiter_id: string | null
  bauleitender_obermonteur_id: string | null
  kunde_name: string | null
  projekt_beginn: string | null
  projekt_ende: string | null
  sprache: string
  logo_pfad: string | null
  projekt_land: string | null
  projekt_strasse: string | null
  projekt_hausnummer: string | null
  projekt_adresszusatz: string | null
  projekt_plz: string | null
  projekt_stadt: string | null
  kunden_land: string | null
  kunden_strasse: string | null
  kunden_hausnummer: string | null
  kunden_adresszusatz: string | null
  kunden_plz: string | null
  kunden_stadt: string | null
  archiviert: boolean
  created_by: string
  created_at: string
}

export interface Aufgabe {
  id: string
  projekt_id: string
  titel: string
  beschreibung: string | null
  status: AufgabeStatus
  prioritaet: AufgabePrioritaet
  verantwortlicher_id: string | null
  faellig_am: string | null
  foto_pfad: string | null
  plan_id: string | null
  position_x: number | null
  position_y: number | null
  position_x2: number | null
  position_y2: number | null
  farbe: string | null
  status_wert_id: string | null
  abnahme_nummer: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface Plan {
  id: string
  projekt_id: string
  name: string
  datei_pfad: string
  statusvorlage_id: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface Tagesbericht {
  id: string
  projekt_id: string
  datum: string
  personal_anzahl: number | null
  taetigkeiten: string | null
  besonderheiten: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface Zeiterfassung {
  id: string
  projekt_id: string
  user_id: string
  datum: string
  start_zeit: string
  end_zeit: string | null
  pause_minuten: number
  taetigkeit: string | null
  aufgabe_id: string | null
  foto_pfad: string | null
  erstellt_am: string
}

export type TerminStatus = 'geplant' | 'laufend' | 'abgeschlossen' | 'verzoegert'

export interface Termin {
  id: string
  projekt_id: string
  titel: string
  start_datum: string
  end_datum: string
  status: TerminStatus
  vorgaenger_id: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface AufgabePhase {
  id: string
  aufgabe_id: string
  titel: string
  reihenfolge: number
  status: AufgabeStatus
  notiz: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface AufgabeMaterial {
  id: string
  aufgabe_id: string
  bezeichnung: string
  menge: number
  einheit: string | null
  erledigt: boolean
  reihenfolge: number
  material_stamm_id: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface MaterialStamm {
  id: string
  unternehmen_id: string
  bezeichnung: string
  einheit: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface AufgabeKommentar {
  id: string
  aufgabe_id: string
  text: string | null
  foto_pfad: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface StatusVorlage {
  id: string
  unternehmen_id: string
  name: string
  ist_standard: boolean
  erstellt_von: string
  erstellt_am: string
}

export type DokumentKategorie = 'projekt' | 'aufgabe'

export interface Dokument {
  id: string
  projekt_id: string
  aufgabe_id: string | null
  kategorie: DokumentKategorie
  name: string
  datei_pfad: string
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

export interface TagesberichtTuer {
  id: string
  tagesbericht_id: string
  aufgabe_id: string | null
  titel: string
  stand: string
  reihenfolge: number
  erstellt_am: string
}
