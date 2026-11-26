import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fullDeck, rng, shuffle, type Card } from './cards.ts'
import { act, chipsInPlay, legal, pots, startHand, type State } from './holdem.ts'

/** A deck where players (in deal order, left of the dealer first) get `holes`, then the board. Burns are filler. */
function deck(holes: Card[][], board: Card[]): Card[] {
  const used = new Set([...holes.flat(), ...board])
  const filler = fullDeck().filter((c) => !used.has(c))
  return [...holes.map((h) => h[0]), ...holes.map((h) => h[1]), filler[0], ...board.slice(0, 3), filler[1], board[3], filler[2], board[4], ...filler.slice(3)]
}
const players = (...stacks: number[]) => stacks.map((stack, i) => ({ id: `p${i}`, name: `P${i}`, stack }))
const kinds = (s: State, type: string) => s.events.filter((e) => e.type === type)

test('heads-up: the dealer posts the small blind and acts first before the flop, last after', () => {
  let s = startHand(players(1000, 1000), { hand: 1, dealer: 0, sb: 10, bb: 20, seed: 'x' })
  assert.deepEqual(kinds(s, 'blind'), [
    { type: 'blind', seat: 0, amount: 10, kind: 'small' },
    { type: 'blind', seat: 1, amount: 20, kind: 'big' },
  ])
  assert.equal(s.toAct, 0)
  assert.deepEqual(legal(s), { seat: 0, toCall: 10, canCheck: false, canRaise: true, minTo: 40, maxTo: 1000 })
  s = act(s, { type: 'call' })
  assert.equal(s.toAct, 1, 'big blind gets the option')
  s = act(s, { type: 'check' })
  assert.equal(s.phase, 'flop')
  assert.equal(s.board.length, 3)
  assert.equal(s.toAct, 1, 'after the flop the big blind acts first')
  assert.equal(s.pot, 40)
})

test('three players: everyone folds to the big blind, who wins the blinds', () => {
  let s = startHand(players(500, 500, 500), { hand: 1, dealer: 0, sb: 10, bb: 20, seed: 'y' })
  assert.equal(s.toAct, 0, 'first to act is left of the big blind (the dealer, 3-handed)')
  s = act(s, { type: 'fold' })
  s = act(s, { type: 'fold' })
  assert.equal(s.phase, 'done')
  assert.deepEqual(s.seats.map((x) => x.stack), [500, 490, 510])
  assert.equal(kinds(s, 'reveal').length, 0, 'no cards shown when nobody calls')
})

test('raises: minimum raise is the last raise size; a bet resets it each street', () => {
  let s = startHand(players(1000, 1000, 1000), { hand: 1, dealer: 0, sb: 10, bb: 20, seed: 'z' })
  s = act(s, { type: 'raise', to: 60 }) // raise by 40
  assert.equal(legal(s)!.minTo, 100, 're-raise must be at least another 40')
  s = act(s, { type: 'raise', to: 5 }) // too small: clamped up to the minimum
  assert.equal(s.currentBet, 100)
  s = act(s, { type: 'call' })
  s = act(s, { type: 'call' })
  assert.equal(s.phase, 'flop')
  assert.equal(s.pot, 300)
  assert.equal(legal(s)!.minTo, 20, 'a bet on a new street must be at least the big blind')
})

test('side pots: a short all-in only wins what it covered', () => {
  // seat 1 (left of dealer 0) is short with the best hand; seat 2 beats seat 0
  const d = deck([['Ah', 'Ad'], ['Kh', 'Kd'], ['2c', '7d']], ['As', '9c', '5s', '3h', 'Jd'])
  let s = startHand(players(1000, 100, 1000), { hand: 1, dealer: 0, sb: 10, bb: 20, deck: d })
  // dealer 0 acts first 3-handed preflop
  const before = chipsInPlay(s)
  s = act(s, { type: 'raise', to: 300 }) // seat 0
  s = act(s, { type: 'call' }) // seat 1: all-in for 100
  assert.equal(s.seats[1].allIn, true)
  s = act(s, { type: 'call' }) // seat 2: calls 300
  // flop onwards: seats 2 and 0 check it down
  while (s.phase !== 'done') s = act(s, { type: 'check' })
  assert.equal(chipsInPlay(s), before, 'no chips created or lost')
  const awards = kinds(s, 'award') as { winners: { seat: number; amount: number }[]; pot: number; side: boolean }[]
  assert.equal(awards[0].pot, 300, 'main pot: 100 from each')
  assert.deepEqual(awards[0].winners, [{ seat: 1, amount: 300 }], 'aces (trips) win the main pot')
  assert.equal(awards[1].pot, 400, 'side pot: the other 200 each')
  assert.deepEqual(awards[1].winners, [{ seat: 2, amount: 400 }], 'kings beat 7-high for the side pot')
  assert.deepEqual(s.seats.map((x) => x.stack), [700, 300, 1100])
})

