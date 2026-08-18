import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MessageCircle, Send, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import type { Baustelle, ProjektChatNachricht } from '../types/database'

function formatUhrzeit(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function formatTag(iso: string) {
  const d = new Date(iso)
  const heute = new Date()
  const gestern = new Date(heute)
  gestern.setDate(heute.getDate() - 1)
  const gleicherTag = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (gleicherTag(d, heute)) return 'Heute'
  if (gleicherTag(d, gestern)) return 'Gestern'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function initialen(name: string) {
  const teile = name.trim().split(/\s+/)
  const erste = teile[0]?.[0] ?? '?'
  const letzte = teile.length > 1 ? teile[teile.length - 1][0] : ''
  return (erste + letzte).toUpperCase()
}

export function ProjektChat() {
  const { user } = useAuth()
  const { nameOf } = useProfiles()
  const [baustellen, setBaustellen] = useState<Baustelle[]>([])
  const [baustelleId, setBaustelleId] = useState('')
  const [nachrichten, setNachrichten] = useState<ProjektChatNachricht[]>([])
  const [text, setText] = useState('')
  const [ladeProjekte, setLadeProjekte] = useState(true)
  const [loading, setLoading] = useState(true)
  const [senden, setSenden] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase
      .from('baustellen')
      .select('*')
      .eq('archiviert', false)
      .order('name')
      .then(({ data }) => {
        setBaustellen(data ?? [])
        if (data && data.length > 0) setBaustelleId(data[0].id)
        setLadeProjekte(false)
      })
  }, [])

  useEffect(() => {
    if (!baustelleId) {
      setNachrichten([])
      setLoading(false)
      return
    }
    setLoading(true)
    supabase
      .from('projekt_chat_nachrichten')
      .select('*')
      .eq('baustelle_id', baustelleId)
      .order('erstellt_am', { ascending: true })
      .limit(200)
      .then(({ data }) => {
        setNachrichten(data ?? [])
        setLoading(false)
      })

    const channel = supabase
      .channel(`projekt-chat-${baustelleId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'projekt_chat_nachrichten', filter: `baustelle_id=eq.${baustelleId}` },
        (payload) => {
          setNachrichten((prev) =>
            prev.some((n) => n.id === payload.new.id) ? prev : [...prev, payload.new as ProjektChatNachricht],
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'projekt_chat_nachrichten', filter: `baustelle_id=eq.${baustelleId}` },
        (payload) => {
          setNachrichten((prev) => prev.filter((n) => n.id !== payload.old.id))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [baustelleId])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [nachrichten.length])

  const handleSenden = async (e: FormEvent) => {
    e.preventDefault()
    const inhalt = text.trim()
    if (!inhalt || !user || !baustelleId) return
    setSenden(true)
    setFehler(null)
    setText('')
    const { data, error } = await supabase
      .from('projekt_chat_nachrichten')
      .insert({ baustelle_id: baustelleId, user_id: user.id, text: inhalt })
      .select()
      .single()
    setSenden(false)
    if (error) {
      setFehler(error.message)
      setText(inhalt)
      return
    }
    if (data) setNachrichten((prev) => (prev.some((n) => n.id === data.id) ? prev : [...prev, data as ProjektChatNachricht]))
  }

  const handleLoeschen = async (id: string) => {
    setNachrichten((prev) => prev.filter((n) => n.id !== id))
    const { error } = await supabase.from('projekt_chat_nachrichten').delete().eq('id', id)
    if (error) setFehler(error.message)
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">Projekt-Chat</h1>
        {!ladeProjekte && baustellen.length > 0 && (
          <select value={baustelleId} onChange={(e) => setBaustelleId(e.target.value)} className="field-input w-auto">
            {baustellen.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {fehler && <p className="banner-error mb-3">Fehler: {fehler}</p>}

      {!ladeProjekte && baustellen.length === 0 ? (
        <div className="card flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center text-text-subtle">
          <MessageCircle className="h-8 w-8" strokeWidth={1.75} />
          <p className="text-sm">Noch keine Projekte angelegt.</p>
        </div>
      ) : (
        <>
          <div ref={listRef} className="card min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {loading ? (
              <p className="text-sm text-text-muted">Lädt…</p>
            ) : nachrichten.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center text-text-subtle">
                <MessageCircle className="h-8 w-8" strokeWidth={1.75} />
                <p className="text-sm">Noch keine Nachrichten für dieses Projekt. Schreib die erste!</p>
              </div>
            ) : (
              nachrichten.map((n, i) => {
                const eigene = n.user_id === user?.id
                const vorherige = nachrichten[i - 1]
                const neuerTag = !vorherige || formatTag(vorherige.erstellt_am) !== formatTag(n.erstellt_am)
                return (
                  <div key={n.id}>
                    {neuerTag && (
                      <div className="my-3 flex items-center gap-2 text-xs font-medium text-text-subtle">
                        <div className="h-px flex-1 bg-border" />
                        {formatTag(n.erstellt_am)}
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div className={`group flex items-end gap-2 ${eigene ? 'flex-row-reverse' : ''}`}>
                      {!eigene && (
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11px] font-semibold text-text-muted">
                          {initialen(nameOf(n.user_id))}
                        </div>
                      )}
                      <div className={`flex max-w-[75%] flex-col ${eigene ? 'items-end' : 'items-start'}`}>
                        <span className="mb-0.5 px-1 text-[10px] font-medium text-text-muted">{nameOf(n.user_id)}</span>
                        <div className="flex items-center gap-1.5">
                          {eigene && (
                            <button
                              onClick={() => handleLoeschen(n.id)}
                              aria-label="Nachricht löschen"
                              className="flex-shrink-0 text-text-subtle opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                          )}
                          <div
                            className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
                              eigene
                                ? 'rounded-br-sm bg-gradient-to-br from-brand to-brand-2 text-white'
                                : 'rounded-bl-sm border border-border bg-surface-hover text-text'
                            }`}
                          >
                            {n.text}
                          </div>
                        </div>
                        <span className="mt-0.5 px-1 text-[11px] text-text-subtle">{formatUhrzeit(n.erstellt_am)}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <form onSubmit={handleSenden} className="mt-3 flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nachricht zu diesem Projekt…"
              className="field-input flex-1"
            />
            <button type="submit" disabled={senden || !text.trim()} className="btn-primary px-4">
              <Send className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </form>
        </>
      )}
    </div>
  )
}
