// Character portraits: DiceBear "Lorelei" (design CC0 by Lisa Wischofsky).
// The same face with a different mouth and brows gives each mood.
import { createAvatar } from '@dicebear/core'
import * as lorelei from '@dicebear/lorelei'
import { useMemo } from 'react'
import type { Character, Mood } from '../engine/characters'

type Look = Character['look']

const MOOD: Record<Mood, { mouth: string; eyebrows: string }> = {
  calm: { mouth: 'happy04', eyebrows: 'variant07' },
  happy: { mouth: 'happy01', eyebrows: 'variant04' },
  smug: { mouth: 'happy09', eyebrows: 'variant11' },
  sad: { mouth: 'sad03', eyebrows: 'variant02' },
  shocked: { mouth: 'sad07', eyebrows: 'variant13' },
}

const cache = new Map<string, string>()
export function avatarUri(look: Look, mood: Mood): string {
  const key = `${look.seed}:${mood}`
  let v = cache.get(key)
  if (!v) {
    v = createAvatar(lorelei, {
      seed: look.seed,
      hair: [look.hair] as never,
      eyes: [look.eyes] as never,
      glasses: look.glasses ? ([look.glasses] as never) : undefined,
      glassesProbability: look.glasses ? 100 : 0,
      beard: look.beard ? ([look.beard] as never) : undefined,
      beardProbability: look.beard ? 100 : 0,
      skinColor: [look.skin],
      hairColor: [look.hairColor],
      backgroundColor: [look.background],
      mouth: [MOOD[mood].mouth] as never,
      eyebrows: [MOOD[mood].eyebrows] as never,
      earringsProbability: 0,
      frecklesProbability: 0,
    }).toDataUri()
    cache.set(key, v)
  }
  return v
}

export const PLAYER_LOOK: Look = { seed: 'you', hair: 'variant21', eyes: 'variant14', skin: 'eac393', hairColor: '6b3a1e', background: 'fde7b0' }

export function Avatar({ look, mood, size = 72, ring }: { look: Look; mood: Mood; size?: number; ring?: string }) {
  const src = useMemo(() => avatarUri(look, mood), [look, mood])
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="rounded-full"
      style={{ width: size, height: size, boxShadow: `0 0 0 3px ${ring ?? 'rgba(232,195,106,.9)'}, 0 10px 24px -8px rgba(0,0,0,.7)` }}
      draggable={false}
    />
  )
}
