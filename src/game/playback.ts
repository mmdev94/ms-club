// Plays a hand back one event at a time (deal, bet, flop…) so the table can
// animate each step. Used by every kind of table: solo, host and guest.
import { useEffect, useReducer, useRef, useState } from 'react'
import type { Card } from '../engine/cards'
import type { CueKind, Mood } from '../engine/characters'
import type { ActKind, Event } from '../engine/holdem'

export interface SeatView {
  cards: Card[]
  faceUp: boolean
  bet: number
  stack: number
  folded: boolean
  allIn: boolean
  /** last thing they did this street */
  action: { kind: ActKind; amount: number } | null
  bubble: { text: string; id: number } | null
  mood: Mood
  /** a tell being shown right now */
  cue?: { kind: CueKind; id: number }
  /** 0–1, carried from hand to hand */
  tilt: number
  /** chips won this hand */
  won: number
  hand: string | null
}

export interface Flight {
  id: number
  from: { kind: 'seat' | 'bet' | 'pot'; seat?: number }
  to: { kind: 'seat' | 'pot'; seat?: number }
  amount: number
}

export interface View {
  hand: number
  dealer: number
  seats: SeatView[]
  board: Card[]
  pot: number
  flights: Flight[]
  /** big banner text, e.g. "Grandma wins 1,240 with a Full House" */
  banner: string | null
  over: boolean
}

export type ViewAction = { type: 'flair'; f: Flair } | { type: 'event'; e: Event; stacks?: number[] } | { type: 'say'; seat: number; text: string } | { type: 'mood'; seat: number; mood: Mood } | { type: 'land'; id: number } | { type: 'banner'; text: string | null }

export const blankSeat = (stack: number, tilt = 0): SeatView => ({ cards: [], faceUp: false, bet: 0, stack, folded: false, allIn: false, action: null, bubble: null, mood: 'calm', won: 0, hand: null, tilt })

let nextId = 1
export function reduce(v: View, a: ViewAction): View {
  if (a.type === 'flair') {
    const f = a.f
    return {
      ...v,
      seats: v.seats.map((s, i) =>
        i !== f.seat
          ? s
          : {
              ...s,
              mood: f.mood ?? s.mood,
              bubble: f.text ? { text: f.text, id: nextId++ } : s.bubble,
              cue: f.cue ? { kind: f.cue, id: nextId++ } : s.cue,
              tilt: f.tilt ?? s.tilt,
            },
      ),
    }
  }
  if (a.type === 'say') return { ...v, seats: v.seats.map((s, i) => (i === a.seat ? { ...s, bubble: { text: a.text, id: nextId++ } } : s)) }
  if (a.type === 'mood') return { ...v, seats: v.seats.map((s, i) => (i === a.seat ? { ...s, mood: a.mood } : s)) }
  if (a.type === 'land') return { ...v, flights: v.flights.filter((f) => f.id !== a.id) }
  if (a.type === 'banner') return { ...v, banner: a.text }
  const e = a.e
  const seats = v.seats.map((s) => ({ ...s }))
  switch (e.type) {
    case 'hand':
      return { hand: e.hand, dealer: e.dealer, seats: (a.stacks ?? []).map((st, i) => blankSeat(st, v.seats[i]?.tilt ?? 0)), board: [], pot: 0, flights: [], banner: null, over: false }
    case 'blind': {
      const s = seats[e.seat]
      s.bet += e.amount
      s.stack -= e.amount
      s.allIn = s.stack === 0
      return { ...v, seats }
    }
    case 'deal':
      seats[e.seat].cards = e.cards
      seats[e.seat].faceUp = e.seat === 0
      return { ...v, seats }
    case 'act': {
      const s = seats[e.seat]
      s.stack -= e.amount
      s.bet = e.to
      s.action = { kind: e.kind, amount: e.to }
      if (e.kind === 'fold') s.folded = true
      if (s.stack === 0 && e.kind !== 'fold' && e.kind !== 'check') s.allIn = true
      return { ...v, seats }
    }
    case 'collect': {
      const flights: Flight[] = seats.flatMap((s, i) => (s.bet > 0 ? [{ id: nextId++, from: { kind: 'bet' as const, seat: i }, to: { kind: 'pot' as const }, amount: s.bet }] : []))
      for (const s of seats) {
        s.bet = 0
        if (s.action?.kind !== 'fold' && s.action?.kind !== 'allin') s.action = null
      }
      return { ...v, seats, pot: e.pot, flights: [...v.flights, ...flights] }
    }
    case 'street':
      for (const s of seats) if (s.action?.kind !== 'fold' && s.action?.kind !== 'allin') s.action = null
      return { ...v, seats, board: [...v.board, ...e.cards] }
    case 'reveal':
      seats[e.seat].cards = e.cards
      seats[e.seat].faceUp = true
      seats[e.seat].hand = e.hand
      return { ...v, seats }
    case 'award': {
      const flights: Flight[] = e.winners.map((w) => ({ id: nextId++, from: { kind: 'pot' as const }, to: { kind: 'seat' as const, seat: w.seat }, amount: w.amount }))
      for (const w of e.winners) {
        seats[w.seat].stack += w.amount
        seats[w.seat].won += w.amount
      }
      return { ...v, seats, pot: Math.max(0, v.pot - e.pot), flights: [...v.flights, ...flights] }
    }
    case 'end':
      return { ...v, over: true }
  }
}

