import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initLiveUpdate } from './lib/liveUpdate.ts'

// Wartet (mit Obergrenze) auf den Update-Check, bevor ueberhaupt gerendert
// wird: findet sich eine neuere Version, wechselt die App direkt dorthin,
// ohne dass die alte Oberflaeche je sichtbar wird oder der Nutzer manuell
// neu starten muss.
await initLiveUpdate()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
