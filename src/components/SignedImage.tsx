import { useEffect, useState } from 'react'
import { getSignedUrl } from '../lib/supabase'

export function SignedImage({
  bucket,
  path,
  alt,
  className,
}: {
  bucket: 'mangel-fotos' | 'plaene'
  path: string
  alt: string
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    getSignedUrl(bucket, path).then((signedUrl) => {
      if (!cancelled) setUrl(signedUrl)
    })
    return () => {
      cancelled = true
    }
  }, [bucket, path])

  if (!url) {
    return <div className={`${className ?? ''} animate-pulse bg-gray-200`} />
  }

  return <img src={url} alt={alt} className={className} />
}
