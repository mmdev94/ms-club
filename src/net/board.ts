// The leaderboard, with no database. A score is a small message signed by the
// player's browser (a Nostr event, kind 30078 "app data") and posted to several
// public relays. Reading the board fetches today's messages from the relays;
// each one carries the player's moves, and every visitor's browser replays them
// before showing the score — so a made-up score never appears.
import { finalizeEvent, generateSecretKey, getPublicKey, SimplePool, verifyEvent, type Event as NostrEvent } from 'nostr-tools'
import { RELAYS } from './room'

const KIND = 30078
const tagFor = (day: string) => `msclub-daily-${day}`

export interface Entry {
  pubkey: string
  name: string
  day: string
  moves: string
  /** what the player claims; the replay decides */
  final: number
  at: number
}

// one key per browser, kept on this device
function key(): Uint8Array {
  try {
    const saved = localStorage.getItem('msclub-key')
    if (saved && /^[0-9a-f]{64}$/.test(saved)) return Uint8Array.from(saved.match(/../g)!.map((h) => parseInt(h, 16)))
    const k = generateSecretKey()
    localStorage.setItem('msclub-key', [...k].map((b) => b.toString(16).padStart(2, '0')).join(''))
    return k
  } catch {
    return generateSecretKey()
  }
}
export const myPubkey = () => getPublicKey(key())

let pool: SimplePool | null = null
const getPool = () => (pool ??= new SimplePool())

/** Posts a score. Resolves with how many relays accepted it. */
export async function post(e: { name: string; day: string; moves: string; final: number }): Promise<number> {
  const ev = finalizeEvent(
    {
      kind: KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', `msclub-daily:${e.day}`],
        ['t', tagFor(e.day)],
      ],
      content: JSON.stringify({ v: 1, name: e.name.slice(0, 16), day: e.day, moves: e.moves, final: e.final }),
    },
    key(),
  )
  const results = await Promise.allSettled(getPool().publish(RELAYS, ev))
  return results.filter((r) => r.status === 'fulfilled').length
}

if (import.meta.env.DEV) (globalThis as unknown as { __msclubBoard: unknown }).__msclubBoard = { post: (e: Parameters<typeof post>[0]) => post(e), fetchDay: (d: string) => fetchDay(d) }

/** Everyone's score for a day: newest per player, with valid signatures, unchecked. */
export async function fetchDay(day: string): Promise<Entry[]> {
  const events: NostrEvent[] = await getPool().querySync(RELAYS, { kinds: [KIND], '#t': [tagFor(day)], limit: 500 }, { maxWait: 6000 })
  const best = new Map<string, NostrEvent>()
  for (const ev of events) {
    if (!verifyEvent(ev)) continue
    const prev = best.get(ev.pubkey)
    if (!prev || ev.created_at > prev.created_at) best.set(ev.pubkey, ev)
  }
  const out: Entry[] = []
  for (const ev of best.values()) {
    try {
      const c = JSON.parse(ev.content) as { name?: unknown; day?: unknown; moves?: unknown; final?: unknown }
      if (c.day !== day || typeof c.moves !== 'string' || c.moves.length > 4000 || typeof c.final !== 'number') continue
      out.push({ pubkey: ev.pubkey, name: String(c.name ?? 'Player').slice(0, 16), day, moves: c.moves, final: c.final, at: ev.created_at })
    } catch {
      /* not ours */
    }
  }
  return out
}
