import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { LEVELS, type Level } from '../engine/brain'
import { CHARACTERS } from '../engine/characters'
import { Avatar } from './Avatar'
import { PlayingCard } from './Card'

/** "Delivered by a miner": this page reads its own answer from ms.computer. */
function useServedBy() {
  const [by, setBy] = useState<string | null>(null)
  useEffect(() => {
    if (!location.hostname.endsWith('.ms.computer')) return
    fetch(location.pathname, { method: 'HEAD', cache: 'no-store' })
      .then((r) => setBy(r.headers.get('x-ms-edge-upstream')))
      .catch(() => {})
  }, [])
  return by
}

const FAN = ['As', 'Kh', 'Qd', 'Jc', 'Ts']

export function Lobby({ name, setName, level, setLevel, onPlay }: { name: string; setName: (n: string) => void; level: Level; setLevel: (l: Level) => void; onPlay: () => void }) {
  const servedBy = useServedBy()
  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(91,42,134,.55),transparent_60%),radial-gradient(ellipse_at_50%_100%,rgba(15,92,69,.5),transparent_55%)]" />
      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-5 pb-16 pt-12 text-center md:pt-16">
        {/* a fanned royal flush */}
        <div className="relative h-[170px] w-[320px]">
          {FAN.map((c, i) => (
            <PlayingCard key={c} card={c} faceUp at={{ x: 160 + (i - 2) * 46, y: 96 + Math.abs(i - 2) * 9 }} size={[86, 120]} from={{ x: 160, y: 300 }} rotate={(i - 2) * 9} delay={0.15 + i * 0.09} z={i} />
          ))}
        </div>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-4 font-display text-[clamp(3rem,10vw,5.6rem)] leading-none text-cream">
          MS <span className="text-gold">Club</span>
        </motion.h1>
        <p className="mt-4 max-w-[34ch] text-lg text-cream/75">Texas Hold’em with the regulars. No sign-up, no download, no real money — just chips and bragging rights.</p>

        <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
          <label className="text-left text-[13px] font-semibold uppercase tracking-[0.14em] text-cream/50" htmlFor="name">
            Your name at the table
          </label>
          <input
            id="name"
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-lg text-cream outline-none focus:border-gold"
          />
          <p className="mt-2 text-left text-[13px] font-semibold uppercase tracking-[0.14em] text-cream/50">How good are the regulars?</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Difficulty">
            {LEVELS.map((x, i) => (
              <button
                key={x.id}
                role="radio"
                aria-checked={level === x.id}
                onClick={() => setLevel(x.id)}
                className={`rounded-xl border px-2 py-2.5 text-center transition ${level === x.id ? 'border-gold bg-gold/15 text-gold' : 'border-white/15 text-cream/70 hover:border-white/35'}`}
              >
                <span className="block font-semibold">{x.name}</span>
                <span className="mt-1 flex justify-center gap-1" aria-hidden>
                  {[0, 1, 2].map((k) => (
                    <span key={k} className={`h-1.5 w-4 rounded-full ${k <= i ? (level === x.id ? 'bg-gold' : 'bg-cream/60') : 'bg-white/15'}`} />
                  ))}
                </span>
              </button>
            ))}
          </div>
          <p className="min-h-[40px] text-left text-[14px] leading-snug text-cream/60">{LEVELS.find((x) => x.id === level)?.blurb}</p>
          <button onClick={onPlay} className="btn-gold py-3.5 text-lg">
            Take a seat
          </button>
          <div className="flex gap-2 text-[13px] text-cream/50">
            <span className="flex-1 rounded-lg border border-white/10 px-3 py-2">Daily Table · soon</span>
            <span className="flex-1 rounded-lg border border-white/10 px-3 py-2">Play with friends · soon</span>
          </div>
        </div>

        <h2 className="mt-16 font-display text-3xl text-cream">Meet the regulars</h2>
        <div className="mt-6 grid w-full grid-cols-2 gap-4 lg:grid-cols-4">
          {CHARACTERS.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.08 }}
              className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[.04] p-5"
            >
              <Avatar look={c.look} mood={i % 2 ? 'smug' : 'happy'} size={104} />
              <p className="mt-4 font-display text-2xl text-cream">{c.name}</p>
              <p className="mt-1 text-[14px] leading-snug text-cream/60">{c.tagline}</p>
              <p className="mt-3 rounded-full bg-black/40 px-3 py-1 text-[13px] italic text-gold/90">“{c.lines.win?.[0] ?? c.lines.raise?.[0]}”</p>
            </motion.div>
          ))}
        </div>

        <footer className="mt-16 max-w-xl text-[13px] leading-relaxed text-cream/40">
          MS Club is a community game, not an official ms.computer product. Play chips only — nothing here is real money.
          <br />
          Hosted on ms.computer{servedBy ? <> · this page was delivered by {servedBy === 'replica' ? 'a miner’s replica' : `the ${servedBy}`}</> : null}. Cards: Adrian Kennard (CC0). Faces: Lorelei by Lisa Wischofsky (CC0).
        </footer>
      </div>
    </div>
  )
}
