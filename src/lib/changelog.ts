// Aenderungsprotokoll je Version. Bei jedem Release einen neuen Eintrag oben
// ergaenzen (Versionsnummer muss zu package.json passen). Wird beim Start
// mit der zuletzt gesehenen Version verglichen (siehe ChangelogDialog), um
// "Was ist neu"-Hinweise nach einem Update anzuzeigen.

export interface ChangelogEintrag {
  version: string
  datum: string
  aenderungen: string[]
}

export const CHANGELOG: ChangelogEintrag[] = [
  {
    version: '1.2.0',
    datum: '2026-08-19',
    aenderungen: [
      'Bautagebuch: jeder Bericht listet jetzt alle Türen/Aufgaben mit ihrem Stand zum Zeitpunkt der Erstellung',
      'Unternehmensdaten und Firmenlogo in den Einstellungen pflegbar — erscheinen im Kopf jedes PDF-Exports',
      'PDF-Exporte komplett überarbeitet: farbige Status-Badges, Material als Chips, Kommentare als Zitatblock, Fußzeile mit Seitenzahl',
      'Materialstamm: feste, unternehmensweite Materialien anlegen und Aufgaben zuordnen, statt jedes Mal Freitext',
      'Neuer Projekt-Chat zusätzlich zum Team-Chat, mit Auswahl des Projekts',
      'Fotos werden vor dem Hochladen automatisch komprimiert, ohne sichtbaren Qualitätsverlust',
      'Logo oben links führt jetzt auch am Desktop wieder zurück zu Home',
    ],
  },
  {
    version: '1.1.2',
    datum: '2026-08-17',
    aenderungen: [
      'Updates werden jetzt vor dem Start geladen — kein manuelles Schließen und Neuöffnen der App mehr nötig',
    ],
  },
  {
    version: '1.1.1',
    datum: '2026-08-17',
    aenderungen: [
      'Untere Navigation in Projekten überarbeitet: nur noch Übersicht, Aufgaben, Pläne und Zeiterfassung — gleichmäßig verteilt, kein Zusammenquetschen mehr',
      'Weitere Bereiche (Dokumente, Tagesberichte, Material, Termine) direkt über die Kacheln in der Projekt-Übersicht erreichbar',
    ],
  },
  {
    version: '1.1.0',
    datum: '2026-08-17',
    aenderungen: [
      'Push-Benachrichtigungen für neue Team-Chat-Nachrichten',
      'Neue Navigation: Home, Team-Chat, Archiv und Einstellungen direkt erreichbar',
      'Passwort ändern und Abmelden sind jetzt in den Einstellungen',
      'Diese "Was ist neu"-Anzeige nach Updates',
    ],
  },
]

const STORAGE_KEY = 'workflow_last_seen_version'

function vergleicheVersionen(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function holeUngeseheneEintraege(aktuelleVersion: string): ChangelogEintrag[] {
  let letzteGesehene: string | null = null
  try {
    letzteGesehene = localStorage.getItem(STORAGE_KEY)
  } catch {
    return []
  }
  // Erster Start ueberhaupt: nichts anzeigen, nur Marke setzen.
  if (!letzteGesehene) {
    markiereAlsGesehen(aktuelleVersion)
    return []
  }
  if (vergleicheVersionen(aktuelleVersion, letzteGesehene) <= 0) return []
  return CHANGELOG.filter(
    (e) => vergleicheVersionen(e.version, letzteGesehene!) > 0 && vergleicheVersionen(e.version, aktuelleVersion) <= 0,
  )
}

export function markiereAlsGesehen(version: string) {
  try {
    localStorage.setItem(STORAGE_KEY, version)
  } catch {
    // localStorage nicht verfuegbar (z. B. privater Modus) -> Hinweis wird
    // beim naechsten Start erneut gezeigt, kein kritischer Fehler.
  }
}
