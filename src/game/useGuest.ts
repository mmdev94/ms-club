// Playing at a friend's table: the host's browser runs the game and sends this
// browser the hand as you may see it (only your own cards). The table is turned
// so you always sit at the bottom.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { byId } from '../engine/characters'
import { shortName } from '../engine/hand'
import { randomSecret, verify, type Check, type FairRecord } from '../engine/fair'
import type { Action } from '../engine/holdem'
import { BLINDS } from './useGame'
import { rotate, rotateEvents, type HandView, type Room, type TableInfo } from '../net/room'
import { lookFor } from './looks'
import { usePlayback } from './playback'
import type { Game, Look, Player } from './useGame'

export type GuestStatus = 'connecting' | 'waiting' | 'watching' | 'playing' | 'host-left'

/** The fair shuffle as this browser sees it: sealed during the hand, checked after. */
export interface GuestFair {
  hand: number
  sealed: boolean
  /** my secret went to the host */
  mixed: boolean
  check: Check | null
  record: FairRecord | null
}

export function useGuest(room: Room, o: { name: string; look: Look }): Game & { status: GuestStatus; info: TableInfo | null; fair: GuestFair | null } {
  const [info, setInfo] = useState<TableInfo | null>(null)
  const [hv, setHv] = useState<HandView | null>(null)
  const [hostGone, setHostGone] = useState(false)
  const [fast, setFast] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const hostPeer = useRef<string | null>(null)
  const secrets = useRef(new Map<number, string>())
  const [fair, setFair] = useState<GuestFair | null>(null)

  useEffect(() => {
    const hi = () => room.hello.send({ name: o.name, look: o.look })
    room.table.onChange((t) => setInfo(t))
    // the host sealed its secret for the next hand: add ours to the shuffle
    room.seal.on((x, peerId) => {
      hostPeer.current = peerId
      const secret = randomSecret()
      secrets.current.set(x.hand, secret)
      secrets.current.delete(x.hand - 5)
      room.mix.send({ hand: x.hand, secret }, peerId)
      setFair({ hand: x.hand, sealed: true, mixed: true, check: null, record: { hand: x.hand, seal: x.seal } })
    })
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

  // once a hand is over and its secrets are out, check it
  const checked = useRef(new Set<number>())
  useEffect(() => {
    if (!hv?.fair?.hostSecret || checked.current.has(hv.hand) || !hv.events.some((e) => e.type === 'end')) return
    checked.current.add(hv.hand)
    const start = hv.events.find((e) => e.type === 'hand')
    const seen = hv.events.flatMap((e) => (e.type === 'deal' && e.cards[0] ? [{ seat: e.seat, cards: e.cards }] : e.type === 'reveal' ? [{ seat: e.seat, cards: e.cards }] : []))
    const unique = [...new Map(seen.map((x) => [x.seat, x])).values()]
    const board = hv.events.flatMap((e) => (e.type === 'street' ? e.cards : []))
    const record = hv.fair
    const mine = secrets.current.get(hv.hand)
    verify(record, { mySecret: hv.seat >= 0 ? mine : undefined, myId: room.me, stacks: hv.startStacks, dealer: start?.type === 'hand' ? start.dealer : 0, sb: BLINDS[0], bb: BLINDS[1], seen: unique, board }).then((check) =>
      setFair({ hand: hv.hand, sealed: true, mixed: !!mine, check, record }),
    )
  }, [hv, room.me])

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
    fair: fair ?? (hv?.fair ? { hand: hv.hand, sealed: true, mixed: secrets.current.has(hv.hand), check: null, record: hv.fair } : null),
  }
}
