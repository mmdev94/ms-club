// Casino chips, drawn here (no image files): a stack sized by the amount, in
// the classic colours by value.
import { motion } from 'framer-motion'
import type { Pt } from './layout'

const DENOMS: [number, string, string][] = [
  [1000, '#16161a', '#e8c36a'],
  [500, '#6b2fa3', '#f2ecff'],
  [100, '#1d1d24', '#f6efe2'],
  [25, '#1f8a4c', '#f6efe2'],
  [5, '#c8323f', '#f6efe2'],
  [1, '#f6efe2', '#2b6cb0'],
]

/** The chips to show for an amount: up to 8, biggest first. */
export function breakdown(amount: number): [string, string][] {
  const out: [string, string][] = []
  let left = amount
  for (const [v, c, edge] of DENOMS) {
    while (left >= v && out.length < 8) {
      out.push([c, edge])
      left -= v
    }
  }
  return out.length ? out : [[DENOMS[5][1], DENOMS[5][2]]]
}

export function Chip({ color, edge, size = 26 }: { color: string; edge: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="19" fill={color} stroke="rgba(0,0,0,.35)" strokeWidth="1" />
      <circle cx="20" cy="20" r="15" fill="none" stroke={edge} strokeWidth="5" strokeDasharray="5.2 6.6" />
      <circle cx="20" cy="20" r="10.5" fill={color} stroke={edge} strokeOpacity=".7" strokeWidth="1.2" />
      <circle cx="20" cy="20" r="6" fill="none" stroke={edge} strokeOpacity=".35" strokeWidth="1" />
    </svg>
  )
}

export const money = (n: number) => n.toLocaleString('en-US')

/** A stack of chips with its amount, at a point on the table. */
export function ChipStack({ amount, at, label = true, size = 26 }: { amount: number; at: Pt; label?: boolean; size?: number }) {
  const chips = breakdown(amount)
  return (
    <motion.div
      className="pointer-events-none absolute flex flex-col items-center"
      style={{ left: at.x, top: at.y, x: '-50%', y: '-50%' }}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 24 }}
    >
      <div className="relative" style={{ width: size, height: size + chips.length * 3.5 }}>
        {chips.map(([c, e], i) => (
          <div key={i} className="absolute left-0" style={{ bottom: i * 3.5, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.45))' }}>
            <Chip color={c} edge={e} size={size} />
          </div>
        ))}
      </div>
      {label && <span className="mt-1 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[13px] font-semibold text-cream">{money(amount)}</span>}
    </motion.div>
  )
}

/** Chips sliding from one point to another (bets into the pot, the pot to the winner). */
export function FlyingChips({ from, to, amount, delay = 0, onDone }: { from: Pt; to: Pt; amount: number; delay?: number; onDone?: () => void }) {
  const chips = breakdown(amount).slice(0, 5)
  return (
    <>
      {chips.map(([c, e], i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute"
          style={{ left: from.x - 13, top: from.y - 13, zIndex: 40 }}
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: to.x - from.x, y: to.y - from.y, opacity: [1, 1, 0.9] }}
          transition={{ duration: 0.6, ease: [0.3, 0.7, 0.2, 1], delay: delay + i * 0.05 }}
          onAnimationComplete={i === chips.length - 1 ? onDone : undefined}
        >
          <Chip color={c} edge={e} />
        </motion.div>
      ))}
    </>
  )
}
