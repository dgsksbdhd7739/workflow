import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

function ermittleStartTheme(): Theme {
  const gespeichert = localStorage.getItem('theme')
  if (gespeichert === 'light' || gespeichert === 'dark') return gespeichert
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(ermittleStartTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return { theme, toggleTheme }
}
