// No-limit Texas Hold'em, one hand at a time, as a pure state machine:
// startHand() → act() → act() … until street === 'done'. Every step appends
// events (deal, bet, flop, win…) that the table plays back as animations.
// Same seed + same actions = same hand, every time, in every browser.
import { fullDeck, rng, shuffle, type Card } from './cards.ts'
import { describe, score, shortName } from './hand.ts'

export type Street = 'preflop' | 'flop' | 'turn' | 'river'
export type Phase = Street | 'done'

export interface Seat {
  id: string
  name: string
  stack: number
  /** chips in front of the player this street */
  bet: number
  /** chips put in this hand, all streets */
  total: number
  cards: Card[]
  folded: boolean
  allIn: boolean
  /** not in this hand (no chips) */
  out: boolean
  /** has acted since the last full raise */
  acted: boolean
  /** false after a short all-in raise when this player had already acted: may only call or fold */
  canRaise: boolean
}

export type Action = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise'; to: number }

export type ActKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'
export type Event =
  | { type: 'hand'; hand: number; dealer: number }
  | { type: 'blind'; seat: number; amount: number; kind: 'small' | 'big' }
  | { type: 'deal'; seat: number; cards: Card[] }
  | { type: 'act'; seat: number; kind: ActKind; amount: number; to: number }
  | { type: 'collect'; pot: number }
  | { type: 'street'; street: Street; cards: Card[] }
  | { type: 'reveal'; seat: number; cards: Card[]; hand: string }
  | { type: 'award'; winners: { seat: number; amount: number }[]; hand: string | null; pot: number; side: boolean }
  | { type: 'end' }

export interface State {
  hand: number
  seats: Seat[]
  dealer: number
  sb: number
  bb: number
  deck: Card[]
  board: Card[]
  phase: Phase
  /** whose turn, or -1 */
  toAct: number
  currentBet: number
  /** size of the last full raise: the next raise must be at least this much more */
  minRaise: number
  /** chips collected from earlier streets */
  pot: number
  events: Event[]
}

export interface Legal {
  seat: number
  toCall: number
  canCheck: boolean
  canRaise: boolean
  /** raise-to limits (total bet this street) */
  minTo: number
  maxTo: number
}

const inHand = (s: Seat) => !s.out && !s.folded
const canAct = (s: Seat) => inHand(s) && !s.allIn

function nextIndex(seats: Seat[], from: number, ok: (s: Seat) => boolean): number {
  for (let k = 1; k <= seats.length; k++) {
    const i = (from + k) % seats.length
    if (ok(seats[i])) return i
  }
  return -1
}

export interface StartOptions {
  hand: number
  dealer: number
  sb: number
  bb: number
  /** shuffle seed; ignored when `deck` is given */
  seed?: string
  /** a fixed deck, top card first (for tests and replays) */
  deck?: Card[]
}

export function startHand(players: { id: string; name: string; stack: number }[], o: StartOptions): State {
  const seats: Seat[] = players.map((p) => ({ ...p, bet: 0, total: 0, cards: [], folded: false, allIn: false, out: p.stack <= 0, acted: false, canRaise: true }))
  const playing = seats.filter((s) => !s.out).length
  if (playing < 2) throw new Error('A hand needs at least two players with chips')
  const dealer = seats[o.dealer]?.out === false ? o.dealer : nextIndex(seats, o.dealer, (s) => !s.out)
  const s: State = {
    hand: o.hand,
    seats,
    dealer,
    sb: o.sb,
    bb: o.bb,
    deck: o.deck ? [...o.deck] : shuffle(fullDeck(), rng(o.seed ?? `${Date.now()}:${Math.random()}`)),
    board: [],
    phase: 'preflop',
    toAct: -1,
    currentBet: 0,
    minRaise: o.bb,
    pot: 0,
    events: [{ type: 'hand', hand: o.hand, dealer }],
  }
  const headsUp = playing === 2
  const sbSeat = headsUp ? dealer : nextIndex(seats, dealer, (x) => !x.out)
  const bbSeat = nextIndex(seats, sbSeat, (x) => !x.out)
  post(s, sbSeat, o.sb, 'small')
  post(s, bbSeat, o.bb, 'big')
  s.currentBet = Math.max(...seats.map((x) => x.bet))

  // two cards each, one at a time, starting left of the dealer
  const order: number[] = []
  for (let i = nextIndex(seats, dealer, (x) => !x.out), n = 0; n < playing; n++, i = nextIndex(seats, i, (x) => !x.out)) order.push(i)
  for (let round = 0; round < 2; round++) for (const i of order) seats[i].cards.push(s.deck.shift()!)
  for (const i of order) s.events.push({ type: 'deal', seat: i, cards: seats[i].cards })

  s.toAct = nextIndex(seats, bbSeat, canAct)
  if (s.toAct === -1 || !needsAction(s)) return finishStreet(s)
  // with everyone else all-in from the blinds, the big blind may have nothing to do
  if (!needsToAct(s, s.toAct)) {
    const j = findNext(s, s.toAct)
    if (j === -1) return finishStreet(s)
    s.toAct = j
  }
  return s
}

