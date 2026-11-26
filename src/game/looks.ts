// A face for every human player, picked from their name: the same name always
// gets the same face, so friends recognise each other at the table.
import type { Look } from './useGame'

const HAIR = ['variant01', 'variant05', 'variant09', 'variant14', 'variant18', 'variant21', 'variant25', 'variant29', 'variant36', 'variant40', 'variant44', 'variant47']
const EYES = ['variant01', 'variant03', 'variant06', 'variant09', 'variant12', 'variant14', 'variant17', 'variant20', 'variant23']
const SKIN = ['f9dcc4', 'f2d3b1', 'eac393', 'd8a77b', 'c58c5c', 'a0673f', '7a4a2a']
const HAIR_COLOR = ['16161a', '3b2417', '6b3a1e', 'b5651d', 'e0b25a', 'd84a3a', '9a9aa5', '5b2a86']
const BG = ['fde7b0', 'cdeee6', 'f2ecff', 'ffd8cc', 'cfd6e6', 'e3f2c8', 'fbe0ef']

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export function lookFor(name: string): Look {
  const h = hash(name.trim().toLowerCase() || 'player')
  const pick = <T,>(xs: T[], k: number) => xs[Math.floor(h / k) % xs.length]
  return { seed: `p-${name}`, hair: pick(HAIR, 1), eyes: pick(EYES, 13), skin: pick(SKIN, 131), hairColor: pick(HAIR_COLOR, 977), background: pick(BG, 7919) }
}
