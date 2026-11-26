import { motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import type { Level } from '../engine/brain'
import { lookFor } from '../game/looks'
import { useGuest } from '../game/useGuest'
import { useHost } from '../game/useHost'
import type { Game } from '../game/useGame'
import { openRoom, type Room } from '../net/room'
import { Avatar } from './Avatar'
import { Controls } from './Controls'
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

export function HostScreen({ name, level, onLeave }: { name: string; level: Level; onLeave: () => void }) {
  const { room, error } = useRoom({ host: true })
  if (error) return <Message title="Couldn’t open a table" text={error} onLeave={onLeave} />
  if (!room) return <Message title="Opening your table…" text="Setting up a private room. No server involved — your browser is the table." onLeave={onLeave} />
  return <HostTable room={room} name={name} level={level} onLeave={onLeave} />
}

function HostTable({ room, name, level, onLeave }: { room: Room; name: string; level: Level; onLeave: () => void }) {
  const t = useHost(room, { name, level, look: lookFor(name) })
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
          <span className="hidden font-mono text-[13px] text-cream/50 sm:inline">{friends.length} {friends.length === 1 ? 'friend' : 'friends'} · {level}</span>
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
                <Avatar look={p.character?.look ?? p.look ?? lookFor(p.name)} mood="calm" size={34} />
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

export function GuestScreen({ roomId, name, setName, onLeave }: { roomId: string; name: string; setName: (n: string) => void; onLeave: () => void }) {
  const [ready, setReady] = useState(false)
  if (!ready)
    return (
      <div className="grid h-full place-items-center p-5">
        <div className="w-full max-w-sm text-center">
          <p className="font-display text-4xl text-cream">
            MS <span className="text-gold">Club</span>
          </p>
          <p className="mt-3 text-cream/70">A friend invited you to their poker table. Play chips only.</p>
          <div className="mt-6 flex justify-center">
            <Avatar look={lookFor(name)} mood="happy" size={88} />
          </div>
          <label className="mt-5 block text-left text-[13px] font-semibold uppercase tracking-[0.14em] text-cream/50" htmlFor="gname">
            Your name at the table
          </label>
          <input id="gname" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-lg text-cream outline-none focus:border-gold" />
          <button onClick={() => setReady(true)} disabled={!name.trim()} className="btn-gold mt-4 w-full py-3.5 text-lg disabled:opacity-50">
            Join the table
          </button>
          <button onClick={onLeave} className="mt-4 text-[14px] text-cream/50 hover:text-gold">or play the regulars on your own</button>
        </div>
      </div>
    )
  return <GuestRoom roomId={roomId} name={name.trim()} onLeave={onLeave} />
}

function GuestRoom({ roomId, name, onLeave }: { roomId: string; name: string; onLeave: () => void }) {
  const { room, error } = useRoom({ host: false, roomId })
  if (error) return <Message title="Couldn’t reach the table" text={error} onLeave={onLeave} />
  if (!room) return <Message title="Finding the table…" text="Connecting straight to your friend’s browser." onLeave={onLeave} />
  return <GuestTable room={room} name={name} onLeave={onLeave} />
}

function GuestTable({ room, name, onLeave }: { room: Room; name: string; onLeave: () => void }) {
  const g = useGuest(room, { name, look: lookFor(name) })
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
      right={g.status === 'watching' ? <span className="rounded-full bg-white/10 px-3 py-1 text-[13px] text-cream/70">Watching · seat from next hand</span> : <CopyLink link={inviteLink(room.roomId)} compact />}
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
