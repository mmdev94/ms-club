import { motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import type { Level } from '../engine/brain'
import { lookFor } from '../game/looks'
import { useGuest, type GuestFair } from '../game/useGuest'
import { useHost, type FairStatus } from '../game/useHost'
import type { Game } from '../game/useGame'
import { openRoom, type Room } from '../net/room'
import { Avatar } from './Avatar'
import { Controls } from './Controls'
import { FacePicker } from './Face'
import { Table } from './Table'

export const inviteLink = (roomId: string) => `${location.origin}${location.pathname}#/t/${encodeURIComponent(roomId)}`

function useRoom(opts: { host: true } | { host: false; roomId: string }) {
  const [room, setRoom] = useState<Room | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    openRoom(opts)
      .then((r) => (alive ? setRoom(r) : r.leave()))
      .catch((e) => alive && setError((e as Error).message))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { room, error }
}

function Shell({ title, onLeave, right, children, game }: { title: ReactNode; onLeave: () => void; right?: ReactNode; children?: ReactNode; game: Game }) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-2.5">
        <button onClick={onLeave} className="text-[14px] text-cream/60 hover:text-gold">← Leave</button>
        <p className="truncate font-display text-xl text-cream">{title}</p>
        <div className="flex items-center gap-2">{right}</div>
      </header>
      <div className="relative min-h-0 flex-1">
        <Table game={game} />
        {children}
      </div>
      <Controls game={game} />
    </div>
  )
}

function CopyLink({ link, compact = false }: { link: string; compact?: boolean }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      if (compact && navigator.share) await navigator.share({ title: 'MS Club', text: 'Join my poker table', url: link })
      else await navigator.clipboard.writeText(link)
      setDone(true)
      setTimeout(() => setDone(false), 1800)
    } catch {
      /* cancelled */
    }
  }
  if (compact)
    return (
      <button onClick={copy} className="rounded-full border border-gold/50 px-3 py-1 text-[13px] font-semibold text-gold hover:bg-gold/10">
        {done ? 'Copied ✓' : 'Invite'}
      </button>
    )
  return (
    <div className="flex w-full items-center gap-2 rounded-xl border border-white/15 bg-black/40 p-2">
      <code className="min-w-0 flex-1 truncate px-2 font-mono text-[13px] text-cream/80">{link}</code>
      <button onClick={copy} className="btn-gold shrink-0 px-4 py-2 text-[14px]">{done ? 'Copied ✓' : 'Copy link'}</button>
    </div>
  )
}

// ── the fair shuffle badge and its explanation ──────────────────────────────

function FairBadge({ host, guest }: { host?: FairStatus | null; guest?: GuestFair | null }) {
  const [open, setOpen] = useState(false)
  const state = guest ? (guest.check ? (guest.check.ok ? 'ok' : 'bad') : guest.sealed ? 'sealed' : 'none') : host ? 'host' : 'none'
  if (state === 'none') return null
  const label = state === 'ok' ? '✓ Fair shuffle' : state === 'bad' ? '✗ Shuffle check failed' : state === 'sealed' ? '🔒 Shuffle sealed' : `🔒 Fair shuffle · ${host!.mixed.length} mixed in`
  const tone = state === 'bad' ? 'border-ruby text-ruby' : state === 'ok' ? 'border-[#3fbf7f] text-[#7ee0a8]' : 'border-white/20 text-cream/75'
  const record = guest?.record ?? host?.record ?? null
  return (
    <>
      <button onClick={() => setOpen(true)} className={`whitespace-nowrap rounded-full border px-3 py-1 text-[12.5px] font-semibold ${tone}`} title="How the shuffle is checked">
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#15121c] p-6 text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-2xl text-cream">A shuffle nobody can rig</p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px] leading-relaxed text-cream/75">
              <li>Before each hand the host’s browser picks a secret and announces only its fingerprint (a SHA-256 hash): the <em>seal</em>.</li>
              <li>Every friend’s browser then adds its own random secret.</li>
              <li>The deck is shuffled from all the secrets together. The host sealed first and can’t see the others in advance, so nobody can choose the cards.</li>
              <li>After the hand all secrets are revealed, and each friend’s browser checks the seal, its own secret, and every card it saw.</li>
            </ol>
            {guest?.check && (
              <div className={`mt-4 rounded-xl border p-3 text-[14px] ${guest.check.ok ? 'border-[#3fbf7f]/50 bg-[#3fbf7f]/10' : 'border-ruby/60 bg-ruby/10'}`}>
                <p className="font-semibold text-cream">Hand {guest.hand}, checked in your browser:</p>
                <ul className="mt-1.5 space-y-1 text-cream/85">
                  {guest.check.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                {!guest.check.ok && <p className="mt-2 text-[13px] text-cream/60">If only “your secret” failed, your browser may simply have answered too late. Any other failure means the host’s browser did not deal honestly.</p>}
              </div>
            )}
            {guest && !guest.check && <p className="mt-4 text-[14px] text-cream/70">This hand is sealed{guest.mixed ? ' and your secret is in' : ''}. It is checked as soon as the hand ends.</p>}
            {host && (
              <p className="mt-4 text-[14px] text-cream/70">
                Hand {host.hand}: {host.mixed.length ? `${host.mixed.join(', ')} mixed in their secrets` : 'no friends at the table yet'}.{host.missing.length ? ` No answer in time from ${host.missing.join(', ')}.` : ''} Your friends’ browsers check every hand.
              </p>
            )}
            <p className="mt-4 text-[13px] text-cream/45">Honest limit: during the hand the host’s browser still knows every card, so play with people you trust.</p>
            {record?.seed && (
              <details className="mt-4 text-[12px] text-cream/55">
                <summary className="cursor-pointer text-cream/70">The raw data</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all font-mono">{JSON.stringify(record, null, 1)}</pre>
              </details>
            )}
            <button onClick={() => setOpen(false)} className="btn-light mt-5 w-full">Close</button>
          </div>
        </div>
      )}
    </>
  )
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/55 p-4 backdrop-blur-[2px]">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md rounded-2xl border border-white/10 bg-[#15121c] p-6 text-center shadow-2xl">
        {children}
      </motion.div>
    </div>
  )
}

