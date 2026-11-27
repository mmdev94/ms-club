// Mind-read: after a hand, see inside a regular's head — each decision with
// its win chance and reason, their cards, and a 13×13 map of the hands they
// put you on (the same hand-reading model the Hard regulars play with).
import { motion } from 'framer-motion'
import { useMemo } from 'react'
import type { Level } from '../engine/brain'
import { RANKS } from '../engine/cards'
import type { State } from '../engine/holdem'
import { rangeFor, story } from '../engine/ranges'
import { equity } from '../engine/bot'
import type { Player, Thought } from '../game/useGame'
import { Avatar, PLAYER_LOOK } from './Avatar'
import { CardFace } from './Card'
import { money } from './Chips'

const ORDER = [...RANKS].reverse() // A K Q … 2
const STREET: Record<string, string> = { preflop: 'Before the flop', flop: 'Flop', turn: 'Turn', river: 'River', done: 'End' }
const VERB: Record<string, string> = { fold: 'folded', check: 'checked', call: 'called', bet: 'bet', raise: 'raised to', allin: 'went all in for' }

/** The average weight of the two-card hands in each of the 169 starting-hand cells (AA, AKs, AKo…), so cells with more combinations don't look likelier. */
export function grid(hands: string[][], weights: number[]): number[][] {
  const g = ORDER.map(() => ORDER.map(() => 0))
  const n = ORDER.map(() => ORDER.map(() => 0))
  hands.forEach((h, i) => {
    const a = ORDER.indexOf(h[0][0])
    const b = ORDER.indexOf(h[1][0])
    const suited = h[0][1] === h[1][1]
    const hi = Math.min(a, b)
    const lo = Math.max(a, b)
    // suited above the diagonal, offsuit below, pairs on it
    const [r, c] = a === b ? [a, a] : suited ? [hi, lo] : [lo, hi]
    g[r][c] += weights[i]
    n[r][c]++
  })
  return g.map((row, r) => row.map((w, c) => (n[r][c] ? w / n[r][c] : 0)))
}

const label = (r: number, c: number) => (r === c ? `${ORDER[r]}${ORDER[c]}` : r < c ? `${ORDER[r]}${ORDER[c]}s` : `${ORDER[c]}${ORDER[r]}o`)

export function MindRead({ engine, seat, players, thoughts, level, onClose }: { engine: State; seat: number; players: Player[]; thoughts: Thought[]; level: Level; onClose: () => void }) {
  const p = players[seat]
  const me = players.findIndex((x) => x.kind === 'me')
  const mine = thoughts.filter((t) => t.seat === seat)
  const bot = engine.seats[seat]
  // before the flop the regulars go by a hand chart, so show the hand's real win chance instead
  const preflop = useMemo(() => {
    const dealt = engine.seats.filter((x) => !x.out).length
    return { vs: dealt - 1, eq: equity(bot.cards, [], Math.max(1, dealt - 1), 1500, Math.random) }
  }, [engine, bot.cards])
  const read = useMemo(() => {
    const seen = story(engine.events).filter((a) => a.seat === me)
    const r = rangeFor(seen, [...bot.cards, ...engine.board], 0.4, 0.25)
    const g = grid(r.hands, r.weights)
    const max = Math.max(...g.flat())
    const total = g.flat().reduce((a, b) => a + b, 0)
    const top = g
      .flatMap((row, i) => row.map((w, j) => ({ w, name: label(i, j) })))
      .sort((a, b) => b.w - a.w)
      .slice(0, 6)
      .map((x) => x.name)
    return { g, max, total, top }
  }, [engine, me, bot.cards])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-3" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#15121c] p-5 text-left shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4">
          <Avatar look={p.character?.look ?? p.look ?? PLAYER_LOOK} mood="smug" size={64} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-cream/50">Mind-read · hand {engine.hand}</p>
            <p className="font-display text-3xl text-cream">Inside {p.name}’s head</p>
          </div>
          <div className="flex gap-1.5" aria-label={`${p.name}'s cards`}>
            {bot.cards.map((c) => (
              <div key={c} className="h-[70px] w-[50px] overflow-hidden rounded-[6px] bg-white shadow-card">
                <CardFace card={c} />
              </div>
            ))}
          </div>
        </div>

        <ol className="mt-5 space-y-2">
          {mine.length === 0 && <li className="text-cream/60">{p.name} didn’t have to decide anything this hand.</li>}
          {mine.map((t, i) => (
            <li key={i} className="flex gap-3 rounded-xl bg-white/[.04] p-3">
              <span className="w-[92px] shrink-0 text-[12.5px] font-semibold uppercase tracking-wide text-gold/80">{STREET[t.street] ?? t.street}</span>
              <span className="min-w-0 flex-1 text-[14.5px] leading-snug text-cream/85">
                <strong className="text-cream">
                  {VERB[t.kind] ?? t.kind}
                  {t.kind === 'raise' || t.kind === 'bet' || t.kind === 'allin' ? ` ${money(t.to)}` : ''}
                </strong>{' '}
                — {t.why || 'went with the numbers'}.
                <span className="mt-1 flex items-center gap-2 text-[12.5px] text-cream/55">
                  <span className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
                    <span className="block h-full rounded-full bg-gold" style={{ width: `${Math.round((t.street === 'preflop' ? preflop.eq : t.equity) * 100)}%` }} />
                  </span>
                  {t.street === 'preflop'
                    ? `this hand wins ${Math.round(preflop.eq * 100)}% against ${preflop.vs} random ${preflop.vs === 1 ? 'hand' : 'hands'}`
                    : `thought it would win ${Math.round(t.equity * 100)}%`}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-6">
          <p className="font-display text-xl text-cream">What {p.name} put you on</p>
          <p className="mt-1 text-[13.5px] leading-snug text-cream/60">
            Darker = more likely, from your bets this hand. Most likely: <span className="font-mono text-gold">{read.top.join(' · ')}</span>.
            {level !== 'hard' && ' The regulars only act on this read at Hard.'}
          </p>
          <div className="mt-3 grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }} role="img" aria-label="A 13 by 13 map of starting hands, shaded by how likely the regular thought you held each">
            {read.g.map((row, i) =>
              row.map((w, j) => {
                const v = read.max ? w / read.max : 0
                return (
                  <span
                    key={`${i}-${j}`}
                    title={`${label(i, j)}: ${Math.round(v * 100)}% as likely as their top guess`}
                    className="grid aspect-square place-items-center rounded-[3px] font-mono text-[9px] sm:text-[10.5px]"
                    style={{ background: `rgba(232,195,106,${0.06 + v * 0.94})`, color: v > 0.55 ? '#16161a' : 'rgba(246,239,226,.55)' }}
                  >
                    {label(i, j)}
                  </span>
                )
              }),
            )}
          </div>
          <p className="mt-2 text-[12px] text-cream/45">Pairs on the diagonal, suited hands above it, offsuit below.</p>
        </div>
        <button onClick={onClose} className="btn-light mt-5 w-full">Close</button>
      </motion.div>
    </div>
  )
}
