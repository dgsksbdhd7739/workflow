import { useEffect, useRef, useState } from 'react'
import { getSignedUrl } from '../lib/supabase'

export function PdfThumbnail({
  bucket,
  path,
  className,
}: {
  bucket: 'plaene'
  path: string
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [fehler, setFehler] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setFehler(false)

    getSignedUrl(bucket, path).then(({ url, error }) => {
      if (cancelled) return
      if (error || !url) {
        setFehler(true)
        return
      }
      Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
        .then(([pdfjsLib, { default: workerUrl }]) => {
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
          return pdfjsLib.getDocument({ url }).promise
        })
        .then((pdf) => pdf.getPage(1))
        .then(async (page) => {
          const canvas = canvasRef.current
          if (!canvas || cancelled) return
          const viewport = page.getViewport({ scale: 0.5 })
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
    })

    return () => {
      cancelled = true
    }
  }, [bucket, path])

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
