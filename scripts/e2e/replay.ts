// node --experimental-strip-types scripts/e2e/replay.ts '<json from daily.cjs>'
import { replay } from '../../src/game/daily.ts'
const r = JSON.parse(process.argv[2]) as { day: string; moves: string; final: number }
const x = replay(r.day, r.moves)
console.log(x.ok && x.final === r.final ? `✓ replay matches: ${x.final} chips after ${x.hands} hands` : `✗ mismatch: ${JSON.stringify(x)} vs claimed ${r.final}`)
