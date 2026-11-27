import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { DAILY_HANDS, DAILY_STACK, dayKey } from '../game/daily'
import { lookFor } from '../game/looks'
import { rank, useBoard } from '../game/useBoard'
import { useGame } from '../game/useGame'
import { myPubkey, post } from '../net/board'
import { Avatar } from './Avatar'
import { money } from './Chips'
import { Controls } from './Controls'
import { Table } from './Table'

const load = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* private mode */
  }
}
export const playedToday = (day = dayKey()) => {
  const v = load(`msclub-daily:${day}`)
  return v === null ? null : Number(v)
}
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`
const pretty = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

// ── playing today's table ─────────────────────────────────────────────────────

export function DailyScreen({ name, onLeave, onBoard }: { name: string; onLeave: () => void; onBoard: () => void }) {
  const day = useMemo(() => dayKey(), [])
  const practice = useMemo(() => playedToday(day) !== null, [day])
  const game = useGame({ name, level: 'normal', look: lookFor(name), daily: day })
  const d = game.daily!
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-4 py-2.5">
        <button onClick={onLeave} className="text-[14px] text-cream/60 hover:text-gold">← Lobby</button>
        <p className="font-display text-xl text-cream">
          Daily <span className="text-gold">Table</span>
        </p>
        <p className="font-mono text-[13px] text-cream/50">
          {pretty(day)} · hand {Math.min(DAILY_HANDS, game.view.hand)}/{DAILY_HANDS}
        </p>
      </header>
      <div className="relative min-h-0 flex-1">
        <Table game={game} />
        {d.over && <Result day={day} final={d.final} moves={d.moves} hands={d.played} name={name} practice={practice} onBoard={onBoard} onLeave={onLeave} />}
      </div>
      {!d.over && <Controls game={game} />}
    </div>
  )
}

function Result({ day, final, moves, hands, name, practice, onBoard, onLeave }: { day: string; final: number; moves: string; hands: number; name: string; practice: boolean; onBoard: () => void; onLeave: () => void }) {
  const score = final - DAILY_STACK
  ;(window as unknown as { __msclubDaily?: unknown }).__msclubDaily = { day, moves, final, hands }
  const [state, setState] = useState<'idle' | 'posting' | 'posted' | 'failed'>('idle')
  const [copied, setCopied] = useState(false)
  if (!practice && load(`msclub-daily:${day}`) === null) save(`msclub-daily:${day}`, String(final))
  const share = `MS Club · Daily Table ${pretty(day)}: ${signed(score)} chips in ${hands} hands 🃏 ${location.origin}${location.pathname}`
  const send = async () => {
    setState('posting')
    const n = await post({ name, day, moves, final }).catch(() => 0)
    setState(n > 0 ? 'posted' : 'failed')
  }
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl border border-gold/40 bg-[#15121c] p-6 text-center shadow-2xl">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-cream/50">Daily Table · {pretty(day)}</p>
        <p className={`mt-3 font-display text-6xl ${score >= 0 ? 'text-gold' : 'text-ruby'}`}>{signed(score)}</p>
        <p className="mt-2 text-cream/70">
          {final <= 0 ? `Busted after ${hands} hands. The regulars send their regards.` : `${money(final)} chips after ${hands} hands.`}
        </p>
        {practice ? (
          <p className="mt-5 rounded-xl bg-white/5 p-3 text-[14px] text-cream/60">Practice run — you already played today, so this one isn’t posted. New cards tomorrow.</p>
        ) : (
          <div className="mt-5">
            {state === 'idle' && (
              <button onClick={send} className="btn-gold w-full py-3 text-lg">
                Post to today’s board as {name}
              </button>
            )}
            {state === 'posting' && <p className="text-cream/70">Posting to the relays…</p>}
            {state === 'posted' && <p className="text-[#7ee0a8]">✓ Posted. Every visitor’s browser will replay your hands before showing it.</p>}
            {state === 'failed' && (
              <p className="text-ruby">
                No relay accepted it. <button onClick={send} className="underline">Try again</button>
              </p>
            )}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={async () => {
              try {
                if (navigator.share) await navigator.share({ text: share })
                else await navigator.clipboard.writeText(share)
                setCopied(true)
              } catch {
                /* cancelled */
              }
            }}
            className="btn-dark py-2.5 text-[15px]"
          >
            {copied ? 'Copied ✓' : 'Share'}
          </button>
          <button onClick={onBoard} className="btn-light py-2.5 text-[15px]">Leaderboard</button>
        </div>
        <button onClick={onLeave} className="mt-4 text-[14px] text-cream/50 hover:text-gold">Back to the lobby</button>
      </motion.div>
    </div>
  )
}

// ── the leaderboard ───────────────────────────────────────────────────────────

/** Monday … today (UTC) */
function thisWeek(): string[] {
  const now = new Date()
  const dow = (now.getUTCDay() + 6) % 7
  return Array.from({ length: dow + 1 }, (_, i) => dayKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow + i))))
}

export function Board({ onLeave, onPlay, start }: { onLeave: () => void; onPlay: () => void; start?: string }) {
  const [tab, setTab] = useState<'today' | 'week'>('today')
  const [day, setDay] = useState(start ?? dayKey())
  const days = useMemo(() => (tab === 'today' ? [day] : thisWeek()), [tab, day])
  const step = (n: number) => {
    const d = new Date(`${day}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    const k = dayKey(d)
    if (k <= dayKey()) setDay(k)
  }
  const { rows, error, loading, reload } = useBoard(days)
  const me = useMemo(() => myPubkey(), [])
  const ranked = rows ? rank(rows) : []
  const checking = rows?.filter((r) => r.status === 'checking').length ?? 0
  const rejected = rows?.filter((r) => r.status === 'bad') ?? []
  const done = playedToday()
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-5 pb-16 pt-6">
        <button onClick={onLeave} className="text-[14px] text-cream/60 hover:text-gold">← Lobby</button>
        <h1 className="mt-6 font-display text-5xl text-cream">
          Leader<span className="text-gold">board</span>
        </h1>
        <p className="mt-3 text-cream/65">
          Everyone plays the same {DAILY_HANDS} hands each day. Scores are chips won or lost — and every one is replayed in your browser before it’s ranked.
        </p>
        <div className="mt-6 flex items-center gap-2">
          {(['today', 'week'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-[14px] font-semibold ${tab === t ? 'bg-gold text-ink' : 'border border-white/15 text-cream/70'}`}>
              {t === 'today' ? (day === dayKey() ? `Today · ${pretty(day)}` : pretty(day)) : 'This week'}
            </button>
          ))}
          {tab === 'today' && (
            <span className="flex gap-1">
              <button onClick={() => step(-1)} className="rounded-full border border-white/15 px-2.5 py-1 text-cream/70 hover:border-gold" aria-label="Previous day">‹</button>
              <button onClick={() => step(1)} disabled={day >= dayKey()} className="rounded-full border border-white/15 px-2.5 py-1 text-cream/70 hover:border-gold disabled:opacity-30" aria-label="Next day">›</button>
            </span>
          )}
          <button onClick={reload} disabled={loading} className="ml-auto text-[13px] text-cream/50 hover:text-gold disabled:opacity-50">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[.03]">
          {error && <p className="p-5 text-ruby">Couldn’t reach the relays: {error}</p>}
          {!rows && !error && <p className="p-5 text-cream/60">Asking the relays for {tab === 'today' ? 'today’s' : 'this week’s'} scores…</p>}
          {rows && ranked.length === 0 && !checking && (
            <div className="p-8 text-center">
              <p className="font-display text-2xl text-cream">No scores{tab === 'today' && day === dayKey() ? ' yet today' : ''}.</p>
              <p className="mt-2 text-cream/60">Yours could be the first.</p>
            </div>
          )}
          <ol>
            {ranked.map((r, i) => (
              <motion.li key={r.pubkey} layout className={`flex items-center gap-3 border-b border-white/5 px-4 py-3 ${r.pubkey === me ? 'bg-gold/10' : ''}`}>
                <span className={`w-7 text-center font-display text-xl ${i < 3 ? 'text-gold' : 'text-cream/50'}`}>{i + 1}</span>
                <Avatar look={lookFor(r.name)} mood={i === 0 ? 'happy' : 'calm'} size={36} />
                <span className="min-w-0 flex-1 truncate font-semibold text-cream">
                  {r.name}
                  {r.pubkey === me && <span className="ml-2 text-[12px] font-normal text-gold">you</span>}
                  {tab === 'week' && <span className="ml-2 text-[12px] font-normal text-cream/45">{r.days} {r.days === 1 ? 'day' : 'days'}</span>}
                </span>
                <span className={`font-mono text-[15px] ${r.score >= 0 ? 'text-gold' : 'text-ruby'}`}>{signed(r.score)}</span>
                <span className="text-[12px] text-[#7ee0a8]" title="Replayed in your browser: these moves give exactly this score">✓</span>
              </motion.li>
            ))}
          </ol>
          {checking > 0 && <p className="px-4 py-3 text-[13px] text-cream/50">Replaying {checking} more {checking === 1 ? 'score' : 'scores'}…</p>}
        </div>
        {rejected.length > 0 && (
          <p className="mt-3 text-[13px] text-cream/45">
            {rejected.length} {rejected.length === 1 ? 'score was' : 'scores were'} left out because the replay didn’t match ({rejected[0].reason}).
          </p>
        )}

        <div className="mt-8 rounded-2xl border border-gold/30 bg-gold/5 p-5 text-center">
          {done === null ? (
            <>
              <p className="font-display text-2xl text-cream">Today’s table is open</p>
              <p className="mt-1 text-cream/65">{DAILY_HANDS} hands against the regulars. Same cards for everyone.</p>
              <button onClick={onPlay} className="btn-gold mt-4 px-8 py-3">Play today’s table</button>
            </>
          ) : (
            <>
              <p className="font-display text-2xl text-cream">You played today: {signed(done - DAILY_STACK)}</p>
              <p className="mt-1 text-cream/65">New cards at midnight UTC. You can replay for practice — it won’t be posted.</p>
              <button onClick={onPlay} className="btn-dark mt-4 px-8 py-3">Practice run</button>
            </>
          )}
        </div>

        <p className="mt-8 text-[13px] leading-relaxed text-cream/40">
          How it works: no database. Each score is a message signed by the player’s browser and posted to public Nostr relays. It includes every move, and because the
          Daily Table’s cards and the regulars’ choices come from the day’s seed, your browser can replay the whole session and check the result. Honest limit: someone
          who digs into the code could compute the day’s cards in advance; the replay stops fake scores, not foresight.
        </p>
      </div>
    </div>
  )
}
