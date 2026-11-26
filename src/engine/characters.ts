// The four AI regulars: how they play, how they look, what they say.
import type { Style } from './bot.ts'
import type { Personality } from './brain.ts'

export type Mood = 'calm' | 'happy' | 'smug' | 'sad' | 'shocked'
export type Moment = 'raise' | 'call' | 'fold' | 'check' | 'allin' | 'win' | 'lose' | 'bluffWin' | 'bigPot'

export interface Character {
  id: string
  name: string
  tagline: string
  /** Easy-level settings */
  style: Style
  /** Normal/Hard-level leanings */
  personality: Personality
  /** DiceBear "lorelei" look: fixed per character */
  look: { seed: string; hair: string; eyes: string; glasses?: string; beard?: string; skin: string; hairColor: string; background: string }
  lines: Partial<Record<Moment, string[]>>
}

export const CHARACTERS: Character[] = [
  {
    id: 'rock',
    name: 'The Rock',
    tagline: 'Folds 80% of hands. When he bets, believe him.',
    style: { play: 1.45, raise: 1.9, bluff: 0.02, sticky: 0, size: 0.7, shove: 0.02, slowplay: 0.1 },
    personality: { loose: -0.8, aggro: 0.45, bluff: 0.03, sticky: 0, shove: 0.02, trap: 0.15 },
    look: { seed: 'rock', hair: 'variant12', eyes: 'variant05', beard: 'variant01', skin: 'f2d3b1', hairColor: '2b2d35', background: 'cfd6e6' },
    lines: {
      fold: ['Not this one.', 'Patience.', 'Fold.', '…'],
      raise: ['Raise.', 'I have it.', 'You know what this means.'],
      allin: ['All of it.', 'Finally, a hand.'],
      win: ['As expected.', 'Told you.'],
      lose: ['Statistically unlikely.', 'Hm.'],
      check: ['Check.'],
    },
  },
  {
    id: 'maniac',
    name: 'Maniac',
    tagline: 'Raises with anything. Sometimes it’s even good.',
    style: { play: 0.7, raise: 1.05, bluff: 0.45, sticky: 0.3, size: 1.0, shove: 0.12, slowplay: 0 },
    personality: { loose: 1.4, aggro: 0.95, bluff: 0.5, sticky: 0.25, shove: 0.1, trap: 0 },
    look: { seed: 'maniac', hair: 'variant33', eyes: 'variant19', glasses: 'variant03', skin: 'e8b892', hairColor: 'd84a3a', background: 'ffd8cc' },
    lines: {
      raise: ['RAISE! 🔥', 'Let’s gooo', 'Too easy.', 'Pay to see it!'],
      allin: ['ALL IN, BABY', 'Send it!!', 'YOLO.'],
      call: ['Sure, why not', 'I’m curious.'],
      fold: ['Ugh, fine.', 'Boring hand.'],
      win: ['Never in doubt 😎', 'Read you like a book.'],
      bluffWin: ['I had nothing 😂', 'Seven-deuce, baby!'],
      lose: ['Rigged.', 'Next hand is mine.', 'Lucky river!'],
    },
  },
  {
    id: 'shark',
    name: 'The Shark',
    tagline: 'Solid, patient, and counting every chip you lose.',
    style: { play: 1.05, raise: 1.4, bluff: 0.14, sticky: 0.08, size: 0.66, shove: 0.03, slowplay: 0.15 },
    personality: { loose: 0.1, aggro: 0.7, bluff: 0.22, sticky: 0.06, shove: 0.02, trap: 0.2 },
    look: { seed: 'shark', hair: 'variant04', eyes: 'variant10', glasses: 'variant05', skin: 'c58c5c', hairColor: '16161a', background: 'cdeee6' },
    lines: {
      raise: ['Raise.', 'Let’s make it interesting.', 'Price just went up.'],
      call: ['Call.', 'I’ll see it.'],
      fold: ['Good bet.', 'Your pot.'],
      allin: ['I’m all in. Your move.'],
      win: ['Nice hand. Mine was nicer.', 'Thanks for the chips.'],
      bluffWin: ['Would you like to see? No.'],
      lose: ['Well played.', 'Variance.'],
    },
  },
  {
    id: 'grandma',
    name: 'Grandma',
    tagline: 'Bakes cookies. Shoves all-in. Do not trust the cookies.',
    style: { play: 1.15, raise: 1.55, bluff: 0.1, sticky: 0.2, size: 0.8, shove: 0.35, slowplay: 0.25 },
    personality: { loose: -0.2, aggro: 0.45, bluff: 0.12, sticky: 0.18, shove: 0.3, trap: 0.35 },
    look: { seed: 'grandma', hair: 'variant46', eyes: 'variant02', glasses: 'variant01', skin: 'f5d6c0', hairColor: 'e9e6f0', background: 'f2ecff' },
    lines: {
      check: ['Oh, I’ll just check, dear.'],
      call: ['I’ll come along.', 'Oh go on then.'],
      raise: ['Is this how you raise?', 'A little bit more, sweetie.'],
      allin: ['Oops, all my chips 🍪', 'Grandma’s going all in!'],
      fold: ['Too rich for me, dear.'],
      win: ['Beginner’s luck, I suppose 😇', 'Cookies are on me.'],
      bluffWin: ['I couldn’t see my cards without my glasses.'],
      lose: ['Well done, sweetheart.', 'You remind me of your grandfather.'],
    },
  },
]

export const byId = (id: string) => CHARACTERS.find((c) => c.id === id)
export const line = (c: Character, m: Moment, random: () => number): string | null => {
  const l = c.lines[m]
  return l?.length ? l[Math.floor(random() * l.length)] : null
}
