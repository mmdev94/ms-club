import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makePuzzle, puzzleNumber } from './puzzle.ts'

test('a puzzle every day, the same for everyone, about half of them bluffs', () => {
  const days = ['2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04']
  const t0 = Date.now()
  const ps = days.map((d) => makePuzzle(d))
  const ms = (Date.now() - t0) / days.length
  for (const p of ps) assert.ok(p, 'found a puzzle')
  assert.deepEqual(makePuzzle(days[0]), ps[0], 'same day, same puzzle')
  const bluffs = ps.filter((p) => p!.bluff).length
  assert.ok(bluffs >= 2 && bluffs <= 6, `bluffs ${bluffs}/8`)
  assert.equal(puzzleNumber('2026-11-27'), 1)
  assert.ok(ms < 1500, `took ${ms} ms per puzzle`)
  console.log(`avg ${ms.toFixed(0)} ms;`, ps.map((p) => `#${p!.number} ${p!.character.name} ${p!.bluff ? 'bluff' : 'value'} (${p!.myHand} vs ${p!.theirHand})`).join('; '))
})
