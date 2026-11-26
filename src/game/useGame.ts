// Runs a table: the engine decides what happens, the playback animates it.
// Seats are you, a bot, or (when you host an online table) a friend whose
// moves arrive over the network. Bots "think" for a moment before acting.
import { useCallback, useEffect, useRef, useState } from 'react'
import { learn, think, type Level, type Memory } from '../engine/brain'
import { rng, type Card } from '../engine/cards'
import { CHARACTERS, line, type Character } from '../engine/characters'
import { shortName } from '../engine/hand'
import { act, legal, startHand, type Action, type Legal, type State } from '../engine/holdem'
import { moodFor, usePlayback, type Flair, type View } from './playback'

export type { Flair, View } from './playback'
export type { SeatView, Flight } from './playback'

export const START_STACK = 2000
export const BLINDS: [number, number] = [10, 20]
/** seconds a friend has to act before the table checks or folds for them */
export const TURN_SECONDS = 30

export type SeatKind = 'me' | 'bot' | 'remote'
export type Look = Character['look']

export interface Player {
  id: string
  name: string
  stack: number
  /** set for bots */
  character: Character | null
  kind: SeatKind
  /** face for humans */
  look?: Look
  /** a friend who disconnected: their turns are skipped */
  away?: boolean
}

export interface Game {
  view: View
  players: Player[]
  /** your options, when it's your turn and the table has caught up */
  myTurn: Legal | null
  /** your current hand, e.g. "Pair of Kings" */
  myHand: string | null
  play: (a: Action) => void
  rebuy: () => void
  /** false for guests: the host tops them up */
  canRebuy: boolean
  fast: boolean
  setFast: (f: boolean) => void
  /** which seat is thinking (bots) or due to act (friends), -1 if none */
  thinking: number
  /** when the seat that's thinking must act by (friends only), ms since epoch */
  deadline: number | null
  land: (id: number) => void
}

export interface HostHooks {
  /** after every change: the engine (null before the first hand), seats, stacks at the start of the hand, and the turn deadline */
  onChange?: (engine: State | null, players: Player[], startStacks: number[], deadline: number | null) => void
  onFlair?: (f: Flair) => void
}

export interface Table extends Game {
  engine: State | null
  started: boolean
  start: () => void
  /** a friend's move (validated: must be their turn, this hand) */
  applyRemote: (seat: number, hand: number, a: Action) => void
  /** replace a seat from the next hand on (a friend joining, or a bot taking over) */
  setSeat: (seat: number, p: Player | ((old: Player) => Player)) => void
  /** change a seat now, without dealing (e.g. marking someone away) */
  patchSeat: (seat: number, patch: Partial<Player>) => void
}

export const botSeats = (n = 4): Player[] => CHARACTERS.slice(0, n).map((c) => ({ id: c.id, name: c.name, stack: START_STACK, character: c, kind: 'bot' }))

