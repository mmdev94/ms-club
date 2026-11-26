import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commit, deckFromSeed, randomSecret, seedFrom, verify, type FairRecord } from './fair.ts'
import { act, startHand } from './holdem.ts'

test('deckFromSeed: a full deck, the same for the same seed, different for another', async () => {
  const a = await deckFromSeed('abc')
  assert.equal(new Set(a).size, 52)
  assert.deepEqual(a, await deckFromSeed('abc'))
  assert.notDeepEqual(a, await deckFromSeed('abd'))
})

test('the shuffle is unbiased enough: the ace of spades lands everywhere', async () => {
  const where = new Array(52).fill(0)
  for (let i = 0; i < 2600; i++) where[(await deckFromSeed(`s${i}`)).indexOf('As')]++
  assert.ok(Math.min(...where) > 20 && Math.max(...where) < 90, `${Math.min(...where)}..${Math.max(...where)}`)
})

async function playedHand() {
  const host = randomSecret()
  const ana = randomSecret()
  const r: FairRecord = { hand: 3, seal: await commit(host) }
  const friends = [{ id: 'ana', name: 'Ana', secret: ana }]
  const seed = await seedFrom(3, host, friends)
  const deck = await deckFromSeed(seed)
  const stacks = [1000, 1000, 1000]
  let s = startHand(stacks.map((stack, i) => ({ id: `p${i}`, name: '', stack })), { hand: 3, dealer: 1, sb: 10, bb: 20, deck })
  while (s.phase !== 'done') s = act(s, { type: s.currentBet > s.seats[s.toAct].bet ? 'call' : 'check' })
  return { r: { ...r, hostSecret: host, friends, seed }, s, ana, stacks }
}

test('verify: an honest hand passes every check', async () => {
  const { r, s, ana, stacks } = await playedHand()
  const c = await verify(r, { mySecret: ana, myId: 'ana', stacks, dealer: 1, sb: 10, bb: 20, seen: [{ seat: 2, cards: s.seats[2].cards }, { seat: 0, cards: s.seats[0].cards }], board: s.board })
  assert.equal(c.ok, true, c.lines.join('\n'))
  assert.equal(c.lines.length, 4)
})

test('verify: a swapped secret, a dropped friend or a stacked card is caught', async () => {
  const { r, s, ana, stacks } = await playedHand()
  const base = { mySecret: ana, myId: 'ana', stacks, dealer: 1, sb: 10, bb: 20, seen: [{ seat: 2, cards: s.seats[2].cards }], board: s.board }
  assert.equal((await verify({ ...r, hostSecret: randomSecret() }, base)).ok, false, 'host changed its secret')
  assert.equal((await verify({ ...r, friends: [] }, base)).ok, false, 'my secret left out')
  const stacked = [...s.board]
  stacked[4] = stacked[4] === 'As' ? 'Ks' : 'As'
  assert.equal((await verify(r, { ...base, board: stacked })).ok, false, 'a card that the shuffle did not deal')
})