/** How long to wait before showing each kind of event (ms). */
export function delayFor(e: Event, fast: boolean): number {
  const k = fast ? 0.5 : 1
  switch (e.type) {
    case 'hand': return 400 * k
    case 'blind': return 260 * k
    case 'deal': return 170 * k
    case 'act': return 60
    case 'collect': return 450 * k
    case 'street': return 650 * k
    case 'reveal': return 750 * k
    case 'award': return 900 * k
    case 'end': return 600 * k
  }
}

export const moodFor = (kind: ActKind, bluff: boolean): Mood | null => (kind === 'allin' ? 'smug' : kind === 'raise' || kind === 'bet' ? (bluff ? 'smug' : 'happy') : kind === 'fold' ? 'sad' : null)

/** Something a character says or feels, sent alongside the events. */
export interface Flair {
  seat: number
  text?: string
  mood?: Mood
  /** a tell to play on the face */
  cue?: CueKind
  /** new tilt level */
  tilt?: number
}

/** "Grandma wins 1,240 with a full house, Kings full of Fours" */
export function bannerFor(e: Extract<Event, { type: 'award' }>, events: Event[], names: string[]): string {
  const who = e.winners.map((w) => names[w.seat] ?? 'Someone')
  const amount = e.winners.reduce((a, w) => a + w.amount, 0).toLocaleString('en-US')
  const you = who.length === 1 && who[0] === 'You'
  if (e.hand === null && !e.side && events.every((x) => x.type !== 'reveal')) return `${who[0]} ${you ? 'take' : 'takes'} ${amount}`
  return `${who.join(' & ')} ${who.length > 1 ? 'split' : you ? 'win' : 'wins'} ${amount}${e.hand ? ` with ${e.hand}` : ''}`
}

/**
 * Plays `events` (the current hand, growing as it goes) one by one.
 * A new `hand` number starts again from the first event.
 */
export function usePlayback(p: { hand: number; events: Event[]; startStacks: number[]; names: string[]; fast: boolean; onEvent?: (e: Event) => void }) {
  const [view, dispatch] = useReducer(reduce, undefined, (): View => ({ hand: 0, dealer: 0, seats: p.startStacks.map(blankSeat), board: [], pot: 0, flights: [], banner: null, over: false }))
  const [pos, setPos] = useState({ hand: p.hand, cursor: 0 })
  const cursor = pos.hand === p.hand ? pos.cursor : 0
  const latest = useRef(p)
  latest.current = p
  useEffect(() => {
    const { events, fast } = latest.current
    if (cursor >= events.length) return
    const e = events[cursor]
    const t = setTimeout(() => {
      const cur = latest.current
      dispatch({ type: 'event', e, stacks: e.type === 'hand' ? cur.startStacks : undefined })
      if (e.type === 'award') dispatch({ type: 'banner', text: bannerFor(e, cur.events, cur.names) })
      cur.onEvent?.(e)
      setPos({ hand: cur.hand, cursor: cursor + 1 })
    }, delayFor(e, fast))
    return () => clearTimeout(t)
  }, [p.hand, cursor, p.events.length, p.fast])
  return { view, dispatch, caughtUp: p.events.length > 0 && cursor >= p.events.length }
}