function post(s: State, i: number, blind: number, kind: 'small' | 'big') {
  const p = s.seats[i]
  const amount = Math.min(blind, p.stack)
  p.stack -= amount
  p.bet += amount
  p.total += amount
  if (p.stack === 0) p.allIn = true
  s.events.push({ type: 'blind', seat: i, amount, kind })
}

export function legal(s: State): Legal | null {
  if (s.phase === 'done' || s.toAct < 0) return null
  const p = s.seats[s.toAct]
  const toCall = Math.min(s.currentBet - p.bet, p.stack)
  const maxTo = p.bet + p.stack
  const canRaise = p.canRaise && maxTo > s.currentBet && s.seats.some((x, i) => i !== s.toAct && canAct(x))
  return {
    seat: s.toAct,
    toCall,
    canCheck: s.currentBet - p.bet <= 0,
    canRaise,
    minTo: Math.min(maxTo, s.currentBet + s.minRaise),
    maxTo,
  }
}

const clone = (s: State): State => ({ ...s, seats: s.seats.map((x) => ({ ...x, cards: [...x.cards] })), deck: [...s.deck], board: [...s.board], events: [...s.events] })

/** Applies the current player's action. Illegal amounts are clamped to the nearest legal one. */
export function act(prev: State, a: Action): State {
  const l = legal(prev)
  if (!l) throw new Error('No one is to act')
  const s = clone(prev)
  const i = s.toAct
  const p = s.seats[i]
  const owed = s.currentBet - p.bet

  // a check facing a bet isn't possible: it counts as a fold
  if ((a.type === 'fold' || a.type === 'check') && owed > 0) {
    p.folded = true
    s.events.push({ type: 'act', seat: i, kind: 'fold', amount: 0, to: p.bet })
  } else if (a.type === 'check' || (a.type === 'fold' && owed <= 0) || (a.type === 'call' && owed <= 0)) {
    s.events.push({ type: 'act', seat: i, kind: 'check', amount: 0, to: p.bet })
  } else if (a.type === 'call' || (a.type === 'raise' && !l.canRaise)) {
    const amount = Math.min(owed, p.stack)
    p.stack -= amount
    p.bet += amount
    p.total += amount
    if (p.stack === 0) p.allIn = true
    s.events.push({ type: 'act', seat: i, kind: p.allIn ? 'allin' : 'call', amount, to: p.bet })
  } else if (a.type === 'raise') {
    const to = Math.max(l.minTo, Math.min(l.maxTo, Math.floor(a.to)))
    const amount = to - p.bet
    const raiseBy = to - s.currentBet
    const full = raiseBy >= s.minRaise
    const kind: ActKind = to === l.maxTo ? 'allin' : s.currentBet === 0 ? 'bet' : 'raise'
    p.stack -= amount
    p.bet = to
    p.total += amount
    if (p.stack === 0) p.allIn = true
    if (to > s.currentBet) {
      for (const [k, x] of s.seats.entries()) {
        if (k === i || !canAct(x)) continue
        if (full) {
          x.acted = false
          x.canRaise = true
        } else if (x.acted) {
          x.acted = false
          x.canRaise = false
        }
      }
      if (full) s.minRaise = raiseBy
      s.currentBet = to
    }
    s.events.push({ type: 'act', seat: i, kind, amount, to })
  }
  p.acted = true

  const left = s.seats.filter(inHand)
  if (left.length === 1) return winUncontested(s, s.seats.indexOf(left[0]))
  const j = findNext(s, i)
  if (j !== -1) {
    s.toAct = j
    return s
  }
  return finishStreet(s)
}

const needsToAct = (s: State, i: number) => {
  const x = s.seats[i]
  return canAct(x) && (!x.acted || x.bet < s.currentBet)
}
const needsAction = (s: State) => s.seats.some((_, i) => needsToAct(s, i))
const findNext = (s: State, from: number) => nextIndex(s.seats, from, (x) => needsToAct(s, s.seats.indexOf(x)))

