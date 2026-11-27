// Replays leaderboard entries off the main thread, so the page stays smooth.
import { replay } from '../game/daily'

self.onmessage = (e: MessageEvent<{ id: string; day: string; moves: string }>) => {
  const { id, day, moves } = e.data
  const r = replay(day, moves)
  ;(self as unknown as Worker).postMessage({ id, ...r })
}
