// Runs a table: the engine decides what happens, the playback animates it.
// Seats are you, a bot, or (when you host an online table) a friend whose
// moves arrive over the network. Bots "think" for a moment before acting.
import { useCallback, useEffect, useRef, useState } from 'react'
import { learn, nextTilt, think, type Level, type Memory } from '../engine/brain'
import { rng, type Card } from '../engine/cards'
import { CHARACTERS, line, type Character, type CueKind } from '../engine/characters'
import { shortName } from '../engine/hand'
import { act, legal, startHand, type Action, type Legal, type State } from '../engine/holdem'
import { moodFor, usePlayback, type Flair, type View } from './playback'
import { maskFor } from '../net/room'
import type { ReplayData } from './replay'
import { botRandom, DAILY_HANDS, dailySeed, encode } from './daily'

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
  /** their own picture or GIF (data URL) */
  image?: string
  /** a friend who disconnected: their turns are skipped */
  away?: boolean
}

/** What a regular was thinking when it acted (for Mind-read). */
export interface Thought {
  hand: number
  seat: number
  street: State['phase']
  kind: string
  to: number
  equity: number
  why: string
}

/** How often a tell shows when it's true, and how often it shows when it isn't, by level. */
const TELL_RATE: Record<Level, { honest: number; fake: number }> = {
  easy: { honest: 1.15, fake: 0.03 },
  normal: { honest: 1, fake: 0.08 },
  hard: { honest: 0.65, fake: 0.16 },
}

