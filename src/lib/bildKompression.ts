interface KompressionsOptionen {
  maxBreiteHoehe?: number
  qualitaet?: number
}

const STANDARD_MAX_GROESSE = 1600
const STANDARD_QUALITAET = 0.75
const MIN_DATEIGROESSE_FUER_KOMPRESSION = 400_000

export async function komprimiereBild(datei: File, optionen: KompressionsOptionen = {}): Promise<File> {
  if (!datei.type.startsWith('image/') || datei.type === 'image/svg+xml') return datei

  const maxBreiteHoehe = optionen.maxBreiteHoehe ?? STANDARD_MAX_GROESSE
  const qualitaet = optionen.qualitaet ?? STANDARD_QUALITAET

  if (datei.size < MIN_DATEIGROESSE_FUER_KOMPRESSION) return datei

  try {
    const bitmap = await createImageBitmap(datei)
    const skalierung = Math.min(1, maxBreiteHoehe / Math.max(bitmap.width, bitmap.height))
    const zielBreite = Math.round(bitmap.width * skalierung)
    const zielHoehe = Math.round(bitmap.height * skalierung)

    const canvas = document.createElement('canvas')
    canvas.width = zielBreite
    canvas.height = zielHoehe
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return datei
    }
    ctx.drawImage(bitmap, 0, 0, zielBreite, zielHoehe)
    bitmap.close()

    const ausgabeTyp = datei.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, ausgabeTyp, qualitaet))
    if (!blob || blob.size >= datei.size) return datei

    const endung = ausgabeTyp === 'image/png' ? '.png' : '.jpg'
    const neuerName = datei.name.replace(/\.\w+$/, '') + endung
    return new File([blob], neuerName, { type: ausgabeTyp })
  } catch {
    return datei
  }
}
