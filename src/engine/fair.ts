// A provably fair shuffle for tables with friends (commit, then reveal):
//
//  1. Before the hand the host picks a secret and announces only its hash (the
//     "seal"). It can't change the secret afterwards without everyone noticing.
//  2. Each friend's browser sends its own random secret to the host.
//  3. The deck is shuffled from all the secrets together (SHA-256), so nobody —
//     not the host, not a friend — could pick or predict the order in advance.
//  4. After the hand every secret is revealed. Each browser checks the seal,
//     that its own secret was used, and that the cards dealt are exactly the
//     cards those secrets produce.
//
// What it can't stop: the host's browser still sees every card during the hand.
import { fullDeck, type Card } from './cards.ts'
import { startHand } from './holdem.ts'

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

export async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

export function randomSecret(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return hex(b)
}

export const commit = (secret: string) => sha256(`msclub:seal:${secret}`)

export interface Contribution {
  /** player id */
  id: string
  secret: string
}

/** The shuffle seed: the hand number, the host's secret and every friend's secret (in a fixed order). */
export function seedFrom(hand: number, hostSecret: string, friends: Contribution[]): Promise<string> {
  const parts = [...friends].sort((a, b) => a.id.localeCompare(b.id)).map((c) => `${c.id}=${c.secret}`)
  return sha256(['msclub:seed', hand, hostSecret, ...parts].join('|'))
}

/** The deck for a seed: Fisher–Yates driven by SHA-256(seed:counter), with rejection sampling so every order is equally likely. */
export async function deckFromSeed(seed: string): Promise<Card[]> {
  const deck = fullDeck()
  let pool: number[] = []
  let counter = 0
  const next = async (): Promise<number> => {
    if (!pool.length) {
      const h = await sha256(`${seed}:${counter++}`)
      for (let i = 0; i < 64; i += 8) pool.push(parseInt(h.slice(i, i + 8), 16))
    }
    return pool.shift()!
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const n = i + 1
    const limit = Math.floor(0x100000000 / n) * n
    let x = await next()
    while (x >= limit) x = await next()
    const j = x % n
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

/** What the table publishes about one hand's shuffle. The secrets appear only once the hand is over. */
export interface FairRecord {
  hand: number
  /** hash of the host's secret, published before the deal */
  seal: string
  /** revealed after the hand */
  hostSecret?: string
  friends?: (Contribution & { name: string })[]
  /** friends who didn't send a secret in time */
  missing?: string[]
  seed?: string
}

export interface Check {
  ok: boolean
  /** what was checked, in words */
  lines: string[]
}

/**
 * Checks a finished hand: the seal, my own secret, and every card I saw against
 * the deck the secrets produce. `stacks` and `dealer` are as at the start of the hand.
 */
export async function verify(
  r: FairRecord,
  opts: { mySecret?: string; myId?: string; stacks: number[]; dealer: number; sb: number; bb: number; seen: { seat: number; cards: Card[] }[]; board: Card[] },
): Promise<Check> {
  const lines: string[] = []
  let ok = true
  const fail = (s: string) => {
    ok = false
    lines.push(`✗ ${s}`)
  }
  if (!r.hostSecret || !r.friends || !r.seed) return { ok: false, lines: ['✗ The secrets for this hand were not revealed.'] }
  if ((await commit(r.hostSecret)) === r.seal) lines.push('✓ The host’s secret matches the seal published before the deal.')
  else fail('The host’s secret does not match its seal.')
  if (opts.mySecret) {
    const mine = r.friends.find((f) => f.id === opts.myId)
    if (mine?.secret === opts.mySecret) lines.push('✓ Your browser’s secret was mixed into the shuffle.')
    else fail('Your browser’s secret was not used.')
  }
  const seed = await seedFrom(r.hand, r.hostSecret, r.friends)
  if (seed === r.seed) lines.push('✓ The seed is the hash of all the secrets.')
  else fail('The seed does not come from the secrets.')
  const deck = await deckFromSeed(seed)
  const s = startHand(
    opts.stacks.map((stack, i) => ({ id: `${i}`, name: `${i}`, stack })),
    { hand: r.hand, dealer: opts.dealer, sb: opts.sb, bb: opts.bb, deck },
  )
  const rest = s.deck
  const expectedBoard = [rest[1], rest[2], rest[3], rest[5], rest[7]].slice(0, opts.board.length)
  let cardsOk = expectedBoard.every((c, i) => c === opts.board[i])
  for (const x of opts.seen) if (x.cards.join() !== s.seats[x.seat].cards.join()) cardsOk = false
  const count = opts.board.length + opts.seen.length * 2
  if (cardsOk) lines.push(`✓ All ${count} cards you saw are exactly the ones this shuffle deals.`)
  else fail('The cards dealt are not the ones this shuffle produces.')
  return { ok, lines }
}
