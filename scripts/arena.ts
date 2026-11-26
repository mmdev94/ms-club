// Measures the levels against each other. Each match plays the same decks
// twice with the seats swapped ("duplicate"), so card luck cancels out.
// Stacks reset to 100 big blinds every hand. Result: big blinds won per 100 hands.
//
//   node --experimental-strip-types scripts/arena.ts [hands] [character]
import { think, learn, type Level, type Memory } from '../src/engine/brain.ts'
import { rng } from '../src/engine/cards.ts'
import { CHARACTERS } from '../src/engine/characters.ts'
import { act, legal, startHand, type Action, type State } from '../src/engine/holdem.ts'

const HANDS = Number(process.argv[2] ?? 1000)
const who = CHARACTERS.find((c) => c.id === (process.argv[3] ?? 'shark'))!
const BB = 20

// two human habits, played by simple scripts
type Seat = Level | 'station' | 'folder'
function scripted(kind: 'station' | 'folder', s: State, random: () => number): Action {
  const l = legal(s)!
  if (kind === 'station') return { type: l.canCheck ? 'check' : 'call' } // calls everything, never bets
  // folds to any bet after the flop unless it has a strong hand; otherwise plays normally-ish
  if (s.phase === 'preflop') return random() < 0.5 ? { type: l.canCheck ? 'check' : 'call' } : { type: l.canCheck ? 'check' : 'fold' }
  return { type: l.canCheck ? 'check' : 'fold' }
}

/** A seats `table` levels around the table; returns chips won per level over `hands` deals, played twice with seats rotated. */
function match(levels: Seat[], hands: number, tag: string): Record<string, number> {
  const won: Record<string, number> = {}
  const n = levels.length
  for (let rot = 0; rot < n; rot++) {
    const seatLevel = levels.map((_, i) => levels[(i + rot) % n])
    const ids = seatLevel.map((l, i) => `${l}-${(i + rot) % n}`)
    const memory: Memory = new Map()
    const random = rng(`${tag}:${rot}`)
    for (let h = 0; h < hands; h++) {
      let s = startHand(ids.map((id) => ({ id, name: id, stack: 100 * BB })), { hand: h, dealer: h % n, sb: BB / 2, bb: BB, seed: `${tag}:deal:${h}` })
      let guard = 0
      while (s.phase !== 'done' && guard++ < 100) {
        const lv = seatLevel[s.toAct]
        s = act(s, lv === 'station' || lv === 'folder' ? scripted(lv, s, random) : think(s, who, lv, random, memory, ids).action)
      }
      learn(memory, ids, s.events)
      s.seats.forEach((x, i) => (won[seatLevel[i]] = (won[seatLevel[i]] ?? 0) + x.stack - 100 * BB))
    }
  }
  return won
}

const bb100 = (chips: number, hands: number) => ((chips / BB / hands) * 100).toFixed(1)
const t0 = Date.now()
console.log(`${HANDS} deals per seating, played as ${who.name} on every seat, duplicate.\n`)
for (const [a, b] of [['normal', 'easy'], ['hard', 'easy'], ['hard', 'normal']] as [Level, Level][]) {
  const r = match([a, b], HANDS, `${a}-${b}`)
  console.log(`heads-up   ${a.padEnd(6)} vs ${b.padEnd(6)}: ${a} ${bb100(r[a], HANDS * 2)} bb/100`)
}
for (const habit of ['station', 'folder'] as const) {
  const line = (['easy', 'normal', 'hard'] as Level[]).map((l) => `${l} ${bb100(match([l, habit], HANDS, `${l}-${habit}`)[l], HANDS * 2)}`).join('   ')
  console.log(`vs a player who ${habit === 'station' ? 'calls everything' : 'folds to every bet'}: ${line}  (bb/100)`)
}
const r = match(['hard', 'normal', 'easy', 'hard', 'normal', 'easy'].slice(0, 5) as Level[], Math.round(HANDS / 2), 'ring')
console.log(`5 players  hard, normal, easy, hard, normal (each seat rotation):`)
for (const l of ['hard', 'normal', 'easy']) console.log(`   ${l.padEnd(6)} ${r[l] >= 0 ? '+' : ''}${Math.round(r[l] / BB)} bb total`)
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`)
