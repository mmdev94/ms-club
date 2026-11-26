// Hosting an online table: your browser runs the game. Friends who open the
// invite link take a bot's seat (right away before the game starts, otherwise
// from the next hand). Each friend is sent the hand with everyone else's cards
// hidden; their moves come back and are checked before they count.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Level } from '../engine/brain'
import { CHARACTERS } from '../engine/characters'
import { commit, deckFromSeed, randomSecret, seedFrom, type FairRecord } from '../engine/fair'
import { legal, type State } from '../engine/holdem'
import { maskFor, publicSeat, type Room } from '../net/room'
import { lookFor } from './looks'
import { botSeats, START_STACK, useGame, type Look, type Player, type Table } from './useGame'

export interface Guest {
  userId: string
  peerId: string
  name: string
  seat: number | null
  /** has a seat from the next hand */
  waiting: boolean
  online: boolean
}

/** How long the host waits for friends' shuffle secrets before dealing without them */
const MIX_WAIT_MS = 2000

export interface FairStatus {
  hand: number
  /** friends whose secret went into this hand's shuffle */
  mixed: string[]
  missing: string[]
  record: FairRecord | null
}

export function useHost(room: Room, o: { name: string; level: Level; look: Look }): Table & { guests: Guest[]; fair: FairStatus | null } {
  const guests = useRef(new Map<string, Guest>())
  const [guestList, setGuestList] = useState<Guest[]>([])
  const latest = useRef<{ engine: State | null; players: Player[]; startStacks: number[]; deadline: number | null }>({ engine: null, players: [], startStacks: [], deadline: null })
  const started = useRef(false)
  // the fair shuffle, per hand: my secret, the seal, friends' secrets as they arrive
  const shuffles = useRef(new Map<number, { secret: string; seal: string; allowed: Set<string>; mixes: Map<string, string>; record: FairRecord | null; done?: () => void }>())
  const [fair, setFair] = useState<FairStatus | null>(null)

  const sendTo = useCallback(
    (g: Guest) => {
      const { engine, startStacks, deadline } = latest.current
      if (!engine || !g.online) return
      const seat = g.seat ?? -1
      const mine = seat >= 0 && !g.waiting && engine.toAct === seat && engine.phase !== 'done'
      const sh = shuffles.current.get(engine.hand)
      // the secrets only once the hand is over; before that, just the seal
      const fairInfo = sh?.record ? (engine.phase === 'done' ? sh.record : { hand: engine.hand, seal: sh.seal }) : undefined
      room.hand.send(
        { hand: engine.hand, seat: g.waiting ? -1 : seat, events: maskFor(engine.events, g.waiting ? -1 : seat), startStacks, legal: mine ? legal(engine) : null, deadline: mine ? deadline : null, thinking: engine.toAct, fair: fairInfo },
        g.peerId,
      )
    },
    [room],
  )

  const publish = useCallback(() => {
    const { players } = latest.current
    room.table.set({ level: o.level, started: started.current, seats: players.map(publicSeat) })
  }, [room, o.level])

  const prepare = useCallback(
    async (hand: number, players: Player[]) => {
      const secret = randomSecret()
      const seal = await commit(secret)
      const friends = players.filter((p) => p.kind === 'remote' && !p.away)
      const sh = { secret, seal, allowed: new Set(friends.map((f) => f.id)), mixes: new Map<string, string>(), record: null as FairRecord | null, done: undefined as undefined | (() => void) }
      shuffles.current.set(hand, sh)
      shuffles.current.delete(hand - 3)
      room.seal.send({ hand, seal })
      // wait for every friend's secret, or MIX_WAIT_MS
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, friends.length ? MIX_WAIT_MS : 0)
        sh.done = () => {
          if (friends.every((f) => sh.mixes.has(f.id))) {
            clearTimeout(t)
            resolve()
          }
        }
        sh.done()
      })
      const contributions = friends.filter((f) => sh.mixes.has(f.id)).map((f) => ({ id: f.id, name: f.name, secret: sh.mixes.get(f.id)! }))
      const seed = await seedFrom(hand, secret, contributions)
      sh.record = { hand, seal, hostSecret: secret, friends: contributions, missing: friends.filter((f) => !sh.mixes.has(f.id)).map((f) => f.name), seed }
      setFair({ hand, mixed: contributions.map((c) => c.name), missing: sh.record.missing ?? [], record: sh.record })
      return deckFromSeed(seed)
    },
    [room],
  )

  const table = useGame({
    prepare,
    name: o.name,
    level: o.level,
    look: o.look,
    autoStart: false,
    seats: [{ id: room.me, name: o.name, stack: START_STACK, character: null, kind: 'me', look: o.look }, ...botSeats()],
    hooks: {
      onChange: (engine, players, startStacks, deadline) => {
        latest.current = { engine, players, startStacks, deadline }
        // a friend whose seat starts this hand is no longer waiting
        if (engine) for (const g of guests.current.values()) if (g.waiting && g.seat !== null && players[g.seat]?.id === g.userId) g.waiting = false
        publish()
        for (const g of guests.current.values()) sendTo(g)
        setGuestList([...guests.current.values()])
      },
      onFlair: (f) => room.flair.send(f),
    },
  })
  const tableRef = useRef(table)
  tableRef.current = table
  started.current = table.started

  useEffect(() => {
    const botFor = (stack: number): Player => {
      const used = new Set(latest.current.players.map((p) => p.character?.id))
      const c = CHARACTERS.find((x) => !used.has(x.id)) ?? CHARACTERS[0]
      return { id: c.id, name: c.name, stack, character: c, kind: 'bot' }
    }
    room.hello.on((h, peerId, userId) => {
      const name = (h.name || 'Friend').slice(0, 16)
      const players = latest.current.players.length ? latest.current.players : tableRef.current.players
      let g = guests.current.get(userId)
      // their seat went to a bot while they were away: seat them again like a newcomer
      if (g && g.seat !== null && !g.waiting && players[g.seat]?.id !== userId) {
        guests.current.delete(userId)
        g = undefined
      }
      if (g) {
        // back again: same seat
        g.peerId = peerId
        g.online = true
        g.name = name
        if (g.seat !== null) tableRef.current.patchSeat(g.seat, { away: false })
      } else {
        const taken = new Set([...guests.current.values()].map((x) => x.seat))
        const seat = players.findIndex((p, i) => p.kind === 'bot' && !taken.has(i))
        g = { userId, peerId, name, seat: seat >= 0 ? seat : null, waiting: !!latest.current.engine && seat >= 0, online: true }
        guests.current.set(userId, g)
        if (seat >= 0) tableRef.current.setSeat(seat, (old) => ({ id: userId, name, stack: old.kind === 'bot' ? START_STACK : old.stack, character: null, kind: 'remote', look: lookFor(name) }))
      }
      setGuestList([...guests.current.values()])
      publish()
      sendTo(g)
    })
    room.mix.on((m, userId) => {
      const sh = shuffles.current.get(m.hand)
      // only before the deal, and only from a seated friend
      if (!sh || sh.record || !/^[0-9a-f]{64}$/.test(m.secret) || !sh.allowed.has(userId)) return
      sh.mixes.set(userId, m.secret)
      sh.done?.()
    })
    room.move.on((m, _peerId, userId) => {
      const g = guests.current.get(userId)
      if (!g || g.seat === null || g.waiting) return
      tableRef.current.applyRemote(g.seat, m.hand, m.action)
    })
    room.onPeer(
      () => publish(),
      (_peerId, userId) => {
        const g = guests.current.get(userId)
        if (!g) return
        g.online = false
        if (g.seat !== null) {
          const seat = g.seat
          tableRef.current.patchSeat(seat, { away: true })
          // still gone at the next hand: a bot takes the seat (and the chips)
          tableRef.current.setSeat(seat, (old) => (old.away ? botFor(old.stack) : old))
        }
        setGuestList([...guests.current.values()])
      },
    )
    return () => room.leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ...table, guests: guestList, fair }
}
