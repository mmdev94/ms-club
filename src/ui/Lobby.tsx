import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { LEVELS, type Level } from '../engine/brain'
import { CHARACTERS } from '../engine/characters'
import { Avatar } from './Avatar'
import { playedToday } from './Daily'
import { FacePicker } from './Face'
import { puzzleDone } from './Puzzle'
import { puzzleNumber } from '../game/puzzle'
import { dayKey } from '../game/daily'
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

export function Lobby({ face, setFace, name, setName, level, setLevel, onPlay, onHost, onDaily, onBoard, onPuzzle }: { face?: string; setFace: (f: string | undefined) => void; name: string; setName: (n: string) => void; level: Level; setLevel: (l: Level) => void; onPlay: () => void; onHost: () => void; onDaily: () => void; onBoard: () => void; onPuzzle: () => void }) {
  const servedBy = useServedBy()
  const played = playedToday()
  const puzzle = puzzleDone()
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
          <FacePicker name={name} face={face} setFace={setFace} />
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
            Play the regulars
          </button>
          <button onClick={onHost} className="btn-dark py-3.5 text-lg">
            Play with friends
          </button>
          <p className="text-[13px] leading-relaxed text-cream/45">Opens a private table and gives you a link. Friends join from any browser — no account. The regulars fill empty seats.</p>
          <div className="mt-3 rounded-2xl border border-gold/35 bg-gradient-to-b from-gold/10 to-transparent p-4 text-left">
            <p className="flex items-center justify-between">
              <span className="font-display text-2xl text-cream">Daily Table</span>
              <span className="rounded-full bg-gold/20 px-2.5 py-0.5 text-[12px] font-semibold text-gold">{played === null ? 'new today' : `today ${played >= 2000 ? '+' : '−'}${Math.abs(played - 2000).toLocaleString('en-US')}`}</span>
            </p>
            <p className="mt-1 text-[14px] leading-snug text-cream/65">20 hands, same cards for everyone today. Post your score — every score is replayed and checked.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={onDaily} className="btn-gold py-2.5 text-[15px]">{played === null ? 'Play today' : 'Practice'}</button>
              <button onClick={onBoard} className="btn-dark py-2.5 text-[15px]">Leaderboard</button>
            </div>
          </div>
          <button onClick={onPuzzle} className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/[.04] p-4 text-left hover:border-gold/50">
            <span className="text-3xl" aria-hidden>🕵️</span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-xl text-cream">Spot the Bluff #{puzzleNumber(dayKey())}</span>
              <span className="block text-[13.5px] text-cream/60">{puzzle ? (puzzle.right ? 'Solved today ✅ — see you tomorrow' : 'Missed today ❌ — new one tomorrow') : 'One river bet. Call or fold? 10 seconds a day.'}</span>
            </span>
            <span className="text-gold">→</span>
          </button>
        </div>

        <h2 className="mt-16 font-display text-3xl text-cream">Meet the regulars</h2>
        <p className="mt-2 max-w-[56ch] text-[15px] text-cream/60">Each one has a tell — a little habit that gives their hand away. Learn it and you win more. And watch their faces: after a bad beat they go on tilt and play wild.</p>
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
              <p className="mt-3 text-[12.5px] leading-snug text-cream/50">
                <span className="font-semibold text-cream/70">Tell:</span> {c.tell.hint}
              </p>
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