/** Does this move trigger the character's tell? (cosmetic: uses Math.random, never the game's seed) */
export function tellFor(c: Character, level: Level, kind: string, equity: number, bluff: boolean): CueKind | null {
  const t = c.tell
  const aggressive = kind === 'bet' || kind === 'raise' || kind === 'allin'
  const truth =
    t.when === 'bluff' ? aggressive && (bluff || equity < 0.35) : t.when === 'strong' ? (aggressive || kind === 'call') && equity > 0.68 : (kind === 'call' || kind === 'check') && equity < 0.4
  const r = TELL_RATE[level]
  if (truth) return Math.random() < Math.min(0.97, t.honest * r.honest) ? t.cue : null
  return kind !== 'fold' && Math.random() < r.fake ? t.cue : null
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
  /** what the regulars thought this hand (solo and host tables) */
  thoughts?: Thought[]
  /** the hand as the engine sees it (solo and host tables), for Mind-read and replays */
  engine?: State | null
  /** how good the regulars are at this table */
  level?: Level
  /** keep the next hand from being dealt (while looking back at this one) */
  hold?: (on: boolean) => void
  /** the finished hand, packed for a replay link (null while it's still going) */
  shareable?: () => ReplayData | null
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

export interface DailyState {
  day: string
  /** hands finished */
  played: number
  over: boolean
  /** the player's moves, encoded ("c,k,r60,…") */
  moves: string
  final: number
}

/** The move as the rules will actually treat it (a fold when you could check is a check, and so on). */
export function normalize(s: State, a: Action): Action {
  const l = legal(s)!
  if (a.type === 'fold') return l.canCheck ? { type: 'check' } : a
  if (a.type === 'check') return l.canCheck ? a : { type: 'fold' }
  if (a.type === 'call') return l.canCheck ? { type: 'check' } : a
  if (!l.canRaise) return { type: l.canCheck ? 'check' : 'call' }
  return { type: 'raise', to: Math.max(l.minTo, Math.min(l.maxTo, Math.floor(a.to))) }
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
  /** the player's own picture */
  image?: string
  /** produce the deck for a hand before it's dealt (the fair shuffle at friends' tables) */
  prepare?: (hand: number, players: Player[]) => Promise<Card[]>
  /** play today's Daily Table ("2026-11-27"): fixed cards, seeded bots, 20 hands, moves recorded */
  daily?: string
}): Table & { daily: DailyState | null } {
  const random = useRef(rng(o.seed ?? `${Date.now()}:${Math.random()}`)).current
  const [players, setPlayers] = useState<Player[]>(() => o.seats ?? [{ id: 'you', name: o.name, stack: START_STACK, character: null, kind: 'me', look: o.look, image: o.image }, ...botSeats()])
  const [engine, setEngine] = useState<State | null>(null)
  const [started, setStarted] = useState(o.autoStart ?? true)
  const [fast, setFast] = useState(false)
  const [thinking, setThinking] = useState(-1)
  const [deadline, setDeadline] = useState<number | null>(null)
  const startStacks = useRef<number[]>(players.map((p) => p.stack))
  const handNo = useRef(0)
  const dealer = useRef(o.daily ? 4 : Math.floor(random() * 5))
  const botRand = useRef(o.daily ? botRandom(o.daily) : random).current
  const moves = useRef<string[]>([])
  const [dailyOver, setDailyOver] = useState(false)
  const bluffs = useRef(new Set<number>())
  const memory = useRef<Memory>(new Map())
  const tilts = useRef(new Map<string, number>())
  const [ready, setReady] = useState<Player[] | null>(null)
  const [held, setHeld] = useState(false)
  const [thoughts, setThoughts] = useState<Thought[]>([])
  const pending = useRef(new Map<number, Player | ((old: Player) => Player)>())
  const hooks = useRef(o.hooks)
  hooks.current = o.hooks
  const prepare = useRef(o.prepare)
  prepare.current = o.prepare

  const pb = usePlayback({ hand: engine?.hand ?? 0, events: engine?.events ?? [], startStacks: startStacks.current, names: players.map((p) => p.name), fast, onEvent: (e) => e.type === 'award' && awardFlair(e) })
  const { view, dispatch, caughtUp } = pb

  const flair = useCallback(
    (f: Flair) => {
      dispatch({ type: 'flair', f })
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
          { hand, dealer: dealer.current, sb: BLINDS[0], bb: BLINDS[1], deck, seed: o.daily ? dailySeed(o.daily, hand) : `${o.seed ?? 'free'}:${hand}:${random()}` },
        )
        setPlayers(ps)
        setThoughts([])
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
    // tilt: a big loss sets a regular off, a big win calms them down
    players.forEach((p, i) => {
      if (p.kind !== 'bot') return
      const before = tilts.current.get(p.id) ?? 0
      const after = nextTilt(before, startStacks.current[i], engine.seats[i].stack)
      tilts.current.set(p.id, after)
      if (Math.abs(after - before) < 0.02) return
      const blowUp = before < 0.5 && after >= 0.5
      flair({ seat: i, tilt: after, mood: blowUp ? 'angry' : undefined, text: blowUp && p.character ? (line(p.character, 'tilt', random) ?? undefined) : undefined })
    })
    const next = players.map((p, i) => ({ ...p, stack: engine.seats[i].stack }))
    setPlayers(next)
    if (o.daily && (engine.hand >= DAILY_HANDS || next[0].stack <= 0)) {
      setDailyOver(true)
      return
    }
    if (next.findIndex((p) => p.kind === 'me') >= 0 && next.find((p) => p.kind === 'me')!.stack <= 0) return // you decide (rebuy)
    setReady(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caughtUp, engine])

  // deal the next hand after a pause — unless someone is looking at the last one (Mind-read)
  useEffect(() => {
    if (!ready || held) return
    const t = setTimeout(() => {
      setReady(null)
      deal(ready)
    }, fast ? 1600 : 3400)
    return () => clearTimeout(t)
  }, [ready, held, fast, deal])

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
        const level = o.daily ? 'normal' : o.level
        const d = think(engine, c, level, botRand, memory.current, players.map((x) => x.id), tilts.current.get(p.id) ?? 0)
        const next = act(engine, d.action)
        const last = next.events.findLast((x) => x.type === 'act')
        if (last?.type === 'act') {
          if (d.bluff) bluffs.current.add(seat)
          const moment = last.kind === 'bet' ? 'raise' : last.kind
          const said = random() < (last.kind === 'allin' ? 0.9 : last.kind === 'fold' ? 0.25 : 0.45) ? line(c, moment, random) : null
          const mood = moodFor(last.kind, d.bluff)
          const cue = tellFor(c, level, last.kind, d.equity, d.bluff)
          if (mood || said || cue) flair({ seat, mood: mood ?? undefined, text: said ?? undefined, cue: cue ?? undefined })
          setThoughts((t) => [...t, { hand: engine.hand, seat, street: engine.phase, kind: last.kind, to: last.to, equity: d.equity, why: d.why ?? '' }])
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

  const play = useCallback(
    (a: Action) => {
      if (!engine || engine.toAct !== meSeat || engine.phase === 'done') return
      const n = normalize(engine, a)
      if (o.daily) moves.current.push(encode(n))
      apply(meSeat, n)
    },
    [apply, meSeat, engine, o.daily],
  )
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
  const daily: DailyState | null = o.daily
    ? { day: o.daily, played: engine?.phase === 'done' ? engine.hand : Math.max(0, (engine?.hand ?? 1) - 1), over: dailyOver, moves: moves.current.join(','), final: players[0].stack }
    : null
  const shareable = (): ReplayData | null => {
    if (!engine || engine.phase !== 'done') return null
    return { v: 1, names: players.map((p) => p.name), chars: players.map((p) => p.character?.id ?? null), stacks: startStacks.current, events: maskFor(engine.events, meSeat), by: players[meSeat]?.name }
  }
  return { shareable, hold: setHeld, level: o.daily ? 'normal' : o.level, thoughts, view, players, myTurn, myHand, play, rebuy, canRebuy: !o.daily, fast, setFast, thinking, deadline, land, engine, started, start, applyRemote, setSeat, patchSeat, daily }
}