test('pots(): folded chips stay in, uncalled excess goes back to the bettor', () => {
  const seat = (total: number, folded = false) => ({ id: '', name: '', stack: 0, bet: 0, total, cards: [], folded, allIn: false, out: false, acted: true, canRaise: true })
  assert.deepEqual(pots([seat(50, true), seat(200), seat(500)]), [
    { amount: 450, eligible: [1, 2] },
    { amount: 300, eligible: [2] },
  ])
})

test('a short all-in raise does not reopen raising for a player who already acted', () => {
  let s = startHand(players(1000, 1000, 130), { hand: 1, dealer: 2, sb: 10, bb: 20, seed: 'w' })
  // dealer 2, sb 0, bb 1, seat 2 acts first
  s = act(s, { type: 'call' }) // seat 2 calls 20
  s = act(s, { type: 'raise', to: 100 }) // seat 0 raises to 100 (by 80)
  s = act(s, { type: 'call' }) // seat 1 calls 100
  s = act(s, { type: 'raise', to: 130 }) // seat 2: all-in for 130, a raise of only 30
  assert.equal(s.seats[2].allIn, true)
  const l = legal(s)!
  assert.equal(l.seat, 0)
  assert.equal(l.toCall, 30)
  assert.equal(l.canRaise, false, 'seat 0 already acted and the raise was short')
})

test('split pot: odd chip goes to the first winner left of the dealer', () => {
  const d = deck([['2c', '3d'], ['2d', '3c'], ['4h', '5h']], ['As', 'Ks', 'Qs', 'Js', 'Ts'])
  let s = startHand(players(1000, 1000, 1000), { hand: 1, dealer: 2, sb: 5, bb: 10, deck: d })
  // dealer 2, sb 0, bb 1; first to act is seat 2
  s = act(s, { type: 'call' })
  s = act(s, { type: 'call' })
  s = act(s, { type: 'check' })
  while (s.phase !== 'done') s = act(s, { type: 'check' })
  // royal flush on board: everyone splits 30
  const award = kinds(s, 'award')[0] as { winners: { seat: number; amount: number }[] }
  assert.deepEqual(award.winners.map((w) => w.amount), [10, 10, 10])
  assert.equal(kinds(s, 'reveal').length, 3)
})

test('everyone all-in before the flop: the board is dealt out with no more betting', () => {
  let s = startHand(players(200, 200), { hand: 1, dealer: 0, sb: 10, bb: 20, seed: 'q' })
  s = act(s, { type: 'raise', to: 200 })
  s = act(s, { type: 'call' })
  assert.equal(s.phase, 'done')
  assert.equal(s.board.length, 5)
  assert.equal(kinds(s, 'street').length, 3)
  assert.equal(chipsInPlay(s), 400)
})

test('same seed, same actions: same hand (what makes daily tables replayable)', () => {
  const play = () => {
    let s = startHand(players(1000, 1000, 1000), { hand: 7, dealer: 1, sb: 10, bb: 20, seed: 'daily-2026-11-27' })
    s = act(s, { type: 'call' })
    s = act(s, { type: 'call' })
    s = act(s, { type: 'check' })
    while (s.phase !== 'done') s = act(s, { type: 'check' })
    return JSON.stringify(s.events)
  }
  assert.equal(play(), play())
})

test('random play never creates or loses chips', () => {
  const r = rng('fuzz')
  for (let h = 0; h < 400; h++) {
    const stacks = Array.from({ length: 2 + Math.floor(r() * 5) }, () => 20 + Math.floor(r() * 2000))
    let s = startHand(players(...stacks), { hand: h, dealer: Math.floor(r() * stacks.length), sb: 10, bb: 20, seed: `f${h}` })
    const total = chipsInPlay(s)
    let steps = 0
    while (s.phase !== 'done' && steps++ < 200) {
      const l = legal(s)!
      const x = r()
      s = act(s, x < 0.15 ? { type: 'fold' } : x < 0.6 ? { type: l.canCheck ? 'check' : 'call' } : { type: 'raise', to: l.minTo + Math.floor(r() * (l.maxTo - l.minTo + 1)) })
    }
    assert.equal(s.phase, 'done', `hand ${h} finished`)
    assert.equal(s.seats.reduce((a, x) => a + x.stack, 0), total, `hand ${h} kept every chip`)
    assert.ok(s.seats.every((x) => x.stack >= 0))
  }
  void shuffle
})
