// Online tables with no server. Browsers find each other through public Nostr
// relays (only to exchange connection details, encrypted), then talk directly
// over WebRTC. The host's browser runs the table; the room's admin key makes
// the host verifiable, so nobody else can pretend to be the dealer.
import { joinRoom, roles } from 'trystero'
import type { Card } from '../engine/cards'
import type { Action, Event, Legal } from '../engine/holdem'
import type { Look, Player } from '../game/useGame'
import type { Flair } from '../game/playback'
import type { FairRecord } from '../engine/fair'

export const APP_ID = 'mmdev94/ms-club'
/** public Nostr relays that answered in testing; every browser uses all of them so two players always share one */
export const RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.nostr.net', 'wss://nostr.mom', 'wss://offchain.pub', 'wss://relay.snort.social']

/** What every guest sees of a seat. */
export interface PublicSeat {
  id: string
  name: string
  stack: number
  kind: 'host' | 'friend' | 'bot'
  characterId?: string
  look?: Look
  away?: boolean
}
export interface TableInfo {
  level: string
  started: boolean
  seats: PublicSeat[]
}

/** The current hand as one guest may see it: other players' cards hidden until shown. */
export interface HandView {
  hand: number
  seat: number
  events: Event[]
  startStacks: number[]
  legal: Legal | null
  deadline: number | null
  thinking: number
  /** the shuffle's seal, and once the hand is over all the secrets */
  fair?: FairRecord
}

export interface Hello {
  name: string
  look: Look
}

export interface Room {
  roomId: string
  /** my user id (stable per browser) */
  me: string
  isHost: boolean
  leave: () => void
  onPeer: (join: (peerId: string, userId: string) => void, leave: (peerId: string, userId: string) => void) => void
  table: { set: (t: TableInfo) => void; onChange: (f: (t: TableInfo) => void) => void }
  hello: { send: (h: Hello, to?: string) => void; on: (f: (h: Hello, peerId: string, userId: string) => void) => void }
  hand: { send: (h: HandView, to: string) => void; on: (f: (h: HandView, fromHost: boolean, peerId: string) => void) => void }
  move: { send: (m: { hand: number; action: Action }) => void; on: (f: (m: { hand: number; action: Action }, peerId: string, userId: string) => void) => void }
  flair: { send: (f: Flair) => void; on: (f: (x: Flair) => void) => void }
  emote: { send: (e: { seat: number; text: string }) => void; on: (f: (e: { seat: number; text: string }, userId: string) => void) => void }
  /** host → everyone: the hash of its secret for the next hand */
  seal: { send: (s: { hand: number; seal: string }) => void; on: (f: (s: { hand: number; seal: string }, peerId: string) => void) => void }
  /** friend → host: this browser's secret for the shuffle */
  mix: { send: (m: { hand: number; secret: string }, to: string) => void; on: (f: (m: { hand: number; secret: string }, userId: string) => void) => void }
}

export async function openRoom(opts: { host: true } | { host: false; roomId: string }): Promise<Room> {
  const roomId = opts.host ? `t-${Math.random().toString(36).slice(2, 8)}` : opts.roomId
  const room = joinRoom(
    { appId: APP_ID, use: [roles(opts.host ? { selfAsAdmin: true } : {})], maxUsers: 12, relayConfig: { urls: RELAYS, redundancy: RELAYS.length, warnOnRelayFailure: false } },
    roomId,
  )
  const self = await room.getSelf()
  const table = room.makeState<TableInfo>('table', { level: 'normal', started: false, seats: [] })
  const hello = room.makeAction<Hello>('hello')
  const hand = room.makeAction<HandView>('hand', { roles: 'admin' })
  const move = room.makeAction<{ hand: number; action: Action }>('move')
  const flair = room.makeAction<Flair>('flair', { roles: 'admin' })
  const emote = room.makeAction<{ seat: number; text: string }>('emote')
  const seal = room.makeAction<{ hand: number; seal: string }>('seal', { roles: 'admin' })
  const mix = room.makeAction<{ hand: number; secret: string }>('mix')
  return {
    roomId: self.roomId,
    me: self.userId,
    isHost: self.isAdmin,
    leave: () => void room.leave(),
    onPeer: (j, l) => {
      room.onPeerJoin(({ peerId, userId }) => j(peerId, userId))
      room.onPeerLeave(({ peerId, userId }) => l(peerId, userId))
    },
    table: { set: (t) => void table.set(t), onChange: (f) => void table.onChange((v) => f(v)) },
    hello: { send: (h, to) => void hello.send(h, to ? { target: to } : undefined), on: (f) => void hello.onMessage((h, c) => f(h, c.peerId, c.userId)) },
    hand: { send: (h, to) => void hand.send(h, { target: to }), on: (f) => void hand.onMessage((h, c) => f(h, c.roles.includes('admin'), c.peerId)) },
    move: { send: (m) => void move.send(m), on: (f) => void move.onMessage((m, c) => f(m, c.peerId, c.userId)) },
    flair: { send: (x) => void flair.send(x), on: (f) => void flair.onMessage((x) => f(x)) },
    emote: { send: (e) => void emote.send(e), on: (f) => void emote.onMessage((e, c) => f(e, c.userId)) },
    seal: { send: (s) => void seal.send(s), on: (f) => void seal.onMessage((s, c) => c.roles.includes('admin') && f(s, c.peerId)) },
    mix: { send: (m, to) => void mix.send(m, { target: to }), on: (f) => void mix.onMessage((m, c) => f(m, c.userId)) },
  }
}

/** Another player's hole cards are replaced with blanks until they're shown at showdown. */
export function maskFor(events: Event[], seat: number): Event[] {
  return events.map((e) => (e.type === 'deal' && e.seat !== seat ? { ...e, cards: ['', ''] as Card[] } : e))
}

/** The same table, turned so that `mine` sits at the bottom (seat 0). */
export function rotateEvents(events: Event[], mine: number, n: number): Event[] {
  const r = (s: number) => (s - mine + n) % n
  return events.map((e) => {
    switch (e.type) {
      case 'hand':
        return { ...e, dealer: r(e.dealer) }
      case 'blind':
      case 'deal':
      case 'act':
      case 'reveal':
        return { ...e, seat: r(e.seat) }
      case 'award':
        return { ...e, winners: e.winners.map((w) => ({ ...w, seat: r(w.seat) })) }
      default:
        return e
    }
  })
}
export const rotate = <T,>(xs: T[], mine: number): T[] => xs.map((_, k) => xs[(k + mine) % xs.length])

export const publicSeat = (p: Player, i: number): PublicSeat => ({
  id: p.id,
  name: p.name,
  stack: p.stack,
  kind: i === 0 && p.kind === 'me' ? 'host' : p.kind === 'bot' ? 'bot' : 'friend',
  characterId: p.character?.id,
  look: p.look,
  away: p.away,
})
