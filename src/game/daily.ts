// The Daily Table: 20 hands against the four regulars, the same for everyone
// that day — same cards, same dealer button, and bots whose every random choice
// comes from the day's seed. So a whole session is decided by the player's moves
// alone, and anyone can replay those moves to check a score.
//
// The bots play at Normal: its maths uses only + − × ÷ and rounding, which give
// the same results in every browser (Hard uses exp/pow, which may differ in the
// last digit between browsers and would break replays).
import { think, type Level, type Memory } from '../engine/brain.ts'
import { rng } from '../engine/cards.ts'
import { CHARACTERS } from '../engine/characters.ts'
import { act, legal, startHand, type Action, type State } from '../engine/holdem.ts'

export const DAILY_HANDS = 20
export const DAILY_LEVEL: Level = 'normal'
export const DAILY_STACK = 2000
export const DAILY_BLINDS: [number, number] = [10, 20]

/** "2026-11-27" (UTC) */
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10)
export const dailySeed = (day: string, hand: number) => `msclub-daily:${day}:hand-${hand}`
export const botRandom = (day: string) => rng(`msclub-daily:${day}:bots`)

export interface Seat {
  id: string
  name: string
  stack: number
}

/** The first seat is the player; the regulars follow in a fixed order. */
export const dailySeats = (): Seat[] => [{ id: 'you', name: 'You', stack: DAILY_STACK }, ...CHARACTERS.map((c) => ({ id: c.id, name: c.name, stack: DAILY_STACK }))]

/** Bots that went broke buy back in before the next hand; the player doesn't. */
export const topUp = (seats: Seat[]) => seats.map((s, i) => (i > 0 && s.stack <= 0 ? { ...s, stack: DAILY_STACK } : s))

/** The button moves one seat left, skipping empty stacks. Start with prev = seats.length - 1 (so hand 1 has the button on seat 0). */
export function nextDealer(prev: number, seats: Seat[]): number {
  let d = (prev + 1) % seats.length
  while (seats[d].stack <= 0) d = (d + 1) % seats.length
  return d
}

export function dealDaily(day: string, hand: number, seats: Seat[], dealer: number): State {
  return startHand(seats, { hand, dealer, sb: DAILY_BLINDS[0], bb: DAILY_BLINDS[1], seed: dailySeed(day, hand) })
}

/** A bot's move at the Daily Table. */
export function dailyBotMove(s: State, random: () => number, memory: Memory): Action {
  const c = CHARACTERS[s.toAct - 1]
  return think(s, c, DAILY_LEVEL, random, memory, ['you', ...CHARACTERS.map((x) => x.id)]).action
}

// ── the player's moves as a short string: "c,k,r60,f" ──────────────────────

export const encode = (a: Action) => (a.type === 'fold' ? 'f' : a.type === 'check' ? 'k' : a.type === 'call' ? 'c' : `r${a.to}`)
export function decode(x: string): Action | null {
  if (x === 'f') return { type: 'fold' }
  if (x === 'k') return { type: 'check' }
  if (x === 'c') return { type: 'call' }
  const m = /^r(\d{1,7})$/.exec(x)
  return m ? { type: 'raise', to: Number(m[1]) } : null
}

/** Only moves the rules allow, exactly as given (no clamping). */
export function isLegal(s: State, a: Action): boolean {
  const l = legal(s)
  if (!l) return false
  if (a.type === 'fold') return !l.canCheck
  if (a.type === 'check') return l.canCheck
  if (a.type === 'call') return !l.canCheck
  return l.canRaise && a.to >= l.minTo && a.to <= l.maxTo
}

export interface Replay {
  ok: boolean
  /** why it failed */
  reason?: string
  /** the player's chips at the end */
  final: number
  hands: number
}

/** Replays a whole Daily Table from the player's moves. Used to check every score on the leaderboard. */
export function replay(day: string, moves: string): Replay {
  const list = moves ? moves.split(',') : []
  let k = 0
  const random = botRandom(day)
  const memory: Memory = new Map()
  let seats = dailySeats()
  let dealer = seats.length - 1
  let hands = 0
  for (let hand = 1; hand <= DAILY_HANDS; hand++) {
    seats = topUp(seats)
    if (seats[0].stack <= 0) break
    dealer = nextDealer(dealer, seats)
    let s = dealDaily(day, hand, seats, dealer)
    let guard = 0
    while (s.phase !== 'done' && guard++ < 300) {
      if (s.toAct === 0) {
        const a = decode(list[k++] ?? '')
        if (!a) return { ok: false, reason: `move ${k} is missing or unreadable`, final: 0, hands }
        if (!isLegal(s, a)) return { ok: false, reason: `move ${k} isn’t allowed at that point`, final: 0, hands }
        s = act(s, a)
      } else s = act(s, dailyBotMove(s, random, memory))
    }
    seats = s.seats.map((x) => ({ id: x.id, name: x.name, stack: x.stack }))
    hands = hand
  }
  if (k !== list.length) return { ok: false, reason: 'extra moves after the session ended', final: 0, hands }
  return { ok: true, final: seats[0].stack, hands }
}
