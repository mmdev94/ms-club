// How the regulars think, at three levels:
//
//   Easy    the original bot: win chance against random cards, plus some mistakes.
//   Normal  pre-flop hand charts by seat position, short-stack all-in play,
//           continuation bets, semi-bluffs with draws, value bets sized to hand
//           strength. After the flop it still assumes opponents hold random cards.
//   Hard    Normal + reads each opponent's likely hands from their actions, and
//           learns over the session how each player plays (how often they fold
//           to bets, bluff, call) to exploit it; deeper simulation.
//
// Each character's personality (loose/tight, aggressive, bluffy…) applies on top
// at every level. All randomness comes from `random`, so seeded games replay.
import { decide as easyDecide, type Decision } from './bot.ts'
import type { Character } from './characters.ts'
import { legal, type Action, type State } from './holdem.ts'
import { draw, rangeEquity, rangeFor, rates, story, strength, tier, emptyProfile, type Profile, type Seen } from './ranges.ts'

export type Level = 'easy' | 'normal' | 'hard'
export const LEVELS: { id: Level; name: string; blurb: string }[] = [
  { id: 'easy', name: 'Easy', blurb: 'Friendly game. They misread hands and call too much.' },
  { id: 'normal', name: 'Normal', blurb: 'They play their position, read your bets and bluff with draws.' },
  { id: 'hard', name: 'Hard', blurb: 'They study how you play and attack your habits.' },
]

/** How a character leans, on top of the level. */
export interface Personality {
  /** -1 tight … +1.5 very loose */
  loose: number
  /** 0 passive … 1 aggressive */
  aggro: number
  /** 0 … 1 */
  bluff: number
  /** calls a little below the right price (0 … 0.4) */
  sticky: number
  /** chance a raise becomes all-in */
  shove: number
  /** chance to slow-play a monster */
  trap: number
}

/** What players have shown over the session, by player id. */
export type Memory = Map<string, Profile>

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))

