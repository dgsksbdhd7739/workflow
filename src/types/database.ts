import type { Paket } from '../lib/pakete'

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
  telefon: string | null
  positionsbezeichnung: string | null
  strasse: string | null
  plz: string | null
  stadt: string | null
  produkt_hinweise: boolean
}

export interface NutzerSitzung {
  id: string
  user_id: string
  geraet_kennung: string
  geraet_name: string
  letzter_zugriff: string
  erstellt_am: string
  sitzung_id: string | null
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
  max_nutzer: number | null
  paket: Paket
}

export interface PlattformUnternehmenUebersicht {
  id: string
  name: string
  paket: Paket
  max_nutzer: number | null
  nutzer_anzahl: number
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
  label_x: number | null
  label_y: number | null
  farbe: string | null
  status_wert_id: string | null
  abnahme_nummer: string | null
  // Optionale Zuordnung zu genau einem Bereich (Einheit ODER Geschoss ODER Gebaeude).
  gebaeude_id: string | null
  geschoss_id: string | null
  einheit_id: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface Plan {
  id: string
  projekt_id: string
  name: string
  datei_pfad: string
  // Seite der (ggf. mehrseitigen) PDF, die dieser Plan zeigt
  seite: number
  statusvorlage_id: string | null
  erstellt_von: string
  erstellt_am: string
}

export interface Gebaeude {
  id: string
  projekt_id: string
  name: string
  adresse: string | null
  beschreibung: string | null
  // Lage/Grundriss in Metern fuer die 3D-Ansichten; ohne Lage ordnet die Oberflaeche automatisch an.
  lage_x: number | null
  lage_z: number | null
  breite_m: number
  tiefe_m: number
  drehung_grad: number
  erstellt_von: string
  erstellt_am: string
}

export interface Geschoss {
  id: string
  gebaeude_id: string
  projekt_id: string
  name: string
  // -1 = UG, 0 = EG, 1 = OG 1 ...
  ebene: number
  hoehe_m: number
  // Aus einem Grundriss-Plan erzeugt (src/lib/planAnalyse.ts); Meter im
  // Gebaeude-Koordinatensystem, x nach rechts, z nach unten wie auf dem Plan
  plan_id: string | null
  plan_seite: number | null
  grundriss: [number, number][] | null
  plan_bild_pfad: string | null
  // blatt_x/blatt_z: Lage derselben Ecke auf dem PDF-Blatt (Meter), seit 2.7.0
  plan_bild_lage: { x: number; z: number; breite: number; tiefe: number; blatt_x?: number; blatt_z?: number } | null
  massstab: number | null
  // Raeume 1:1 aus dem Plan; einheit = Name der Einheit auf diesem Geschoss
  raeume: { punkte: [number, number][]; nr: string | null; einheit: string | null; flaeche: number }[] | null
  // Tueren aus dem Plan: Mitte, lichte Breite, Richtung der Wand (0 = entlang x, 90 = entlang z)
  tueren: { x: number; z: number; breite: number; winkel: 0 | 90 }[] | null
  erstellt_am: string
}

export type EinheitArt = 'wohnung' | 'gewerbe' | 'technik' | 'allgemein' | 'sonstiges'

export interface Einheit {
  id: string
  geschoss_id: string
  projekt_id: string
  name: string
  art: EinheitArt
  flaeche_m2: number | null
  reihenfolge: number
  // Position aus dem Grundriss-Plan (Meter), sonst automatisch verteilt
  lage_x: number | null
  lage_z: number | null
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
  vorlage_id: string | null
}

export interface TagesberichtVorlage {
  id: string
  unternehmen_id: string
  name: string
  ist_standard: boolean
  pdf_datei_pfad: string | null
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
  gebaeude_id: string | null
  geschoss_id: string | null
  einheit_id: string | null
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
  hersteller: string | null
  artikelnummer: string | null
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

export type AufgabeTicketStatus = 'offen' | 'erledigt'

export interface AufgabeTicket {
  id: string
  aufgabe_id: string
  text: string
  status: AufgabeTicketStatus
  erstellt_von: string
  erstellt_am: string
  erledigt_von: string | null
  erledigt_am: string | null
  bestaetigung_kommentar: string | null
  erledigen_bis: string | null
  nachfrist: string | null
  ist_gesperrt: boolean
  formular_id: string | null
}

export type TicketFormularFeldtyp = 'text' | 'zahl' | 'datum' | 'checkbox' | 'auswahl'

export interface TicketFormular {
  id: string
  unternehmen_id: string
  name: string
  ist_standard: boolean
  erstellt_von: string
  erstellt_am: string
}

export interface TicketFormularFeld {
  id: string
  formular_id: string
  titel: string
  feldtyp: TicketFormularFeldtyp
  pflichtfeld: boolean
  optionen: string[] | null
  reihenfolge: number
  erstellt_am: string
}

export interface AufgabeTicketFeldwert {
  id: string
  ticket_id: string
  feld_id: string
  wert: string | null
}

export interface AufgabeTicketEmpfaenger {
  id: string
  ticket_id: string
  user_id: string
  hinzugefuegt_von: string
  hinzugefuegt_am: string
}

export interface AufgabeTicketFoto {
  id: string
  ticket_id: string
  foto_pfad: string
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
export type DokumentFreigabestatus = 'keine_anforderung' | 'angefordert' | 'freigegeben' | 'abgelehnt'

export interface Dokument {
  id: string
  projekt_id: string
  aufgabe_id: string | null
  kategorie: DokumentKategorie
  name: string
  datei_pfad: string
  erstellt_von: string
  erstellt_am: string
  freigabestatus: DokumentFreigabestatus
  vorgaenger_id: string | null
  ordner_id: string | null
  groesse_bytes: number | null
}

export interface DokumentOrdner {
  id: string
  projekt_id: string
  parent_id: string | null
  name: string
  erstellt_von: string
  erstellt_am: string
}

export interface DokumentFreigabe {
  id: string
  dokument_id: string
  status: 'angefordert' | 'freigegeben' | 'abgelehnt'
  kommentar: string | null
  angefordert_von: string
  angefordert_am: string
  entschieden_von: string | null
  entschieden_am: string | null
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

export interface AufgabenFilterWerte {
  filterStatus: AufgabeStatus | 'alle' | 'ueberfaellig'
  suche: string
}

export interface AufgabenFilter {
  id: string
  user_id: string
  projekt_id: string
  name: string
  filter: AufgabenFilterWerte
  erstellt_am: string
}
