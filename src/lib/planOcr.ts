// Verbindet die Kasten-/Formerkennung (markierungErkennung.ts) mit Tesseract-OCR:
// jeder erkannte Kasten wird eng zugeschnitten, hochskaliert und per OCR
// gelesen, um den darin eingezeichneten Positions-Code zu lesen.

import { createWorker } from 'tesseract.js'
import { erkenneKaesten, extrahierePositionsCode } from './markierungErkennung'

export interface ErkannteMarkierung {
  x: number
  y: number
  code: string
  farbe: string
}

const OCR_SKALIERUNG = 3

export async function erkenneMarkierungenMitOcr(
  canvas: HTMLCanvasElement,
  onFortschritt?: (aktuell: number, gesamt: number) => void,
): Promise<ErkannteMarkierung[]> {
  const kaesten = erkenneKaesten(canvas)
  if (kaesten.length === 0) return []

  const worker = await createWorker('eng')
  const cropCanvas = document.createElement('canvas')
  const cropCtx = cropCanvas.getContext('2d')
  const ergebnisse: ErkannteMarkierung[] = []

  try {
    for (let i = 0; i < kaesten.length; i++) {
      const kasten = kaesten[i]
      onFortschritt?.(i + 1, kaesten.length)
      if (!cropCtx || kasten.cropRect.w <= 0 || kasten.cropRect.h <= 0) continue

      cropCanvas.width = kasten.cropRect.w * OCR_SKALIERUNG
      cropCanvas.height = kasten.cropRect.h * OCR_SKALIERUNG
      cropCtx.fillStyle = '#fff'
      cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height)
      cropCtx.drawImage(
        canvas,
        kasten.cropRect.x,
        kasten.cropRect.y,
        kasten.cropRect.w,
        kasten.cropRect.h,
        0,
        0,
        cropCanvas.width,
        cropCanvas.height,
      )

      const { data } = await worker.recognize(cropCanvas)
      const code = extrahierePositionsCode(data.text)
      if (!code) continue

      ergebnisse.push({
        x: (kasten.zielX / canvas.width) * 100,
        y: (kasten.zielY / canvas.height) * 100,
        code,
        farbe: kasten.farbe,
      })
    }
  } finally {
    await worker.terminate()
  }

  return ergebnisse
}

export async function ladeCanvasAusBild(bildUrl: string): Promise<HTMLCanvasElement> {
  const antwort = await fetch(bildUrl)
  if (!antwort.ok) throw new Error('Bild konnte nicht geladen werden')
  const blob = await antwort.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas nicht verfuegbar')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas
}
