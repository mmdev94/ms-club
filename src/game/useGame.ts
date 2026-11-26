// Runs a table: the engine decides what happens, and this plays it back one
// event at a time (deal, bet, flop…) so the table can animate each step. Bots
// "think" for a moment before acting; the human acts through the controls.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { decide } from '../engine/bot'
import { rng, type Card } from '../engine/cards'
import { CHARACTERS, line, type Character, type Mood } from '../engine/characters'
import { shortName } from '../engine/hand'
import { act, legal, startHand, type Action, type ActKind, type Event, type Legal, type State } from '../engine/holdem'

export const START_STACK = 2000
export const BLINDS: [number, number] = [10, 20]

export interface Player {
  id: string
  name: string
  stack: number
  /** null = the human */
  character: Character | null
}

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

type ViewAction = { type: 'event'; e: Event; stacks?: number[] } | { type: 'say'; seat: number; text: string } | { type: 'mood'; seat: number; mood: Mood } | { type: 'land'; id: number } | { type: 'banner'; text: string | null }

const blankSeat = (stack: number): SeatView => ({ cards: [], faceUp: false, bet: 0, stack, folded: false, allIn: false, action: null, bubble: null, mood: 'calm', won: 0, hand: null })

let nextId = 1
function reduce(v: View, a: ViewAction): View {
  if (a.type === 'say') return { ...v, seats: v.seats.map((s, i) => (i === a.seat ? { ...s, bubble: { text: a.text, id: nextId++ } } : s)) }
  if (a.type === 'mood') return { ...v, seats: v.seats.map((s, i) => (i === a.seat ? { ...s, mood: a.mood } : s)) }
  if (a.type === 'land') return { ...v, flights: v.flights.filter((f) => f.id !== a.id) }
  if (a.type === 'banner') return { ...v, banner: a.text }
  const e = a.e
  const seats = v.seats.map((s) => ({ ...s }))
  switch (e.type) {
    case 'hand':
      return { hand: e.hand, dealer: e.dealer, seats: (a.stacks ?? []).map((st) => blankSeat(st)), board: [], pot: 0, flights: [], banner: null, over: false }
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
function delayFor(e: Event, fast: boolean): number {
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

const moodFor = (kind: ActKind, bluff: boolean): Mood | null => (kind === 'allin' ? 'smug' : kind === 'raise' || kind === 'bet' ? (bluff ? 'smug' : 'happy') : kind === 'fold' ? 'sad' : null)

export interface Game {
  view: View
  players: Player[]
  /** the human's options, when it's their turn and the table has caught up */
  myTurn: Legal | null
  /** the human's current hand name, e.g. "Pair of Kings" */
  myHand: string | null
  play: (a: Action) => void
  nextHand: () => void
  rebuy: () => void
  fast: boolean
  setFast: (f: boolean) => void
  /** which seat is thinking */
  thinking: number
  /** a chip flight finished its animation */
  land: (id: number) => void
}

export function useGame(name = 'You', seed?: string): Game {
  const random = useRef(rng(seed ?? `${Date.now()}`)).current
  const [players, setPlayers] = useState<Player[]>(() => [
    { id: 'you', name, stack: START_STACK, character: null },
    ...CHARACTERS.map((c) => ({ id: c.id, name: c.name, stack: START_STACK, character: c })),
  ])
  const [engine, setEngine] = useState<State | null>(null)
  const [cursor, setCursor] = useState(0)
  const [view, dispatch] = useReducer(reduce, { hand: 0, dealer: 0, seats: players.map((p) => blankSeat(p.stack)), board: [], pot: 0, flights: [], banner: null, over: false })
  const [fast, setFast] = useState(false)
  const [thinking, setThinking] = useState(-1)
  const handNo = useRef(0)
  const dealer = useRef(Math.floor(random() * 5))
  const bluffs = useRef(new Set<number>())

  const deal = useCallback(
    (ps: Player[]) => {
      handNo.current++
      dealer.current = (dealer.current + 1) % ps.length
      while (ps[dealer.current].stack <= 0) dealer.current = (dealer.current + 1) % ps.length
      bluffs.current.clear()
      const s = startHand(
        ps.map((p) => ({ id: p.id, name: p.name, stack: p.stack })),
        { hand: handNo.current, dealer: dealer.current, sb: BLINDS[0], bb: BLINDS[1], seed: `${seed ?? 'free'}:${handNo.current}:${random()}` },
      )
      setCursor(0)
      setEngine(s)
    },
    [random, seed],
  )

  // first hand
  useEffect(() => {
    const t = setTimeout(() => deal(players), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // play back events one by one
  useEffect(() => {
    if (!engine || cursor >= engine.events.length) return
    const e = engine.events[cursor]
    const t = setTimeout(() => {
      dispatch({ type: 'event', e, stacks: e.type === 'hand' ? players.map((p) => p.stack) : undefined })
      if (e.type === 'award') {
        const names = e.winners.map((w) => players[w.seat].name)
        const amount = e.winners.reduce((a, w) => a + w.amount, 0)
        const what = e.hand ? ` with ${e.hand}` : ''
        dispatch({ type: 'banner', text: e.hand === null && !e.side && engine.events.every((x) => x.type !== 'reveal') ? `${names[0]} takes ${amount.toLocaleString('en-US')}` : `${names.join(' & ')} ${names.length > 1 ? 'split' : 'wins'} ${amount.toLocaleString('en-US')}${what}` })
        for (const w of e.winners) {
          dispatch({ type: 'mood', seat: w.seat, mood: 'happy' })
          const c = players[w.seat].character
          if (c) {
            const said = line(c, bluffs.current.has(w.seat) && !e.hand ? 'bluffWin' : 'win', random)
            if (said) dispatch({ type: 'say', seat: w.seat, text: said })
          }
        }
        // losers at showdown look sad
        for (const x of engine.events) if (x.type === 'reveal' && !e.winners.some((w) => w.seat === x.seat)) {
          dispatch({ type: 'mood', seat: x.seat, mood: e.pot > 800 ? 'shocked' : 'sad' })
          const c = players[x.seat].character
          const said = c && random() < 0.6 ? line(c, 'lose', random) : null
          if (said) dispatch({ type: 'say', seat: x.seat, text: said })
        }
      }
      setCursor((c) => c + 1)
    }, delayFor(e, fast))
    return () => clearTimeout(t)
  }, [engine, cursor, fast, players, random])

  const caughtUp = !!engine && cursor >= engine.events.length

  // hand over: keep the new stacks, then deal again
  useEffect(() => {
    if (!caughtUp || !engine || engine.phase !== 'done') return
    const stacks = engine.seats.map((x) => x.stack)
    const next = players.map((p, i) => ({ ...p, stack: stacks[i] }))
    setPlayers(next)
    const t = setTimeout(() => {
      // bots that went broke buy back in
      const refilled = next.map((p) => (p.character && p.stack <= 0 ? { ...p, stack: START_STACK } : p))
      if (refilled[0].stack <= 0) return // the human decides (rebuy button)
      setPlayers(refilled)
      deal(refilled)
    }, fast ? 1600 : 3200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caughtUp, engine])

  // bots act
  useEffect(() => {
    if (!caughtUp || !engine || engine.phase === 'done' || engine.toAct === 0) return
    const seat = engine.toAct
    const c = players[seat].character!
    setThinking(seat)
    const t = setTimeout(
      () => {
        const d = decide(engine, c.style, random)
        const next = act(engine, d.action)
        const last = next.events.findLast((x) => x.type === 'act')
        if (last?.type === 'act') {
          if (d.bluff) bluffs.current.add(seat)
          const mood = moodFor(last.kind, d.bluff)
          if (mood) dispatch({ type: 'mood', seat, mood })
          const moment = last.kind === 'bet' ? 'raise' : last.kind
          if (random() < (last.kind === 'allin' ? 0.9 : last.kind === 'fold' ? 0.25 : 0.45)) {
            const said = line(c, moment, random)
            if (said) dispatch({ type: 'say', seat, text: said })
          }
        }
        setThinking(-1)
        setEngine(next)
      },
      (fast ? 250 : 650) + random() * (fast ? 300 : 900),
    )
    return () => clearTimeout(t)
  }, [caughtUp, engine, players, random, fast])

  const myTurn = caughtUp && engine && engine.phase !== 'done' && engine.toAct === 0 ? legal(engine) : null
  const mine = view.seats[0]
  const myHand = mine?.cards.length === 2 && view.board.length >= 3 && !mine.folded ? shortName([...mine.cards, ...view.board]) : null

  const play = useCallback(
    (a: Action) => {
      if (!engine || engine.toAct !== 0) return
      const next = act(engine, a)
      const last = next.events.findLast((x) => x.type === 'act')
      if (last?.type === 'act') {
        const mood = moodFor(last.kind, false)
        if (mood) dispatch({ type: 'mood', seat: 0, mood })
      }
      setEngine(next)
    },
    [engine],
  )

  const rebuy = useCallback(() => {
    const refilled = players.map((p) => (p.stack <= 0 ? { ...p, stack: START_STACK } : p))
    setPlayers(refilled)
    deal(refilled)
  }, [players, deal])

  const land = useCallback((id: number) => dispatch({ type: 'land', id }), [])
  return { view, players, myTurn, myHand, play, nextHand: () => engine && deal(players), rebuy, fast, setFast, thinking, land }
}
