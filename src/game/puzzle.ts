// Spot the Bluff: one decision a day, the same for everyone. The day's seed
// plays hands between the regulars until one of them bets into "you" on the
// river, heads-up, while you hold a middling hand. Call or fold? Then their
// cards turn over. About half the days it's a bluff.
import { decide } from '../engine/bot.ts'
import { rng, type Card } from '../engine/cards.ts'
import { CHARACTERS, type Character } from '../engine/characters.ts'
import { describe, score } from '../engine/hand.ts'
import { act, legal, startHand, type State } from '../engine/holdem.ts'
import { story, strength } from '../engine/ranges.ts'

export const FIRST_DAY = '2026-11-27'
export const puzzleNumber = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${FIRST_DAY}T00:00:00Z`)) / 86400000) + 1

export interface Puzzle {
  day: string
  number: number
  /** you, then four regulars around the table */
  names: string[]
  bettor: number
  character: Character
  mine: Card[]
  theirs: Card[]
  board: Card[]
  /** pot before their river bet */
  pot: number
  bet: number
  /** what happened, in words */
  story: string[]
  /** the right answer */
  call: boolean
  myHand: string
  theirHand: string
  /** they bet with the worse hand */
  bluff: boolean
}

const VERB: Record<string, string> = { bet: 'bet', raise: 'raised to', allin: 'went all in for', call: 'called', check: 'checked' }

export function makePuzzle(day: string, maxTries = 600): Puzzle | null {
  const wantBluff = puzzleNumber(day) % 2 === 1
  let fallback: Puzzle | null = null
  for (let k = 0; k < maxTries; k++) {
    const random = rng(`msclub-puzzle:${day}:${k}:bots`)
    // seat 0 is "you", played by a steady Shark until the moment comes
    const cast = [CHARACTERS[2], CHARACTERS[0], CHARACTERS[1], CHARACTERS[3], CHARACTERS[2]]
    let s: State = startHand(
      cast.map((c, i) => ({ id: `${i}`, name: i ? c.name : 'You', stack: 2000 })),
      { hand: 1, dealer: k % 5, sb: 10, bb: 20, seed: `msclub-puzzle:${day}:${k}` },
    )
    let guard = 0
    while (s.phase !== 'done' && guard++ < 200) {
      const l = legal(s)!
      const inHand = s.seats.filter((x) => !x.folded && !x.out).length
      if (s.phase === 'river' && s.toAct === 0 && l.toCall > 0 && inHand === 2) {
        const p = toPuzzle(day, s, random)
        if (p) {
          if (p.bluff === wantBluff) return p
          fallback ??= p
        }
        break
      }
      s = act(s, decide(s, cast[s.toAct].style, random, 120).action)
    }
  }
  return fallback
}

function toPuzzle(day: string, s: State, _random: () => number): Puzzle | null {
  const bettor = s.seats.findIndex((x, i) => i !== 0 && !x.folded && !x.out)
  const me = s.seats[0]
  const them = s.seats[bettor]
  const mine = strength([...me.cards, ...s.board])
  if (mine < 0.18 || mine > 0.62) return null // too obvious either way
  const pot = s.pot + s.seats.reduce((a, x) => a + x.bet, 0) - them.bet
  const bet = them.bet - me.bet
  if (bet < pot * 0.35) return null // a tiny bet isn't much of a question
  const a = score([...me.cards, ...s.board])
  const b = score([...them.cards, ...s.board])
  if (a === b) return null // a split pot isn't a fair question
  const call = a < b
  const names = s.seats.map((x) => x.name)
  const lines = story(s.events)
    .filter((a) => a.kind !== 'fold' && (a.seat === bettor || a.seat === 0))
    .map((a) => `${a.seat === 0 ? 'You' : names[a.seat]} ${VERB[a.kind] ?? a.kind}${a.kind === 'check' || a.kind === 'call' ? '' : ` ${a.to}`} ${a.street === 'preflop' ? 'before the flop' : `on the ${a.street}`}`)
  return {
    day,
    number: puzzleNumber(day),
    names,
    bettor,
    character: CHARACTERS.find((c) => c.name === names[bettor])!,
    mine: me.cards,
    theirs: them.cards,
    board: s.board,
    pot,
    bet,
    story: lines,
    call,
    myHand: describe([...me.cards, ...s.board]),
    theirHand: describe([...them.cards, ...s.board]),
    bluff: call,
  }
}
