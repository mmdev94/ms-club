// Watching a shared hand: the same table and animations, played from the link.
import { useEffect, useMemo, useState } from 'react'
import { byId } from '../engine/characters'
import { lookFor } from '../game/looks'
import { usePlayback } from '../game/playback'
import { decodeReplay, encodeReplay, replayLink, type ReplayData } from '../game/replay'
import type { Game, Player } from '../game/useGame'
import { Table } from './Table'

function ReplayTable({ data, round }: { data: ReplayData; round: number }) {
  const players: Player[] = useMemo(
    () => data.names.map((name, i) => ({ id: `r${i}`, name, stack: data.stacks[i], character: data.chars[i] ? (byId(data.chars[i]!) ?? null) : null, kind: i === 0 ? 'me' : data.chars[i] ? 'bot' : 'remote', look: lookFor(name) })),
    [data],
  )
  const hand = (data.events.find((e) => e.type === 'hand') as { hand: number } | undefined)?.hand ?? 1
  const { view, dispatch } = usePlayback({ hand: hand * 1000 + round, events: data.events, startStacks: data.stacks, names: data.names, fast: false })
  const game: Game = { view, players, myTurn: null, myHand: null, play: () => {}, rebuy: () => {}, canRebuy: false, fast: false, setFast: () => {}, thinking: -1, deadline: null, land: (id) => dispatch({ type: 'land', id }) }
  return <Table game={game} />
}

export function ReplayScreen({ code, onLeave }: { code: string; onLeave: () => void }) {
  const [data, setData] = useState<ReplayData | null>(null)
  const [error, setError] = useState('')
  const [round, setRound] = useState(0)
  useEffect(() => {
    decodeReplay(code).then(setData, (e) => setError((e as Error).message || 'This replay link is damaged.'))
  }, [code])
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-4 py-2.5">
        <button onClick={onLeave} className="text-[14px] text-cream/60 hover:text-gold">← MS Club</button>
        <p className="font-display text-xl text-cream">
          Hand <span className="text-gold">replay</span>
        </p>
        <span className="font-mono text-[13px] text-cream/50">{data?.by ? `shared by ${data.by}` : ''}</span>
      </header>
      <div className="min-h-0 flex-1">{data ? <ReplayTable key={round} data={data} round={round} /> : <p className="p-8 text-center text-cream/60">{error || 'Loading the hand…'}</p>}</div>
      <div className="flex min-h-[96px] flex-wrap items-center justify-center gap-3 border-t border-white/10 bg-black/40 px-4 py-4">
        <button onClick={() => setRound((r) => r + 1)} className="btn-dark">↻ Watch again</button>
        <button onClick={onLeave} className="btn-gold">Play MS Club</button>
        <p className="w-full text-center text-[12.5px] text-cream/45">Only the cards the sharer saw are shown — folded hands stay hidden.</p>
      </div>
    </div>
  )
}

/** "Share this hand" — makes the link and shares or copies it. */
export function ShareHand({ game }: { game: Game }) {
  const [state, setState] = useState<'idle' | 'done'>('idle')
  const data = game.shareable?.()
  if (!data) return null
  const share = async () => {
    const link = replayLink(await encodeReplay(data))
    try {
      if (navigator.share && /Mobi|Android|iPhone/.test(navigator.userAgent)) await navigator.share({ title: 'MS Club hand', url: link })
      else await navigator.clipboard.writeText(link)
      setState('done')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      /* cancelled */
    }
  }
  return (
    <button onClick={share} className="rounded-full border border-gold/50 px-3 py-1 text-[13px] font-semibold text-gold hover:bg-gold/10">
      {state === 'done' ? 'Link copied ✓' : 'Share this hand ↗'}
    </button>
  )
}
