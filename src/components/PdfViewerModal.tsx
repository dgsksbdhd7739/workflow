import { useEffect, useRef, useState } from 'react'
import { Share2, X } from 'lucide-react'

// Rendert ein PDF Seite fuer Seite als Canvas-Stapel -- gleicher Ansatz wie
// die Plan-Vorschau in PlanDetail.tsx, hier aber fuer beliebig viele Seiten
// statt nur die erste. So braucht es keinen nativen/Browser-PDF-Viewer, der
// sich je nach Android-WebView-Version unterschiedlich verhaelt.
//
// Bekommt die PDF-Bytes direkt (statt einer Blob-URL): pdf.js laedt eine
// per getDocument({ url }) uebergebene URL selbst per fetch() nach, und
// blob:-URLs sind ausserhalb des Dokument-Kontexts, der sie erzeugt hat,
// im Android-WebView nicht zuverlaessig aufloesbar -- derselbe Grund, aus
// dem urspruenglich window.open(bloburl) beim PDF-Oeffnen fehlschlug.
export function PdfViewerModal({
  data,
  titel,
  onClose,
  onTeilen,
}: {
  data: ArrayBuffer
  titel: string
  onClose: () => void
  onTeilen?: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ladend, setLadend] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let abgebrochen = false
    setLadend(true)
    setFehler(null)

    ;(async () => {
      try {
        const [pdfjsLib, { default: workerUrl }] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ])
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise
        const container = containerRef.current
        if (!container || abgebrochen) return
        container.innerHTML = ''

        for (let i = 1; i <= pdf.numPages; i++) {
          const seite = await pdf.getPage(i)
          const viewport = seite.getViewport({ scale: 1.5 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.className = 'mx-auto mb-3 block max-w-full rounded-lg border border-border shadow-sm'
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          await seite.render({ canvas, canvasContext: ctx, viewport }).promise
          if (abgebrochen) return
          container.appendChild(canvas)
        }

        if (!abgebrochen) setLadend(false)
      } catch (err) {
        console.error('PDF-Vorschau fehlgeschlagen:', err)
        if (!abgebrochen) {
          setFehler('PDF konnte nicht angezeigt werden.')
          setLadend(false)
        }
      }
    })()

    return () => {
      abgebrochen = true
    }
  }, [data])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border p-3">
        <p className="min-w-0 truncate text-sm font-medium text-text">{titel}</p>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {onTeilen && (
            <button type="button" onClick={onTeilen} title="Teilen / Herunterladen" className="btn-secondary">
              <Share2 className="h-4 w-4" strokeWidth={2.25} />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Schließen" className="p-1.5 text-text-subtle hover:text-text">
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {ladend && <p className="py-8 text-center text-sm text-text-muted">Lädt…</p>}
        {fehler && <p className="banner-error">{fehler}</p>}
        <div ref={containerRef} />
      </div>
    </div>
  )
}
