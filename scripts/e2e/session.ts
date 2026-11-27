// Prints a valid Daily Table session (moves + final chips) for a given day, played by a simple scripted player.
//   node --experimental-strip-types scripts/e2e/session.ts 2000-01-01
import type { Memory } from '../../src/engine/brain.ts'
import { act, legal } from '../../src/engine/holdem.ts'
import { botRandom, DAILY_HANDS, dailyBotMove, dailySeats, dealDaily, encode, nextDealer, tiltAfter, topUp } from '../../src/game/daily.ts'
const day = process.argv[2]
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
      const a = l.canCheck ? ({ type: 'check' } as const) : ({ type: 'fold' } as const)
      moves.push(encode(a))
      s = act(s, a)
    } else s = act(s, dailyBotMove(s, random, memory, tilt[s.toAct]))
  }
  seats = s.seats.map((x) => ({ id: x.id, name: x.name, stack: x.stack }))
  tilt = tiltAfter(tilt, start, seats.map((x) => x.stack))
}
console.log(JSON.stringify({ day, moves: moves.join(','), final: seats[0].stack }))
