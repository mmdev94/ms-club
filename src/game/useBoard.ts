// Loads a day's (or a week's) scores and replays each one in a background
// worker. Only scores whose replay ends with the claimed chips are ranked.
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchDay, type Entry } from '../net/board'
import { DAILY_STACK } from './daily'

export interface Row extends Entry {
  status: 'checking' | 'ok' | 'bad'
  /** chips won or lost (final − start), from the replay */
  score: number
  reason?: string
}

type Result = { id: string; ok: boolean; final: number; reason?: string }

let worker: Worker | null = null
const waiting = new Map<string, (r: Result) => void>()
const cache = new Map<string, Result>()
function check(e: Entry): Promise<Result> {
  const id = `${e.day}:${e.pubkey}:${e.at}`
  const hit = cache.get(id)
  if (hit) return Promise.resolve(hit)
  if (!worker) {
    worker = new Worker(new URL('../workers/verify.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (m: MessageEvent<Result>) => {
      cache.set(m.data.id, m.data)
      waiting.get(m.data.id)?.(m.data)
      waiting.delete(m.data.id)
    }
  }
  return new Promise((resolve) => {
    waiting.set(id, resolve)
    worker!.postMessage({ id, day: e.day, moves: e.moves })
  })
}

export function useBoard(days: string[]) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const gen = useRef(0)

  const load = useCallback(async () => {
    const my = ++gen.current
    setLoading(true)
    setError('')
    try {
      const all = (await Promise.all(days.map((d) => fetchDay(d)))).flat()
      if (my !== gen.current) return
      setRows(all.map((e) => ({ ...e, status: 'checking', score: e.final - DAILY_STACK })))
      for (const e of all) {
        const r = await check(e)
        if (my !== gen.current) return
        setRows((rs) =>
          (rs ?? []).map((x) =>
            x.pubkey === e.pubkey && x.day === e.day && x.at === e.at
              ? { ...x, status: r.ok && r.final === e.final ? 'ok' : 'bad', score: r.final - DAILY_STACK, reason: r.ok ? (r.final === e.final ? undefined : 'the replay ends with different chips') : r.reason }
              : x,
          ),
        )
      }
    } catch (e) {
      if (my === gen.current) setError((e as Error).message)
    } finally {
      if (my === gen.current) setLoading(false)
    }
  }, [days.join()])

  useEffect(() => {
    load()
  }, [load])

  return { rows, error, loading, reload: load }
}

/** Ranked rows: checked scores only, one line per player (summed over the days given). */
export function rank(rows: Row[]): { pubkey: string; name: string; score: number; days: number }[] {
  const by = new Map<string, { pubkey: string; name: string; score: number; days: number; at: number }>()
  for (const r of rows) {
    if (r.status !== 'ok') continue
    const p = by.get(r.pubkey) ?? { pubkey: r.pubkey, name: r.name, score: 0, days: 0, at: 0 }
    p.score += r.score
    p.days++
    if (r.at > p.at) {
      p.at = r.at
      p.name = r.name
    }
    by.set(r.pubkey, p)
  }
  return [...by.values()].sort((a, b) => b.score - a.score)
}
