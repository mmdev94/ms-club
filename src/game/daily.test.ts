import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rng } from '../engine/cards.ts'
import { act, legal, type Action } from '../engine/holdem.ts'
import type { Memory } from '../engine/brain.ts'
import { botRandom, DAILY_HANDS, dailyBotMove, dailySeats, dealDaily, encode, nextDealer, replay, tiltAfter, topUp } from './daily.ts'

/** Plays a Daily Table the way the game does, with a random (but legal) player. */
function play(day: string, seed: string) {
  const me = rng(seed)
  const random = botRandom(day)
  const memory: Memory = new Map()
  const moves: string[] = []
  let seats = dailySeats()
  let dealer = seats.length - 1
  let tilt = seats.map(() => 0)
  for (let hand = 1; hand <= DAILY_HANDS; hand++) {
    seats = topUp(seats)
    if (seats[0].stack <= 0) break
    dealer = nextDealer(dealer, seats)
    const start = seats.map((x) => x.stack)
    let s = dealDaily(day, hand, seats, dealer)
    while (s.phase !== 'done') {
      if (s.toAct === 0) {
        const l = legal(s)!
        const x = me()
        const a: Action = x < 0.2 && !l.canCheck ? { type: 'fold' } : x < 0.75 || !l.canRaise ? { type: l.canCheck ? 'check' : 'call' } : { type: 'raise', to: l.minTo }
        moves.push(encode(a))
        s = act(s, a)
      } else s = act(s, dailyBotMove(s, random, memory, tilt[s.toAct]))
    }
    seats = s.seats.map((x) => ({ id: x.id, name: x.name, stack: x.stack }))
    tilt = tiltAfter(tilt, start, seats.map((x) => x.stack))
  }
  return { moves: moves.join(','), final: seats[0].stack }
}

test('a Daily Table replays to the exact same chips from the moves alone', () => {
  for (const who of ['a', 'b', 'c']) {
    const { moves, final } = play('2026-11-27', who)
    const r = replay('2026-11-27', moves)
    assert.equal(r.ok, true, r.reason)
    assert.equal(r.final, final)
  }
})

test('every player gets the same cards on the same day, and new cards the next day', () => {
  const a = dealDaily('2026-11-27', 1, dailySeats(), 0)
  const b = dealDaily('2026-11-27', 1, dailySeats(), 0)
  const c = dealDaily('2026-11-28', 1, dailySeats(), 0)
  assert.deepEqual(a.seats[0].cards, b.seats[0].cards)
  assert.notDeepEqual(a.deck, c.deck)
})

test('fake or broken scores are caught', () => {
  const { moves } = play('2026-11-27', 'd')
  // the same moves on another day don't fit
  assert.equal(replay('2026-11-28', moves).ok, false)
  // a doctored move
  const list = moves.split(',')
  const i = list.findIndex((m) => m === 'c')
  if (i >= 0) {
    list[i] = 'k'
    assert.equal(replay('2026-11-27', list.join(',')).ok, false)
  }
  assert.equal(replay('2026-11-27', `${moves},c`).ok, false)
  assert.equal(replay('2026-11-27', 'zzz').ok, false)
})
