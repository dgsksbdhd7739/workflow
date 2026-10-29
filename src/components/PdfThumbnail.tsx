import { useEffect, useRef, useState } from 'react'
import { pdfDokument, pdfSeite } from '../lib/pdfLaden'

export function PdfThumbnail({
  bucket,
  path,
  seite = 1,
  className,
}: {
  bucket: 'plaene'
  path: string
  seite?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [fehler, setFehler] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setFehler(false)

    pdfDokument(bucket, path)
      .then((pdf) => pdfSeite(pdf, seite))
      .then(async (page) => {
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        // Vorschau etwa 480 px breit, egal wie gross das Blatt ist
        const viewport = page.getViewport({ scale: 480 / page.getViewport({ scale: 1 }).width })
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        await page.render({ canvas, canvasContext: ctx, viewport }).promise
        if (!cancelled) setReady(true)
      })
      .catch(() => {
        if (!cancelled) setFehler(true)
      })

    return () => {
      cancelled = true
    }
  }, [bucket, path, seite])

  if (fehler) {
    return <div className={`${className ?? ''} flex items-center justify-center text-3xl`}>📄</div>
  }

  return (
    <div className={`${className ?? ''} relative overflow-hidden bg-surface-hover`}>
      <canvas ref={canvasRef} className={`h-full w-full object-cover ${ready ? '' : 'invisible'}`} />
      {!ready && <div className="absolute inset-0 animate-pulse bg-surface-hover" />}
    </div>
  )
}
