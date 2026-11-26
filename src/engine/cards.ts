// Cards and a seeded shuffle. A seed (any string) always gives the same deck,
// which is what makes the Daily Table replayable: everyone gets the same cards,
// and anyone can recompute a game from its moves.

export type Card = string // "As", "Td", "2c": rank + suit, as the hand evaluator expects
export const RANKS = '23456789TJQKA'
export const SUITS = 'shdc'

export const fullDeck = (): Card[] => [...SUITS].flatMap((s) => [...RANKS].map((r) => `${r}${s}`))

/** 32-bit FNV-1a, to turn a seed string into a number. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: small, fast, and identical in every browser. */
export function rng(seed: string | number): () => number {
  let a = typeof seed === 'number' ? seed >>> 0 : hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates with the given random source. */
export function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const rankOf = (c: Card) => RANKS.indexOf(c[0])
export const suitOf = (c: Card) => c[1]

const RANK_NAMES: Record<string, string> = { T: '10', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' }
const SUIT_NAMES: Record<string, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
export const cardName = (c: Card) => `${RANK_NAMES[c[0]] ?? c[0]} of ${SUIT_NAMES[c[1]]}`
