// Hand strength, through @pokertools/evaluator (lower score = better hand).
import { evaluate, getCardCode, rank, rankDescription } from '@pokertools/evaluator'
import type { Card } from './cards.ts'

const codeCache = new Map<Card, number>()
export const code = (c: Card) => {
  let v = codeCache.get(c)
  if (v === undefined) codeCache.set(c, (v = getCardCode(c)))
  return v
}

/** Score of the best 5 of these cards (5–7 cards). Lower is better. */
export const score = (cards: Card[]) => evaluate(cards.map(code))

/** "Full House", "Two Pair"… for the best 5 of these cards. */
export const handName = (cards: Card[]) => rankDescription(rank(cards.map(code)))

const NAMES: Record<string, string> = { '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Nine', T: 'Ten', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' }
const plural = (r: string) => (r === '6' ? 'Sixes' : `${NAMES[r]}s`)
const ORDER = 'AKQJT98765432'

/** The best 5-card hand in words: "a pair of Kings", "two pair, Aces and Sevens", "a Queen-high flush"… */
export function describe(cards: Card[]): string {
  const counts = new Map<string, number>()
  for (const c of cards) counts.set(c[0], (counts.get(c[0]) ?? 0) + 1)
  const byCount = (n: number) => [...counts].filter(([, k]) => k >= n).map(([r]) => r).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  const cat = handName(cards).toLowerCase()
  const suits = new Map<string, Card[]>()
  for (const c of cards) suits.set(c[1], [...(suits.get(c[1]) ?? []), c])
  const flushCards = [...suits.values()].find((x) => x.length >= 5)
  const straightTop = (ranks: string[]) => {
    const has = new Set(ranks)
    for (let i = 0; i <= 8; i++) if ([...ORDER.slice(i, i + 5)].every((r) => has.has(r))) return ORDER[i]
    return [...'A5432'].every((r) => has.has(r)) ? '5' : null
  }
  if (cat.includes('straight flush')) {
    const top = straightTop(flushCards!.map((c) => c[0]))
    return top === 'A' ? 'a royal flush' : `a straight flush to the ${NAMES[top!]}`
  }
  if (cat.includes('four')) return `four ${plural(byCount(4)[0])}`
  if (cat.includes('full house')) {
    const trips = byCount(3)
    const pair = [...byCount(2)].filter((r) => r !== trips[0])
    return `a full house, ${plural(trips[0])} full of ${plural(pair[0])}`
  }
  if (cat.includes('flush')) {
    const top = [...flushCards!].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]))[0][0]
    return `${top === 'A' || top === '8' ? 'an' : 'a'} ${NAMES[top]}-high flush`
  }
  if (cat.includes('straight')) return `a straight to the ${NAMES[straightTop([...counts.keys()])!]}`
  if (cat.includes('three')) return `three ${plural(byCount(3)[0])}`
  if (cat.includes('two pair')) {
    const [a, b] = byCount(2)
    return `two pair, ${plural(a)} and ${plural(b)}`
  }
  if (cat.includes('pair')) return `a pair of ${plural(byCount(2)[0])}`
  return `${NAMES[byCount(1)[0]]} high`
}

/** "Pair of Kings" — the short label for a seat. */
export const shortName = (cards: Card[]) => {
  const d = describe(cards).replace(/^(a|an) /, '').replace(/, .*$/, (m) => (m.includes('full of') ? '' : m))
  return d.charAt(0).toUpperCase() + d.slice(1)
}
