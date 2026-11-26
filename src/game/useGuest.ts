// Playing at a friend's table: the host's browser runs the game and sends this
// browser the hand as you may see it (only your own cards). The table is turned
// so you always sit at the bottom.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { byId } from '../engine/characters'
import { shortName } from '../engine/hand'
import type { Action } from '../engine/holdem'
import { rotate, rotateEvents, type HandView, type Room, type TableInfo } from '../net/room'
import { lookFor } from './looks'
import { usePlayback } from './playback'
import type { Game, Look, Player } from './useGame'

export type GuestStatus = 'connecting' | 'waiting' | 'watching' | 'playing' | 'host-left'

export function useGuest(room: Room, o: { name: string; look: Look }): Game & { status: GuestStatus; info: TableInfo | null } {
  const [info, setInfo] = useState<TableInfo | null>(null)
  const [hv, setHv] = useState<HandView | null>(null)
  const [hostGone, setHostGone] = useState(false)
  const [fast, setFast] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const hostPeer = useRef<string | null>(null)

  useEffect(() => {
    const hi = () => room.hello.send({ name: o.name, look: o.look })
    room.table.onChange((t) => setInfo(t))
    room.hand.on((h, fromHost, peerId) => {
      if (!fromHost) return
      hostPeer.current = peerId
      setHv(h)
      setHostGone(false)
    })
    room.onPeer(
      (peerId) => {
        // say hello to whoever arrives: the host answers with a seat
        room.hello.send({ name: o.name, look: o.look }, peerId)
      },
      (peerId) => {
        if (peerId === hostPeer.current) setHostGone(true)
      },
    )
    hi()
    const again = setInterval(() => !hostPeer.current && hi(), 4000)
    return () => {
      clearInterval(again)
      room.leave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const n = info?.seats.length || 5
  const listed = info?.seats.findIndex((s) => s.id === room.me) ?? -1
  const mine = hv && hv.seat >= 0 ? hv.seat : !hv && listed >= 0 ? listed : 0
  const players: Player[] = useMemo(
    () =>
      rotate(
        (info?.seats ?? []).map((s, i) => ({
          id: s.id,
          name: s.name,
          stack: s.stack,
          character: s.characterId ? (byId(s.characterId) ?? null) : null,
          kind: i === (hv ? hv.seat : listed) ? ('me' as const) : s.kind === 'bot' ? ('bot' as const) : ('remote' as const),
          look: s.look ?? (s.kind !== 'bot' ? lookFor(s.name) : undefined),
          away: s.away,
        })),
        mine,
      ),
    [info, hv?.seat, mine, listed],
  )
  const events = useMemo(() => (hv ? rotateEvents(hv.events, mine, n) : []), [hv, mine, n])
  const startStacks = useMemo(() => (hv ? rotate(hv.startStacks, mine) : players.map((p) => p.stack)), [hv, mine, players])

  const { view, dispatch, caughtUp } = usePlayback({ hand: hv?.hand ?? 0, events, startStacks, names: players.map((p) => p.name), fast })

  useEffect(() => {
    room.flair.on((f) => {
      const seat = (f.seat - mineRef.current + nRef.current) % nRef.current
      if (f.mood) dispatch({ type: 'mood', seat, mood: f.mood })
      if (f.text) dispatch({ type: 'say', seat, text: f.text })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const mineRef = useRef(mine)
  mineRef.current = mine
  const nRef = useRef(n)
  nRef.current = n

  const key = hv ? `${hv.hand}:${hv.events.length}` : ''
  const myTurn = caughtUp && hv?.legal && sent !== key ? hv.legal : null
  const me = view.seats[0]
  const myHand = hv && hv.seat >= 0 && me?.cards.length === 2 && me.cards[0] && view.board.length >= 3 && !me.folded ? shortName([...me.cards, ...view.board]) : null

  const play = useCallback(
    (a: Action) => {
      if (!hv) return
      setSent(key)
      room.move.send({ hand: hv.hand, action: a })
    },
    [hv, key, room],
  )

  const status: GuestStatus = hostGone ? 'host-left' : !info || !hv ? (info && !info.started ? 'waiting' : 'connecting') : hv.seat < 0 ? 'watching' : 'playing'
  const thinking = hv && hv.thinking >= 0 && !caughtUp ? -1 : hv ? (hv.thinking - mine + n) % n : -1

  return {
    view,
    players: players.length ? players : [],
    myTurn,
    myHand,
    play,
    rebuy: () => {},
    canRebuy: false,
    fast,
    setFast,
    thinking: hv && view.over ? -1 : thinking,
    deadline: hv?.deadline ?? null,
    land: (id) => dispatch({ type: 'land', id }),
    status,
    info,
  }
}
