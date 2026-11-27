// Hand replays as links. The whole hand — as the sharer saw it: their own
// cards, the board, and only the cards that were shown — is packed into the
// link itself (compressed JSON), so there's no server and nothing is stored.
import type { Event } from '../engine/holdem'

export interface ReplayData {
  v: 1
  names: string[]
  /** character id for each regular, null for people */
  chars: (string | null)[]
  /** chips at the start of the hand */
  stacks: number[]
  /** the hand's events, from the sharer's seat (seat 0), other players' cards hidden unless shown */
  events: Event[]
  /** who shared it, as a label */
  by?: string
}

const toB64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([new Uint8Array(data)]).stream().pipeThrough(t))
  return new Uint8Array(await out.arrayBuffer())
}

export async function encodeReplay(r: ReplayData): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(r))
  return toB64url(await pipe(raw, new CompressionStream('deflate-raw')))
}

export async function decodeReplay(s: string): Promise<ReplayData> {
  const raw = await pipe(fromB64url(s), new DecompressionStream('deflate-raw'))
  const r = JSON.parse(new TextDecoder().decode(raw)) as ReplayData
  if (r.v !== 1 || !Array.isArray(r.events) || !Array.isArray(r.names) || r.names.length !== r.stacks.length || r.names.length > 9) throw new Error('This replay link is damaged.')
  r.names = r.names.map((n) => String(n).slice(0, 16))
  return r
}

export const replayLink = (code: string) => `${location.origin}${location.pathname}#/r/${code}`
