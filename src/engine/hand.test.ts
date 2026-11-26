import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describe as say, shortName } from './hand.ts'

test('hands in words', () => {
  assert.equal(say(['Kh', 'Kd', '2c', '7s', '9h', 'Jd', '4c']), 'a pair of Kings')
  assert.equal(say(['Ah', 'Ad', '7c', '7s', '9h', 'Jd', '4c']), 'two pair, Aces and Sevens')
  assert.equal(say(['6h', '6d', '6c', '7s', '9h', 'Jd', '4c']), 'three Sixes')
  assert.equal(say(['5h', '6d', '7c', '8s', '9h', 'Jd', '2c']), 'a straight to the Nine')
  assert.equal(say(['Ah', '2d', '3c', '4s', '5h', 'Jd', '9c']), 'a straight to the Five')
  assert.equal(say(['Ah', '2h', '9h', '4h', 'Jh', 'Jd', '9c']), 'an Ace-high flush')
  assert.equal(say(['Qh', 'Qd', 'Qc', '4s', '4h', 'Jd', '9c']), 'a full house, Queens full of Fours')
  assert.equal(say(['9h', '9d', '9c', '9s', '4h', 'Jd', '2c']), 'four Nines')
  assert.equal(say(['Ts', 'Js', 'Qs', 'Ks', 'As', '2d', '3c']), 'a royal flush')
  assert.equal(say(['Ah', 'Kd', '9c', '4s', '2h', 'Jd', '7c']), 'Ace high')
  assert.equal(shortName(['Kh', 'Kd', '2c', '7s', '9h', 'Jd', '4c']), 'Pair of Kings')
  assert.equal(shortName(['Qh', 'Qd', 'Qc', '4s', '4h', 'Jd', '9c']), 'Full house')
})