// ── hosting ───────────────────────────────────────────────────────────────────

export function HostScreen({ name, level, face, onLeave }: { name: string; level: Level; face?: string; onLeave: () => void }) {
  const { room, error } = useRoom({ host: true })
  if (error) return <Message title="Couldn’t open a table" text={error} onLeave={onLeave} />
  if (!room) return <Message title="Opening your table…" text="Setting up a private room. No server involved — your browser is the table." onLeave={onLeave} />
  return <HostTable room={room} name={name} level={level} face={face} onLeave={onLeave} />
}

function HostTable({ room, name, level, face, onLeave }: { room: Room; name: string; level: Level; face?: string; onLeave: () => void }) {
  const t = useHost(room, { name, level, look: lookFor(name), image: face })
  const link = inviteLink(room.roomId)
  const friends = t.guests.filter((g) => g.online)
  return (
    <Shell
      game={t}
      onLeave={onLeave}
      title={
        <>
          Your <span className="text-gold">table</span>
        </>
      }
      right={
        <>
          <span className="hidden font-mono text-[13px] text-cream/50 lg:inline">{friends.length} {friends.length === 1 ? 'friend' : 'friends'} · {level}</span>
          {t.started && friends.length > 0 && <FairBadge host={t.fair} />}
          <CopyLink link={link} compact />
        </>
      }
    >
      {!t.started && (
        <Overlay>
          <p className="font-display text-3xl text-cream">Invite your friends</p>
          <p className="mt-2 text-[15px] text-cream/65">Send them this link. They join in seconds — no account, no download. Empty seats are played by the regulars ({level}).</p>
          <div className="mt-5">
            <CopyLink link={link} />
          </div>
          <ul className="mt-5 space-y-2 text-left">
            {t.players.map((p, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl bg-white/[.04] px-3 py-2">
                <Avatar look={p.character?.look ?? p.look ?? lookFor(p.name)} mood="calm" size={34} image={p.image} animated={false} />
                <span className="flex-1 font-semibold text-cream">{p.name}</span>
                <span className="text-[13px] text-cream/50">{p.kind === 'me' ? 'you · host' : p.kind === 'bot' ? 'bot' : 'friend ✓'}</span>
              </li>
            ))}
          </ul>
          <button onClick={t.start} className="btn-gold mt-6 w-full py-3 text-lg">
            Start the game
          </button>
          <p className="mt-3 text-[12.5px] leading-relaxed text-cream/40">Friends can still join after the start: they take a bot’s seat from the next hand. Your browser deals, so keep this tab open.</p>
        </Overlay>
      )}
    </Shell>
  )
}