function collect(s: State) {
  const moved = s.seats.reduce((a, x) => a + x.bet, 0)
  if (moved > 0) {
    s.pot += moved
    s.events.push({ type: 'collect', pot: s.pot })
  }
  for (const x of s.seats) {
    x.bet = 0
    x.acted = false
    x.canRaise = true
  }
  s.currentBet = 0
  s.minRaise = s.bb
}

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river']

/** Ends the betting round: deals the next street, or runs the board out when no more betting is possible, or goes to showdown. */
function finishStreet(s: State): State {
  collect(s)
  while (true) {
    if (s.phase === 'river') return showdown(s)
    const next = STREETS[STREETS.indexOf(s.phase as Street) + 1]
    s.deck.shift() // burn
    const cards = s.deck.splice(0, next === 'flop' ? 3 : 1)
    s.board.push(...cards)
    s.phase = next
    s.events.push({ type: 'street', street: next, cards })
    if (s.seats.filter(canAct).length >= 2) {
      s.toAct = nextIndex(s.seats, s.dealer, canAct)
      return s
    }
  }
}

function winUncontested(s: State, winner: number): State {
  collect(s)
  s.seats[winner].stack += s.pot
  s.events.push({ type: 'award', winners: [{ seat: winner, amount: s.pot }], hand: null, pot: s.pot, side: false })
  s.pot = 0
  s.phase = 'done'
  s.toAct = -1
  s.events.push({ type: 'end' })
  return s
}

export interface Pot {
  amount: number
  eligible: number[]
}

/** Main pot and side pots from what each player put in. Chips of folded players go to the pots they reached. */
export function pots(seats: Seat[]): Pot[] {
  const rest = seats.map((x) => x.total)
  const out: Pot[] = []
  while (seats.some((x, i) => inHand(x) && rest[i] > 0)) {
    const level = Math.min(...seats.flatMap((x, i) => (inHand(x) && rest[i] > 0 ? [rest[i]] : [])))
    const eligible = seats.flatMap((x, i) => (inHand(x) && rest[i] >= level ? [i] : []))
    let amount = 0
    for (let i = 0; i < seats.length; i++) {
      const take = Math.min(rest[i], level)
      amount += take
      rest[i] -= take
    }
    out.push({ amount, eligible })
  }
  const leftover = rest.reduce((a, b) => a + b, 0)
  if (leftover && out.length) out[out.length - 1].amount += leftover
  return out
}

function showdown(s: State): State {
  s.phase = 'done'
  s.toAct = -1
  const contenders = s.seats.flatMap((x, i) => (inHand(x) ? [i] : []))
  const scores = new Map<number, number>()
  for (const i of contenders) {
    const cards = [...s.seats[i].cards, ...s.board]
    scores.set(i, score(cards))
  }
  // reveal in order from the left of the dealer
  for (let k = 1; k <= s.seats.length; k++) {
    const i = (s.dealer + k) % s.seats.length
    if (scores.has(i)) s.events.push({ type: 'reveal', seat: i, cards: s.seats[i].cards, hand: shortName([...s.seats[i].cards, ...s.board]) })
  }
  const all = pots(s.seats)
  all.forEach((pot, n) => {
    const best = Math.min(...pot.eligible.map((i) => scores.get(i)!))
    const winners = pot.eligible.filter((i) => scores.get(i) === best)
    // odd chips go to the winners closest to the left of the dealer
    const ordered = [...winners].sort((a, b) => ((a - s.dealer - 1 + s.seats.length) % s.seats.length) - ((b - s.dealer - 1 + s.seats.length) % s.seats.length))
    const share = Math.floor(pot.amount / winners.length)
    let odd = pot.amount - share * winners.length
    const paid = ordered.map((i) => ({ seat: i, amount: share + (odd-- > 0 ? 1 : 0) }))
    for (const w of paid) s.seats[w.seat].stack += w.amount
    const single = pot.eligible.length === 1
    s.events.push({ type: 'award', winners: paid, hand: single ? null : describe([...s.seats[winners[0]].cards, ...s.board]), pot: pot.amount, side: n > 0 })
  })
  s.pot = 0
  s.events.push({ type: 'end' })
  return s
}

/** Chips in play: stacks + bets + pot. Constant through a hand (used by tests). */
export const chipsInPlay = (s: State) => s.pot + s.seats.reduce((a, x) => a + x.stack + x.bet, 0)
