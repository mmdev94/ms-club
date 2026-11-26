// Reading hands. Each opponent's possible two-card hands get a weight from
// what they did this hand (raised early, called a big bet, checked…); the bot
// then simulates against hands drawn from those weights instead of random cards.
//
// The 169-hand pre-flop tier chart is adapted from poker-ai-coach by ArTeria21
// (MIT licence, https://github.com/ArTeria21/poker-ai-coach) — see NOTICE.
import { evaluate } from '@pokertools/evaluator'
import { fullDeck, RANKS, type Card } from './cards.ts'
import { code } from './hand.ts'
import type { ActKind, Event, Street } from './holdem.ts'

/** Tiers 1 (premium) … 8 (junk). Rows/columns A…2; diagonal = pairs, upper-right = suited, lower-left = offsuit. */
const TIER_GRID = [
  '1122344444444',
  '2123456666666',
  '3413456777777',
  '4552345677777',
  '5665245678888',
  '6776634567888',
  '6887763567888',
  '6888877456888',
  '7888888745688',
  '7888888875578',
  '7888888888578',
  '7888888888858',
  '7888888888885',
]

const g = (r: number) => 12 - r
export function tier(cards: Card[]): number {
  const a = RANKS.indexOf(cards[0][0])
  const b = RANKS.indexOf(cards[1][0])
  if (a === b) return Number(TIER_GRID[g(a)][g(a)])
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  const suited = cards[0][1] === cards[1][1]
  return Number(suited ? TIER_GRID[g(hi)][g(lo)] : TIER_GRID[g(lo)][g(hi)])
}

/** 0 (worst) … 1 (best) for the best five of these cards, from the evaluator's 1–7462 scale. */
export const strength = (cards: Card[]) => 1 - (evaluate(cards.map(code)) - 1) / 7461

/** A flush draw or an open-ended straight draw that uses a hole card. */
export function draw(hole: Card[], board: Card[]): number {
  if (board.length >= 5 || board.length < 3) return 0
  const all = [...hole, ...board]
  const suits = new Map<string, number>()
  for (const c of all) suits.set(c[1], (suits.get(c[1]) ?? 0) + 1)
  const flush = [...suits].some(([s, n]) => n === 4 && hole.some((c) => c[1] === s))
  const ranks = new Set(all.map((c) => RANKS.indexOf(c[0])))
  if (ranks.has(12)) ranks.add(-1)
  const holeRanks = hole.map((c) => RANKS.indexOf(c[0]))
  let oesd = false
  for (let lo = -1; lo <= 8; lo++) {
    const run = [lo, lo + 1, lo + 2, lo + 3]
    if (run.every((r) => ranks.has(r)) && run.some((r) => holeRanks.includes(r === -1 ? 12 : r)) && lo + 4 <= 12 && lo >= 0) oesd = true
  }
  return flush && oesd ? 0.45 : flush ? 0.32 : oesd ? 0.26 : 0
}

// ── the public story of the hand ─────────────────────────────────────────────

export interface Seen {
  seat: number
  street: Street
  kind: ActKind
  /** chips added */
  amount: number
  /** bet level after the action */
  to: number
  potBefore: number
  toCallBefore: number
  /** raises already made this street before this action */
  raisesBefore: number
  board: Card[]
}

/** Every action of the current hand with its context, from the public events only. */
export function story(events: Event[]): Seen[] {
  let start = 0
  for (let i = events.length - 1; i >= 0; i--) if (events[i].type === 'hand') {
    start = i
    break
  }
  const out: Seen[] = []
  let street: Street = 'preflop'
  let pot = 0
  let level = 0
  let raises = 0
  let board: Card[] = []
  const bets = new Map<number, number>()
  for (const e of events.slice(start)) {
    if (e.type === 'blind') {
      bets.set(e.seat, (bets.get(e.seat) ?? 0) + e.amount)
      level = Math.max(level, bets.get(e.seat)!)
    } else if (e.type === 'act') {
      const inFront = [...bets.values()].reduce((a, b) => a + b, 0)
      out.push({ seat: e.seat, street, kind: e.kind, amount: e.amount, to: e.to, potBefore: pot + inFront, toCallBefore: Math.max(0, level - (bets.get(e.seat) ?? 0)), raisesBefore: raises, board })
      bets.set(e.seat, e.to)
      if (e.to > level) {
        if (e.kind === 'raise' || e.kind === 'bet' || e.kind === 'allin') raises++
        level = e.to
      }
    } else if (e.type === 'collect') {
      pot = e.pot
      bets.clear()
      level = 0
    } else if (e.type === 'street') {
      street = e.street
      board = [...board, ...e.cards]
      raises = 0
    }
  }
  return out
}

