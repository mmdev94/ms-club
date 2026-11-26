import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rng } from './cards.ts'
import { decide, equity } from './bot.ts'
import { CHARACTERS } from './characters.ts'
import { act, startHand } from './holdem.ts'

test('equity is sensible: aces ~85% heads-up, 72o ~35%, the nuts 100%', () => {
  const r = rng('eq')
  const aa = equity(['As', 'Ah'], [], 1, 3000, r)
  assert.ok(aa > 0.82 && aa < 0.88, `AA ${aa}`)
  const sd = equity(['7c', '2d'], [], 1, 3000, r)
  assert.ok(sd > 0.3 && sd < 0.38, `72o ${sd}`)
  assert.equal(equity(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2d', '3c'], 3, 200, r), 1)
})

test('every character plays whole tables of hands with only legal moves, and replays exactly', () => {
  const play = () => {
    const r = rng('bots')
    let stacks = [2000, 2000, 2000, 2000]
    const log: string[] = []
    for (let h = 0; h < 60 && stacks.filter((x) => x > 0).length > 1; h++) {
      let s = startHand(stacks.map((stack, i) => ({ id: CHARACTERS[i].id, name: CHARACTERS[i].name, stack })), { hand: h, dealer: h % 4, sb: 10, bb: 20, seed: `t${h}` })
      while (s.phase !== 'done') {
        const d = decide(s, CHARACTERS[s.toAct].style, r, 150)
        s = act(s, d.action)
      }
      stacks = s.seats.map((x) => x.stack)
      log.push(stacks.join(','))
    }
    assert.equal(stacks.reduce((a, b) => a + b, 0), 8000)
    return log.join('|')
  }
  assert.equal(play(), play())
})

test('personalities differ: the Maniac puts in far more chips preflop than the Rock', () => {
  const vpip = (id: string) => {
    const c = CHARACTERS.find((x) => x.id === id)!
    const r = rng(`v${id}`)
    let played = 0
    for (let h = 0; h < 150; h++) {
      let s = startHand([{ id: 'a', name: 'a', stack: 2000 }, { id: 'b', name: 'b', stack: 2000 }, { id: 'c', name: 'c', stack: 2000 }], { hand: h, dealer: 2, sb: 10, bb: 20, seed: `p${h}` })
      s = act(s, { type: 'raise', to: 60 }) // seat 2 raises; seat 0 (our bot, small blind) decides
      const d = decide(s, c.style, r, 150)
      if (d.action.type !== 'fold') played++
    }
    return played / 150
  }
  const rock = vpip('rock')
  const maniac = vpip('maniac')
  assert.ok(maniac > rock + 0.25, `maniac ${maniac} vs rock ${rock}`)
})