// ── joining ───────────────────────────────────────────────────────────────────

export function GuestScreen({ roomId, name, setName, face, setFace, onLeave }: { roomId: string; name: string; setName: (n: string) => void; face?: string; setFace: (f: string | undefined) => void; onLeave: () => void }) {
  const [ready, setReady] = useState(false)
  if (!ready)
    return (
      <div className="grid h-full place-items-center p-5">
        <div className="w-full max-w-sm text-center">
          <p className="font-display text-4xl text-cream">
            MS <span className="text-gold">Club</span>
          </p>
          <p className="mt-3 text-cream/70">A friend invited you to their poker table. Play chips only.</p>

          <label className="mt-5 block text-left text-[13px] font-semibold uppercase tracking-[0.14em] text-cream/50" htmlFor="gname">
            Your name at the table
          </label>
          <input id="gname" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-lg text-cream outline-none focus:border-gold" />
          <div className="mt-3">
            <FacePicker name={name} face={face} setFace={setFace} />
          </div>
          <button onClick={() => setReady(true)} disabled={!name.trim()} className="btn-gold mt-4 w-full py-3.5 text-lg disabled:opacity-50">
            Join the table
          </button>
          <button onClick={onLeave} className="mt-4 text-[14px] text-cream/50 hover:text-gold">or play the regulars on your own</button>
        </div>
      </div>
    )
  return <GuestRoom roomId={roomId} name={name.trim()} face={face} onLeave={onLeave} />
}

function GuestRoom({ roomId, name, face, onLeave }: { roomId: string; name: string; face?: string; onLeave: () => void }) {
  const { room, error } = useRoom({ host: false, roomId })
  if (error) return <Message title="Couldn’t reach the table" text={error} onLeave={onLeave} />
  if (!room) return <Message title="Finding the table…" text="Connecting straight to your friend’s browser." onLeave={onLeave} />
  return <GuestTable room={room} name={name} face={face} onLeave={onLeave} />
}

function GuestTable({ room, name, face, onLeave }: { room: Room; name: string; face?: string; onLeave: () => void }) {
  const g = useGuest(room, { name, look: lookFor(name), image: face })
  const host = g.info?.seats.find((s) => s.kind === 'host')?.name
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 20000)
    return () => clearTimeout(t)
  }, [])
  const overlay =
    g.status === 'connecting' ? (
      <Overlay>
        <p className="font-display text-2xl text-cream">Connecting to the table…</p>
        <p className="mt-2 text-cream/60">{slow ? 'This is taking a while. The host must keep their tab open; some networks block direct connections — try another network (e.g. mobile data).' : 'Usually a few seconds.'}</p>
      </Overlay>
    ) : g.status === 'waiting' ? (
      <Overlay>
        <p className="font-display text-2xl text-cream">You’re seated ✓</p>
        <p className="mt-2 text-cream/60">Waiting for {host ?? 'the host'} to start the game.</p>
      </Overlay>
    ) : g.status === 'host-left' ? (
      <Overlay>
        <p className="font-display text-2xl text-cream">{host ?? 'The host'} left the table</p>
        <p className="mt-2 text-cream/60">The host’s browser was running the game, so it has ended.</p>
        <button onClick={onLeave} className="btn-gold mt-5">Back to the lobby</button>
      </Overlay>
    ) : null
  return (
    <Shell
      game={g}
      onLeave={onLeave}
      title={
        <>
          {host ? `${host}’s` : 'A'} <span className="text-gold">table</span>
        </>
      }
      right={
        g.status === 'watching' ? (
          <span className="rounded-full bg-white/10 px-3 py-1 text-[13px] text-cream/70">Watching · seat from next hand</span>
        ) : (
          <>
            <FairBadge guest={g.fair} />
            <span className="hidden sm:inline">
              <CopyLink link={inviteLink(room.roomId)} compact />
            </span>
          </>
        )
      }
    >
      {overlay}
    </Shell>
  )
}

function Message({ title, text, onLeave }: { title: string; text: string; onLeave: () => void }) {
  return (
    <div className="grid h-full place-items-center p-5 text-center">
      <div className="max-w-sm">
        <p className="font-display text-3xl text-cream">{title}</p>
        <p className="mt-3 text-cream/65">{text}</p>
        <button onClick={onLeave} className="mt-6 text-[14px] text-cream/50 hover:text-gold">← Back to the lobby</button>
      </div>
    </div>
  )
}
