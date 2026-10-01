const KENNUNG_KEY = 'workflow_geraet_kennung'

// Zufaellige, pro Browser einmalig erzeugte Kennung, um "dieses Geraet" in
// der Liste angemeldeter Geraete wiederzuerkennen -- es gibt dafuer keine
// Supabase-eigene Geraete-ID.
export function geraetKennung(): string {
  try {
    let kennung = localStorage.getItem(KENNUNG_KEY)
    if (!kennung) {
      kennung = crypto.randomUUID()
      localStorage.setItem(KENNUNG_KEY, kennung)
    }
    return kennung
  } catch {
    // localStorage nicht verfuegbar (z. B. privater Modus) -- Kennung gilt
    // dann nur fuer die aktuelle Seitenladung, kein kritischer Fehler.
    return crypto.randomUUID()
  }
}

// Grobe, lesbare Geraetebezeichnung aus dem User-Agent -- kein Anspruch auf
// exakte Geraeteerkennung, nur zur Wiedererkennung in der Liste.
export function geraetName(): string {
  const ua = navigator.userAgent
  let betriebssystem = 'Unbekanntes System'
  if (/Windows/i.test(ua)) betriebssystem = 'Windows'
  else if (/Android/i.test(ua)) betriebssystem = 'Android'
  else if (/iPhone|iPad|iPod/i.test(ua)) betriebssystem = 'iOS'
  else if (/Mac OS X/i.test(ua)) betriebssystem = 'macOS'
  else if (/Linux/i.test(ua)) betriebssystem = 'Linux'

  let browser = 'Browser'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/Chrome\//i.test(ua)) browser = 'Chrome'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/Safari\//i.test(ua)) browser = 'Safari'

  return `${browser} auf ${betriebssystem}`
}