export function useGame(o: {
  name: string
  level: Level
  seed?: string
  seats?: Player[]
  hooks?: HostHooks
  autoStart?: boolean
  look?: Look
  /** produce the deck for a hand before it's dealt (the fair shuffle at friends' tables) */
  prepare?: (hand: number, players: Player[]) => Promise<Card[]>
}): Table {
  const random = useRef(rng(o.seed ?? `${Date.now()}:${Math.random()}`)).current
  const [players, setPlayers] = useState<Player[]>(() => o.seats ?? [{ id: 'you', name: o.name, stack: START_STACK, character: null, kind: 'me', look: o.look }, ...botSeats()])
  const [engine, setEngine] = useState<State | null>(null)
  const [started, setStarted] = useState(o.autoStart ?? true)
  const [fast, setFast] = useState(false)
  const [thinking, setThinking] = useState(-1)
  const [deadline, setDeadline] = useState<number | null>(null)
  const startStacks = useRef<number[]>(players.map((p) => p.stack))
  const handNo = useRef(0)
  const dealer = useRef(Math.floor(random() * 5))
  const bluffs = useRef(new Set<number>())
  const memory = useRef<Memory>(new Map())
  const pending = useRef(new Map<number, Player | ((old: Player) => Player)>())
  const hooks = useRef(o.hooks)
  hooks.current = o.hooks
  const prepare = useRef(o.prepare)
  prepare.current = o.prepare

  const pb = usePlayback({ hand: engine?.hand ?? 0, events: engine?.events ?? [], startStacks: startStacks.current, names: players.map((p) => p.name), fast, onEvent: (e) => e.type === 'award' && awardFlair(e) })
  const { view, dispatch, caughtUp } = pb

  const flair = useCallback(
    (f: Flair) => {
      if (f.mood) dispatch({ type: 'mood', seat: f.seat, mood: f.mood })
      if (f.text) dispatch({ type: 'say', seat: f.seat, text: f.text })
      hooks.current?.onFlair?.(f)
    },
    [dispatch],
  )

  function awardFlair(e: Extract<State['events'][number], { type: 'award' }>) {
    if (!engine) return
    for (const w of e.winners) {
      const c = players[w.seat].character
      const said = c ? line(c, bluffs.current.has(w.seat) && !e.hand ? 'bluffWin' : 'win', random) : null
      flair({ seat: w.seat, mood: 'happy', text: said ?? undefined })
    }
    for (const x of engine.events)
      if (x.type === 'reveal' && !e.winners.some((w) => w.seat === x.seat)) {
        const c = players[x.seat].character
        const said = c && random() < 0.6 ? line(c, 'lose', random) : null
        flair({ seat: x.seat, mood: e.pot > 800 ? 'shocked' : 'sad', text: said ?? undefined })
      }
  }

  const deal = useCallback(
    (base: Player[]) => {
      let ps = base.map((p, i) => {
        const change = pending.current.get(i)
        return change ? (typeof change === 'function' ? change(p) : change) : p
      })
      pending.current.clear()
      // bots and friends who went broke are topped up; you choose (rebuy)
      ps = ps.map((p) => (p.kind !== 'me' && p.stack <= 0 ? { ...p, stack: START_STACK } : p))
      if (ps.filter((p) => p.stack > 0).length < 2) return
      const hand = handNo.current + 1
      const go = (deck?: Card[]) => {
        handNo.current = hand
        dealer.current = (dealer.current + 1) % ps.length
        while (ps[dealer.current].stack <= 0) dealer.current = (dealer.current + 1) % ps.length
        bluffs.current.clear()
        startStacks.current = ps.map((p) => p.stack)
        const s = startHand(
          ps.map((p) => ({ id: p.id, name: p.name, stack: p.stack })),
          { hand, dealer: dealer.current, sb: BLINDS[0], bb: BLINDS[1], deck, seed: `${o.seed ?? 'free'}:${hand}:${random()}` },
        )
        setPlayers(ps)
        setEngine(s)
      }
      if (prepare.current) prepare.current(hand, ps).then(go, () => go())
      else go()
    },
    [random, o.seed],
  )

  const start = useCallback(() => setStarted(true), [])
  useEffect(() => {
    if (!started || engine) return
    const t = setTimeout(() => deal(players), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started])

  // hand over: keep the new stacks, then deal again
  useEffect(() => {
    if (!caughtUp || !engine || engine.phase !== 'done') return
    learn(memory.current, players.map((p) => p.id), engine.events)
    const next = players.map((p, i) => ({ ...p, stack: engine.seats[i].stack }))
    setPlayers(next)
    const t = setTimeout(() => {
      if (next.findIndex((p) => p.kind === 'me') >= 0 && next.find((p) => p.kind === 'me')!.stack <= 0) return // you decide (rebuy)
      deal(next)
    }, fast ? 1600 : 3400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caughtUp, engine])

  // bots act; friends get a deadline
  useEffect(() => {
    if (!caughtUp || !engine || engine.phase === 'done') return
    const seat = engine.toAct
    const p = players[seat]
    if (p.kind === 'me') return
    setThinking(seat)
    if (p.kind === 'remote') {
      const ms = p.away ? 1500 : TURN_SECONDS * 1000
      const due = Date.now() + ms
      setDeadline(due)
      const t = setTimeout(() => {
        const l = legal(engine)!
        setThinking(-1)
        setDeadline(null)
        setEngine(act(engine, { type: l.canCheck ? 'check' : 'fold' }))
      }, ms)
      return () => clearTimeout(t)
    }
    const c = p.character!
    const t = setTimeout(
      () => {
        const d = think(engine, c, o.level, random, memory.current, players.map((x) => x.id))
        const next = act(engine, d.action)
        const last = next.events.findLast((x) => x.type === 'act')
        if (last?.type === 'act') {
          if (d.bluff) bluffs.current.add(seat)
          const moment = last.kind === 'bet' ? 'raise' : last.kind
          const said = random() < (last.kind === 'allin' ? 0.9 : last.kind === 'fold' ? 0.25 : 0.45) ? line(c, moment, random) : null
          const mood = moodFor(last.kind, d.bluff)
          if (mood || said) flair({ seat, mood: mood ?? undefined, text: said ?? undefined })
        }
        setThinking(-1)
        setEngine(next)
      },
      (fast ? 250 : 650) + random() * (fast ? 300 : 900),
    )
    return () => clearTimeout(t)
  }, [caughtUp, engine, players, random, fast, o.level, flair])

  // tell the host layer about every change
  useEffect(() => {
    hooks.current?.onChange?.(engine, players, startStacks.current, deadline)
  }, [engine, players, deadline])

  const meSeat = players.findIndex((p) => p.kind === 'me')
  const myTurn = caughtUp && engine && engine.phase !== 'done' && engine.toAct === meSeat ? legal(engine) : null
  const mine = view.seats[meSeat]
  const myHand = mine?.cards.length === 2 && mine.cards[0] && view.board.length >= 3 && !mine.folded ? shortName([...mine.cards, ...view.board]) : null

  const apply = useCallback(
    (seat: number, a: Action) => {
      if (!engine || engine.toAct !== seat || engine.phase === 'done') return
      const next = act(engine, a)
      const last = next.events.findLast((x) => x.type === 'act')
      if (last?.type === 'act') {
        const mood = moodFor(last.kind, false)
        if (mood) flair({ seat, mood })
      }
      setThinking(-1)
      setDeadline(null)
      setEngine(next)
    },
    [engine, flair],
  )

  const play = useCallback((a: Action) => apply(meSeat, a), [apply, meSeat])
  const applyRemote = useCallback(
    (seat: number, hand: number, a: Action) => {
      if (!engine || engine.hand !== hand || players[seat]?.kind !== 'remote') return
      apply(seat, a)
    },
    [apply, engine, players],
  )

  const rebuy = useCallback(() => {
    const refilled = players.map((p) => (p.stack <= 0 ? { ...p, stack: START_STACK } : p))
    deal(refilled)
  }, [players, deal])

  const setSeat = useCallback(
    (seat: number, p: Player | ((old: Player) => Player)) => {
      if (!engine) {
        setPlayers((ps) => ps.map((x, i) => (i === seat ? (typeof p === 'function' ? p(x) : p) : x)))
        return
      }
      pending.current.set(seat, p)
    },
    [engine],
  )
  const patchSeat = useCallback((seat: number, patch: Partial<Player>) => setPlayers((ps) => ps.map((x, i) => (i === seat ? { ...x, ...patch } : x))), [])

  const land = useCallback((id: number) => dispatch({ type: 'land', id }), [dispatch])
  return { view, players, myTurn, myHand, play, rebuy, canRebuy: true, fast, setFast, thinking, deadline, land, engine, started, start, applyRemote, setSeat, patchSeat }
}