export function think(s: State, c: Character, level: Level, random: () => number, memory?: Memory, ids?: string[]): Decision {
  if (level === 'easy') return easy(s, c, random)
  const l = legal(s)
  if (!l) throw new Error('not this bot’s turn')
  const seat = l.seat
  const me = s.seats[seat]
  const p = c.personality
  const hard = level === 'hard'
  const bb = s.bb
  const hist = story(s.events)
  const pot = s.pot + s.seats.reduce((a, x) => a + x.bet, 0)
  const opponents = s.seats.flatMap((x, i) => (i !== seat && !x.out && !x.folded ? [i] : []))
  const effective = Math.min(me.stack + me.bet, Math.max(...opponents.map((i) => s.seats[i].stack + s.seats[i].bet))) / bb
  const live = s.seats.flatMap((x, i) => (!x.out ? [i] : []))
  const order = live.map((i) => (i - s.dealer - 1 + s.seats.length) % s.seats.length).sort((a, b) => a - b)
  const myPos = order.indexOf((seat - s.dealer - 1 + s.seats.length) % s.seats.length)
  const late = live.length > 1 ? myPos / (live.length - 1) : 1 // 0 = first to act after the flop … 1 = the button
  const jitter = (k: number) => (random() - 0.5) * k * (hard ? 0.6 : 1)

  const raiseTo = (target: number): Action => {
    let to = Math.round(target / 5) * 5
    if (random() < p.shove * (hard ? 0.5 : 1) || to >= l.maxTo * 0.75) to = l.maxTo
    return { type: 'raise', to: clamp(to, l.minTo, l.maxTo) }
  }
  const passive = (): Action => ({ type: l.canCheck ? 'check' : 'fold' })
  const result = (action: Action, equity: number, bluff = false): Decision => ({ action, equity, bluff })

  // ── before the flop ─────────────────────────────────────────────────────────
  if (s.phase === 'preflop') {
    const t = tier(me.cards) + jitter(0.8)
    const raises = hist.filter((a) => a.street === 'preflop' && (a.kind === 'raise' || a.kind === 'allin' || a.kind === 'bet')).length
    const limpers = hist.filter((a) => a.street === 'preflop' && a.kind === 'call').length
    const eq = (9 - t) / 8

    // short stack: all-in or fold
    if (effective <= 12) {
      const pushTier = 2.6 + late * 2 + p.loose * 1.2 + (12 - effective) * 0.18 - raises * 0.9
      if (t <= pushTier && l.canRaise) return result({ type: 'raise', to: l.maxTo }, eq)
      if (raises > 0 && t <= pushTier - 0.6) return result({ type: 'call' }, eq)
      return result(passive(), eq)
    }

    if (raises === 0) {
      const openTier = 2.7 + late * 2.6 + p.loose * 1.8
      if (t <= openTier && l.canRaise) return result(raiseTo(bb * (2.5 + limpers) + (p.aggro > 0.8 ? bb : 0)), eq)
      if (l.canCheck) return result({ type: 'check' }, eq)
      if (t <= openTier + 1 && p.loose > 0.6 && random() < 0.45) return result({ type: 'call' }, eq)
      return result({ type: 'fold' }, eq)
    }

    // facing a raise
    const bigPrice = l.toCall / bb
    const threeBet = 1.6 + p.aggro * 1.1 + p.loose * 0.4 - (raises - 1) * 0.6
    const call = 3.1 + p.loose * 1.4 + p.sticky * 2 + late * 0.5 - (raises - 1) * 1.1 - (bigPrice > 12 ? 1 : 0) - (bigPrice > 40 ? 1 : 0)
    if (t <= threeBet && l.canRaise) return result(raiseTo(s.currentBet * (raises >= 2 ? 2.3 : 3)), eq)
    // a few re-raise bluffs with suited aces and connectors from late seats
    const suited = me.cards[0][1] === me.cards[1][1]
    if (suited && t >= 3 && t <= 5 && late > 0.6 && raises === 1 && l.canRaise && random() < p.bluff * 0.22) return result(raiseTo(s.currentBet * 3), eq, true)
    if (t <= call) return result({ type: 'call' }, eq)
    return result(passive(), eq)
  }

  // ── after the flop ──────────────────────────────────────────────────────────
  const ranges = opponents.map((o) => {
    // Normal ignores what opponents did: every hand is equally likely
    const seen = hard ? hist.filter((a) => a.seat === o) : []
    const r = hard && ids && memory ? rates(memory.get(ids[o])) : null
    const loose = r ? clamp((r.vpip - 0.12) / 0.5, 0, 1) : 0.4
    const bluffy = r ? clamp(r.aggression - 0.35 + r.bluffy, 0, 1) : 0.25
    return rangeFor(seen, [...me.cards, ...s.board], loose, bluffy)
  })
  const e = rangeEquity(me.cards, s.board, ranges, hard ? 700 : 300, random) * (1 + jitter(0.1))
  const d = draw(me.cards, s.board)
  const river = s.phase === 'river'
  const aggressor = lastPreflopRaiser(hist) === seat
  const opp = hard && ids && memory ? opponents.map((o) => rates(memory.get(ids[o]))) : []
  const foldy = opp.length ? opp.reduce((a, r) => a + r.foldToBet, 0) / opp.length : 0.45
  const wild = opp.length ? Math.max(...opp.map((r) => r.aggression)) : 0.5

  if (l.canCheck) {
    // value
    if (e > 0.64 - p.aggro * 0.06 && l.canRaise) {
      if (e > 0.86 && !river && random() < p.trap * (hard ? 0.5 : 1)) return result({ type: 'check' }, e)
      const size = (e > 0.82 ? 0.8 : 0.55) * (hard && foldy < 0.35 ? 1.3 : 1)
      return result(raiseTo(pot * (size + jitter(0.2))), e)
    }
    // thin value against players who call too much (Hard)
    if (hard && e > 0.52 && foldy < 0.32 && l.canRaise) return result(raiseTo(pot * 0.4), e)
    // players who fold too much get bet at on every street (Hard)
    if (hard && foldy > 0.55 && l.canRaise && random() < clamp((foldy - 0.45) * 2.2, 0, 0.92)) return result(raiseTo(pot * 0.35), e, e < 0.45)
    // continuation bet as the pre-flop raiser
    if (aggressor && s.phase === 'flop' && opponents.length <= 2 && l.canRaise && random() < (0.5 + p.aggro * 0.3) * (hard ? clamp(foldy / 0.45, 0.5, 1.4) : 1))
      return result(raiseTo(pot * 0.4), e, e < 0.45)
    // semi-bluff with a draw
    if (d > 0 && !river && l.canRaise && random() < 0.3 + p.aggro * 0.4) return result(raiseTo(pot * 0.6), e, true)
    // river bluff with nothing, more often against players who fold
    if (river && e < 0.25 && l.canRaise && opponents.length <= 2 && random() < p.bluff * (hard ? clamp(foldy / 0.45, 0.3, 2) : 1) * 0.6)
      return result(raiseTo(pot * 0.7), e, true)
    return result({ type: 'check' }, e)
  }

  // facing a bet
  const price = l.toCall / (pot + l.toCall)
  let need = price * (1 - p.sticky)
  if (!river) need -= d * 0.1 // a draw has more to come
  if (hard) need *= wild > 0.6 ? 0.85 : wild < 0.35 ? 1.12 : 1 // pay off bluffers, respect quiet players
  if (e > 0.8 - p.aggro * 0.08 && l.canRaise) {
    if (river && e > 0.92 && random() < 0.4) return result({ type: 'raise', to: l.maxTo }, e)
    return result(raiseTo(s.currentBet * 2.6 + pot * 0.3), e)
  }
  if (d >= 0.26 && s.phase === 'flop' && l.canRaise && random() < p.aggro * 0.22) return result(raiseTo(s.currentBet * 2.8), e, true)
  if (e >= need) return result({ type: 'call' }, e)
  if (l.canRaise && random() < p.bluff * 0.04) return result(raiseTo(s.currentBet * 3), e, true)
  return result({ type: 'fold' }, e)
}

