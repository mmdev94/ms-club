// The AI players. Each decision: estimate how often this hand wins by dealing
// out the rest of the hand a few hundred times (Monte Carlo), compare that
// with the price of calling, then let the character's personality decide.
// All randomness comes from the given `random`, so a seeded game replays exactly.
import { fullDeck, type Card } from './cards.ts'
import { code } from './hand.ts'
import { evaluate } from '@pokertools/evaluator'
import { legal, type Action, type State } from './holdem.ts'

export interface Style {
  /** how good a hand must be to play it at all (1 = average for the number of players) */
  play: number
  /** how good to raise with */
  raise: number
  /** chance to bet with nothing when it's free */
  bluff: number
  /** how far below the price it will still call (0–0.5) */
  sticky: number
  /** bet size, as a share of the pot */
  size: number
  /** chance that a raise becomes an all-in */
  shove: number
  /** chance to just call with a monster, to trap */
  slowplay: number
}

/** Share of the pot this hand wins on average against `opponents` random hands. */
export function equity(hole: Card[], board: Card[], opponents: number, iterations: number, random: () => number): number {
  const used = new Set([...hole, ...board])
  const rest = fullDeck().filter((c) => !used.has(c))
  const mine = hole.map(code)
  const known = board.map(code)
  const need = 5 - board.length
  let won = 0
  const pool = rest.map(code)
  for (let it = 0; it < iterations; it++) {
    // partial shuffle: just enough cards for the opponents and the rest of the board
    const take = need + opponents * 2
    for (let k = 0; k < take; k++) {
      const j = k + Math.floor(random() * (pool.length - k))
      ;[pool[k], pool[j]] = [pool[j], pool[k]]
    }
    const runout = [...known, ...pool.slice(0, need)]
    const me = evaluate([...mine, ...runout])
    let best = Infinity
    let ties = 0
    for (let o = 0; o < opponents; o++) {
      const v = evaluate([pool[need + o * 2], pool[need + o * 2 + 1], ...runout])
      if (v < best) {
        best = v
        ties = 1
      } else if (v === best) ties++
    }
    if (me < best) won += 1
    else if (me === best) won += 1 / (ties + 1)
  }
  return won / iterations
}

export interface Decision {
  action: Action
  /** what it thought: for the "why did it do that?" view and tests */
  equity: number
  bluff: boolean
  /** a short reason in words */
  why?: string
}

export function decide(s: State, style: Style, random: () => number, iterations = 400): Decision {
  const l = legal(s)
  if (!l) throw new Error('not this bot’s turn')
  const me = s.seats[l.seat]
  const opponents = s.seats.filter((x, i) => i !== l.seat && !x.out && !x.folded).length
  const e = equity(me.cards, s.board, Math.max(1, opponents), iterations, random)
  const fair = 1 / (opponents + 1)
  const rel = e / fair
  const pot = s.pot + s.seats.reduce((a, x) => a + x.bet, 0)
  const price = l.toCall / (pot + l.toCall || 1)
  const jitter = 0.85 + random() * 0.3

  const raiseTo = (frac: number) => {
    if (random() < style.shove) return l.maxTo
    const target = s.currentBet + Math.max(s.minRaise, Math.round(((pot + l.toCall) * frac * jitter) / 10) * 10)
    return Math.min(l.maxTo, Math.max(l.minTo, target))
  }

  // monsters: raise, or sometimes just call to trap
  if (rel * jitter >= style.raise && l.canRaise) {
    if (random() < style.slowplay && s.board.length < 5) return { action: { type: l.canCheck ? 'check' : 'call' }, equity: e, bluff: false }
    return { action: { type: 'raise', to: raiseTo(style.size) }, equity: e, bluff: false }
  }
  // free to act: check, or bluff now and then
  if (l.canCheck) {
    if (l.canRaise && random() < style.bluff) return { action: { type: 'raise', to: raiseTo(style.size * 0.8) }, equity: e, bluff: true }
    return { action: { type: 'check' }, equity: e, bluff: false }
  }
  // facing a bet: play only hands worth playing, and only at a fair price
  const playable = rel * jitter >= style.play || s.board.length > 0
  if (playable && e >= price * (1 - style.sticky)) return { action: { type: 'call' }, equity: e, bluff: false }
  // the occasional bluff-raise instead of a fold
  if (l.canRaise && random() < style.bluff * 0.35) return { action: { type: 'raise', to: raiseTo(style.size) }, equity: e, bluff: true }
  return { action: { type: 'fold' }, equity: e, bluff: false }
}
