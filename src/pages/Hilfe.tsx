import {
  Archive,
  CalendarDays,
  ClipboardList,
  FileText,
  ListChecks,
  Map as MapIcon,
  MessageCircle,
  Package,
  Clock,
  type LucideIcon,
} from 'lucide-react'

interface Abschnitt {
  titel: string
  icon: LucideIcon
  text: string
}

const abschnitte: Abschnitt[] = [
  {
    titel: 'Baustellen',
    icon: MapIcon,
    text: 'Die Startseite listet alle deine Baustellen. Jede Baustelle hat eine eigene Übersicht mit Zugriff auf Aufgaben, Pläne, Dokumente, Tagesberichte, Material und Termine.',
  },
  {
    titel: 'Aufgaben (Mängel)',
    icon: ListChecks,
    text: 'Aufgaben werden je Baustelle angelegt, mit Status, Priorität, Fotos und optional einer Position auf dem Plan. Kommentare und Materialverbrauch lassen sich direkt an der Aufgabe erfassen.',
  },
  {
    titel: 'Pläne',
    icon: MapIcon,
    text: 'Baupläne hochladen und Markierungen (Pins/Rechtecke) direkt darauf setzen, um Aufgaben oder Notizen einer genauen Stelle zuzuordnen.',
  },
  {
    titel: 'Dokumente',
    icon: FileText,
    text: 'Sonstige Unterlagen zu einer Baustelle — z. B. Verträge oder Ausschreibungen — lassen sich nach Kategorie sortiert ablegen.',
  },
  {
    titel: 'Tagesberichte',
    icon: ClipboardList,
    text: 'Das Bautagebuch fasst pro Tag zusammen, was an welcher Aufgabe gemacht wurde, inklusive Kommentaren, Fotos und Materialverbrauch. Als PDF exportierbar.',
  },
  {
    titel: 'Zeiterfassung',
    icon: Clock,
    text: 'Arbeitszeiten je Mitarbeiter und Baustelle werden hier gestoppt oder nachgetragen und fließen automatisch in die Tagesberichte ein.',
  },
  {
    titel: 'Material',
    icon: Package,
    text: 'Materialverbrauch je Baustelle erfassen. Häufig verwendete Materialien lassen sich unternehmensweit im Materialstamm (Einstellungen) hinterlegen, statt sie jedes Mal neu einzutippen.',
  },
  {
    titel: 'Termine',
    icon: CalendarDays,
    text: 'Wichtige Termine einer Baustelle im Blick behalten, z. B. Abnahmen oder Lieferungen.',
  },
  {
    titel: 'Team- & Projekt-Chat',
    icon: MessageCircle,
    text: 'Der Team-Chat ist für unternehmensweite Absprachen, der Projekt-Chat für Themen zu einer einzelnen Baustelle.',
  },
  {
    titel: 'Archiv',
    icon: Archive,
    text: 'Abgeschlossene Baustellen landen im Archiv und bleiben dort einsehbar, tauchen aber nicht mehr in der aktiven Übersicht auf.',
  },
]

export function Hilfe() {
  return (
    <div className="page max-w-xl">
      <h1 className="mb-1 text-xl font-semibold text-text">Hilfe</h1>
      <p className="mb-6 text-sm text-text-muted">
        Kurzüberblick über die wichtigsten Bereiche von WorkFlow. Die Einführungs-Anleitung kannst du dir
        außerdem jederzeit in den Einstellungen erneut anzeigen lassen.
      </p>

      <div className="space-y-4">
        {abschnitte.map((abschnitt) => (
          <section key={abschnitt.titel} className="card p-4">
            <div className="mb-1.5 flex items-center gap-2.5">
              <div className="logo-tile h-8 w-8 shrink-0">
                <abschnitt.icon className="h-4 w-4" strokeWidth={2.25} />
              </div>
              <h2 className="text-sm font-semibold text-text">{abschnitt.titel}</h2>
            </div>
            <p className="text-sm text-text-muted">{abschnitt.text}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