function lastPreflopRaiser(h: Seen[]): number {
  for (let i = h.length - 1; i >= 0; i--) if (h[i].street === 'preflop' && (h[i].kind === 'raise' || h[i].kind === 'allin' || h[i].kind === 'bet')) return h[i].seat
  return -1
}

/** Easy: the original bot, with the occasional plain mistake. */
function easy(s: State, c: Character, random: () => number): Decision {
  const d = easyDecide(s, c.style, random, 200)
  const l = legal(s)!
  const r = random()
  if (d.action.type === 'fold' && !l.canCheck && r < 0.18) return { ...d, action: { type: 'call' } } // curious call
  if (d.action.type === 'raise' && r < 0.15) return { ...d, action: { type: l.canCheck ? 'check' : 'call' } } // misses a value bet
  return d
}

/** After a hand: update what everyone showed (public actions and showdown cards only). */
export function learn(memory: Memory, ids: string[], events: State['events']): void {
  const h = story(events)
  const seated = new Set<number>()
  for (const e of events) if (e.type === 'deal') seated.add(e.seat)
  for (const seat of seated) {
    const p = memory.get(ids[seat]) ?? emptyProfile()
    p.hands++
    const mine = h.filter((a) => a.seat === seat)
    if (mine.some((a) => a.street === 'preflop' && (a.kind === 'call' || a.kind === 'raise' || a.kind === 'allin'))) p.vpip++
    if (mine.some((a) => a.street === 'preflop' && (a.kind === 'raise' || a.kind === 'allin'))) p.pfr++
    for (const a of mine) {
      if (a.street === 'preflop') continue
      if (a.toCallBefore > 0) {
        p.facedBet++
        if (a.kind === 'fold') p.foldedToBet++
      }
      if (a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin') p.aggressive++
      if (a.kind === 'call') p.passive++
    }
    memory.set(ids[seat], p)
  }
  // caught bluffing: bet or raised on the river, then showed a weak hand
  const board: string[] = []
  for (const e of events) if (e.type === 'street') board.push(...e.cards)
  for (const e of events) {
    if (e.type !== 'reveal' || board.length < 5) continue
    const riverAggro = h.some((a) => a.seat === e.seat && a.street === 'river' && (a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin'))
    if (riverAggro && strength([...e.cards, ...board]) < 0.5) memory.get(ids[e.seat])!.bluffsShown++
  }
}
