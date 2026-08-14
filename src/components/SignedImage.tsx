import { useEffect, useState } from 'react'
import { getSignedUrl } from '../lib/supabase'

export function SignedImage({
  bucket,
  path,
  alt,
  className,
}: {
  bucket: 'mangel-fotos' | 'plaene' | 'projekt-logos'
  path: string
  alt: string
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setFehler(null)
    getSignedUrl(bucket, path).then(({ url: signedUrl, error }) => {
      if (cancelled) return
      setUrl(signedUrl)
      setFehler(error)
    })
    return () => {
      cancelled = true
    }
  }, [bucket, path])

  if (fehler) {
    return (
      <div
        title={fehler}
        className={`${className ?? ''} flex items-center justify-center bg-red-50 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400`}
      >
        ⚠
      </div>
    )
  }

  if (!url) {
    return <div className={`${className ?? ''} animate-pulse bg-surface-hover`} />
  }

  return <img src={url} alt={alt} className={className} />
}
