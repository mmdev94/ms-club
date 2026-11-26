import assert from 'node:assert/strict'
import { test } from 'node:test'
import { learn, think, type Level, type Memory } from './brain.ts'
import { rng } from './cards.ts'
import { CHARACTERS } from './characters.ts'
import { act, startHand } from './holdem.ts'
import { rangeFor, story, tier } from './ranges.ts'

test('pre-flop tiers: aces are premium, 7-2 offsuit is junk', () => {
  assert.equal(tier(['As', 'Ah']), 1)
  assert.equal(tier(['Ks', 'As']), 1)
  assert.equal(tier(['Ac', 'Kd']), 2)
  assert.equal(tier(['7c', '2d']), 8)
})

test('a re-raise narrows the range toward big hands', () => {
  const re = rangeFor([{ seat: 1, street: 'preflop', kind: 'raise', amount: 180, to: 180, potBefore: 90, toCallBefore: 60, raisesBefore: 1, board: [] }], [], 0.3, 0.1)
  const w = (h: string[]) => re.weights[re.hands.findIndex((x) => x.includes(h[0]) && x.includes(h[1]))]
  assert.ok(w(['Ks', 'Kh']) > 20 * w(['7c', '2d']))
})

test('story() rebuilds the public betting with pot sizes', () => {
  let s = startHand([{ id: 'a', name: 'a', stack: 1000 }, { id: 'b', name: 'b', stack: 1000 }, { id: 'c', name: 'c', stack: 1000 }], { hand: 1, dealer: 0, sb: 10, bb: 20, seed: 'st' })
  s = act(s, { type: 'raise', to: 60 })
  s = act(s, { type: 'call' })
  const h = story(s.events)
  assert.deepEqual(h.map((a) => [a.seat, a.kind, a.potBefore, a.toCallBefore, a.raisesBefore]), [
    [0, 'raise', 30, 20, 0],
    [1, 'call', 90, 50, 1],
  ])
})

test('every level plays only legal moves, keeps chips, and replays exactly', () => {
  for (const level of ['easy', 'normal', 'hard'] as Level[]) {
    const run = () => {
      const random = rng(`lv-${level}`)
      const memory: Memory = new Map()
      const ids = CHARACTERS.map((c) => c.id)
      let stacks = [2000, 2000, 2000, 2000]
      const log: number[] = []
      for (let h = 0; h < 40; h++) {
        let s = startHand(stacks.map((stack, i) => ({ id: ids[i], name: ids[i], stack: stack || 2000 })), { hand: h, dealer: h % 4, sb: 10, bb: 20, seed: `lv${h}` })
        const total = s.seats.reduce((a, x) => a + x.stack + x.bet, 0) + s.pot
        while (s.phase !== 'done') s = act(s, think(s, CHARACTERS[s.toAct], level, random, memory, ids).action)
        learn(memory, ids, s.events)
        assert.equal(s.seats.reduce((a, x) => a + x.stack, 0), total)
        stacks = s.seats.map((x) => x.stack)
        log.push(...stacks)
      }
      assert.ok(memory.get('shark')!.hands > 0)
      return log.join(',')
    }
    assert.equal(run(), run(), `${level} replays`)
  }
})