/** How a player tends to play, learned over the session (Hard bots use it). */
export interface Profile {
  hands: number
  /** put money in voluntarily before the flop */
  vpip: number
  /** raised before the flop */
  pfr: number
  /** faced a bet after the flop / folded to it */
  facedBet: number
  foldedToBet: number
  /** bets + raises vs calls after the flop */
  aggressive: number
  passive: number
  /** caught bluffing at showdown (bet or raised on the river with a weak hand) */
  bluffsShown: number
}
export const emptyProfile = (): Profile => ({ hands: 0, vpip: 0, pfr: 0, facedBet: 0, foldedToBet: 0, aggressive: 0, passive: 0, bluffsShown: 0 })

/** Rates with a prior, so a few hands don't swing them wildly. */
export function rates(p: Profile | undefined) {
  const q = p ?? emptyProfile()
  return {
    vpip: (q.vpip + 5) / (q.hands + 20),
    pfr: (q.pfr + 3) / (q.hands + 20),
    foldToBet: (q.foldedToBet + 4) / (q.facedBet + 10),
    aggression: (q.aggressive + 3) / (q.aggressive + q.passive + 6),
    bluffy: (q.bluffsShown + 1) / (q.hands / 10 + 6),
  }
}

/**
 * Weight of each possible hand for one opponent, given their actions so far.
 * `loose` (0–1) widens their assumed ranges; `bluffy` (0–1) keeps more weak hands in their bets.
 */
export function rangeFor(seat: Seen[], known: Card[], loose: number, bluffy: number): { hands: Card[][]; weights: number[] } {
  const deck = fullDeck().filter((c) => !known.includes(c))
  const hands: Card[][] = []
  for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) hands.push([deck[i], deck[j]])
  const weights = hands.map((h) => {
    let w = 1
    for (const a of seat) {
      if (a.kind === 'fold') continue
      if (a.street === 'preflop') {
        if (a.kind === 'check') continue // the big blind's free look says nothing
        const t = tier(h)
        let threshold = 3.5 + loose * 3 // an open raise
        if (a.kind === 'call') threshold += 1.2
        if ((a.kind === 'raise' || a.kind === 'allin') && a.raisesBefore >= 1) threshold = 1.8 + loose * 1.5 // a re-raise
        if (a.kind === 'allin' && a.raisesBefore >= 2) threshold = 1.3 + loose
        const floor = 0.015 + bluffy * 0.08
        w *= floor + (1 - floor) / (1 + Math.exp((t - threshold) * 1.6))
      } else {
        const s = strength([...h, ...a.board])
        const d = draw(h, a.board)
        if (a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin') {
          const size = Math.min(3, a.amount / Math.max(1, a.potBefore))
          w *= 0.08 + bluffy * 0.35 + Math.pow(s, 1 + size * 1.2) + d * 0.8
        } else if (a.kind === 'call') {
          const price = a.toCallBefore / Math.max(1, a.potBefore + a.toCallBefore)
          w *= 0.06 + loose * 0.25 + Math.max(0, s - price * 0.9) + d
        } else if (a.kind === 'check') {
          w *= 1 - 0.55 * Math.pow(s, 2)
        }
      }
    }
    return w
  })
  return { hands, weights }
}

/** Picks an index with probability proportional to its weight. */
export function sampler(weights: number[]): (random: () => number) => number {
  const cum: number[] = []
  let t = 0
  for (const w of weights) cum.push((t += w))
  return (random) => {
    const x = random() * t
    let lo = 0
    let hi = cum.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cum[mid] < x) lo = mid + 1
      else hi = mid
    }
    return lo
  }
}

/** Share of the pot won against opponents holding hands drawn from their ranges. */
export function rangeEquity(hole: Card[], board: Card[], ranges: { hands: Card[][]; weights: number[] }[], iterations: number, random: () => number): number {
  const pickers = ranges.map((r) => sampler(r.weights))
  const base = fullDeck().filter((c) => !hole.includes(c) && !board.includes(c))
  const mine = hole.map(code)
  let won = 0
  let done = 0
  for (let it = 0; it < iterations * 3 && done < iterations; it++) {
    const used = new Set<Card>()
    const opp: Card[][] = []
    let clash = false
    for (let o = 0; o < ranges.length; o++) {
      const h = ranges[o].hands[pickers[o](random)]
      if (used.has(h[0]) || used.has(h[1])) {
        clash = true
        break
      }
      used.add(h[0])
      used.add(h[1])
      opp.push(h)
    }
    if (clash) continue
    const rest = base.filter((c) => !used.has(c))
    const runout = [...board]
    while (runout.length < 5) {
      const k = Math.floor(random() * rest.length)
      runout.push(rest[k])
      rest.splice(k, 1)
    }
    const rc = runout.map(code)
    const me = evaluate([...mine, ...rc])
    let best = Infinity
    let ties = 0
    for (const h of opp) {
      const v = evaluate([code(h[0]), code(h[1]), ...rc])
      if (v < best) {
        best = v
        ties = 1
      } else if (v === best) ties++
    }
    if (me < best) won += 1
    else if (me === best) won += 1 / (ties + 1)
    done++
  }
  return done ? won / done : 0.5
}
