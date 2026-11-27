// Spot the Bluff: today's one-decision puzzle. Read the story, watch the face,
// call or fold — then their cards turn over. One answer a day, a streak, and
// an emoji line to share.
import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { dayKey } from '../game/daily'
import { makePuzzle } from '../game/puzzle'
import { Avatar, type Cue } from './Avatar'
import { CardFace, PlayingCard } from './Card'
import { money } from './Chips'

interface Record {
  days: { [day: string]: { call: boolean; right: boolean } }
}
const load = (): Record => {
  try {
    return JSON.parse(localStorage.getItem('msclub-puzzles') || '{"days":{}}') as Record
  } catch {
    return { days: {} }
  }
}
const save = (r: Record) => {
  try {
    localStorage.setItem('msclub-puzzles', JSON.stringify(r))
  } catch {
    /* private mode */
  }
}
/** Days in a row answered right, ending today (or yesterday). */
function streak(r: Record, today: string): number {
  let n = 0
  const d = new Date(`${today}T12:00:00Z`)
  if (!r.days[today]) d.setUTCDate(d.getUTCDate() - 1)
  for (;;) {
    const k = dayKey(d)
    if (!r.days[k]?.right) return n
    n++
    d.setUTCDate(d.getUTCDate() - 1)
  }
}

export const puzzleDone = (day = dayKey()) => load().days[day] ?? null

export function PuzzleScreen({ onLeave }: { onLeave: () => void }) {
  const day = useMemo(() => dayKey(), [])
  const p = useMemo(() => makePuzzle(day), [day])
  const [rec, setRec] = useState(load)
  const done = rec.days[day]
  const [cue, setCue] = useState<Cue | undefined>()
  const [copied, setCopied] = useState(false)

  // the bettor's face while you decide: their tell shows, about as honestly as at Normal
  useEffect(() => {
    if (!p || done) return
    const honest = p.character.tell.when === 'bluff' ? p.bluff : p.character.tell.when === 'strong' ? !p.bluff : p.bluff
    const show = Math.random() < (honest ? p.character.tell.honest : 0.12)
    if (!show) return
    const t = setInterval(() => setCue({ kind: p.character.tell.cue, id: Date.now() }), 3800)
    setTimeout(() => setCue({ kind: p.character.tell.cue, id: Date.now() }), 1200)
    return () => clearInterval(t)
  }, [p, done])

  if (!p) return <p className="p-8 text-center text-cream/60">No puzzle today — come back tomorrow.</p>

  const answer = (call: boolean) => {
    const next = { days: { ...rec.days, [day]: { call, right: call === p.call } } }
    save(next)
    setRec(next)
  }
  const s = streak(rec, day)
  const share = `MS Club · Spot the Bluff #${p.number} ${done?.right ? '✅' : '❌'}${s > 1 ? ` 🔥${s}` : ''}\nCan you read ${p.character.name}? ${location.origin}${location.pathname}#/puzzle`

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-5 pb-16 pt-6">
        <button onClick={onLeave} className="text-[14px] text-cream/60 hover:text-gold">← Lobby</button>
        <p className="mt-6 text-[13px] font-semibold uppercase tracking-[0.16em] text-cream/50">Daily puzzle #{p.number}</p>
        <h1 className="font-display text-5xl text-cream">
          Spot the <span className="text-gold">Bluff</span>
        </h1>

        <div className="mt-6 rounded-3xl border border-white/10 bg-[radial-gradient(ellipse_at_50%_30%,#1b8a63,#0a3a2c_70%)] p-5 shadow-2xl">
          <div className="flex items-center gap-4">
            <Avatar look={p.character.look} mood={done ? (done.right ? 'sad' : 'smug') : 'calm'} size={92} cue={cue} />
            <div className="min-w-0 flex-1">
              <p className="font-display text-2xl text-cream">{p.character.name}</p>
              <p className="text-[15px] text-cream/80">
                bets <strong className="text-gold">{money(p.bet)}</strong> into a pot of {money(p.pot)} on the river.
              </p>
            </div>
          </div>
          {/* their cards */}
          <div className="relative mx-auto mt-4 h-[96px] w-[150px]">
            {p.theirs.map((c, i) => (
              <PlayingCard key={c} card={c} faceUp={!!done} at={{ x: 45 + i * 60, y: 48 }} size={[64, 90]} from={{ x: 75, y: -80 }} rotate={i ? 4 : -4} />
            ))}
          </div>
          {/* the board */}
          <div className="mx-auto mt-3 flex w-full max-w-[420px] justify-center gap-[2%]">
            {p.board.map((c, i) => (
              <motion.div key={c} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="aspect-[5/7] w-[18%] overflow-hidden rounded-[7%] bg-white shadow-card">
                <CardFace card={c} />
              </motion.div>
            ))}
          </div>
          {/* your cards */}
          <div className="relative mx-auto mt-3 h-[124px] w-[190px]">
            {p.mine.map((c, i) => (
              <PlayingCard key={c} card={c} faceUp at={{ x: 55 + i * 80, y: 62 }} size={[86, 120]} from={{ x: 95, y: 200 }} rotate={i ? 5 : -5} z={3} />
            ))}
          </div>
          <p className="mt-2 text-center text-[14px] font-semibold text-gold">You have {p.myHand}</p>
        </div>

        <ul className="mt-4 space-y-1 text-[14.5px] text-cream/70">
          {p.story.slice(0, -1).map((l, i) => (
            <li key={i}>· {l}</li>
          ))}
          <li className="text-cream">· {p.character.name} bets {money(p.bet)} on the river. Your move.</li>
        </ul>

        {!done ? (
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button onClick={() => answer(false)} className="btn-dark py-4 text-xl">Fold</button>
            <button onClick={() => answer(true)} className="btn-gold py-4 text-xl">Call {money(p.bet)}</button>
            <p className="col-span-2 text-center text-[13px] text-cream/50">One answer a day. Tip: {p.character.tell.hint.toLowerCase()}</p>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`mt-6 rounded-2xl border p-5 ${done.right ? 'border-[#3fbf7f]/50 bg-[#3fbf7f]/10' : 'border-ruby/50 bg-ruby/10'}`}>
            <p className="font-display text-3xl text-cream">{done.right ? 'Well read! ✅' : 'Not this time ❌'}</p>
            <p className="mt-2 text-[15px] leading-relaxed text-cream/80">
              {p.character.name} had <strong className="text-cream">{p.theirHand}</strong>
              {p.bluff ? ' — a bluff. ' : ' — the real thing. '}
              You had {p.myHand}, so {p.call ? 'calling wins the pot' : 'folding saves your chips'}.
              {done.call !== p.call && (done.call ? ` Your call lost ${money(p.bet)}.` : ` Folding gave up a pot of ${money(p.pot + p.bet)}.`)}
            </p>
            <p className="mt-3 text-[14px] text-cream/60">{s > 0 ? `Streak: ${s} day${s === 1 ? '' : 's'} 🔥` : 'Start a streak tomorrow.'} New puzzle at midnight UTC.</p>
            <button
              onClick={async () => {
                try {
                  if (navigator.share && /Mobi|Android|iPhone/.test(navigator.userAgent)) await navigator.share({ text: share })
                  else await navigator.clipboard.writeText(share)
                  setCopied(true)
                } catch {
                  /* cancelled */
                }
              }}
              className="btn-gold mt-4 w-full py-3"
            >
              {copied ? 'Copied ✓' : 'Share my result'}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
