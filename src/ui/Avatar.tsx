// Living character portraits: DiceBear "Lorelei" faces (design CC0 by Lisa
// Wischofsky) that breathe, blink, change expression with their mood, steam
// when they're on tilt, and show their tells (a glasses fiddle, a grin…).
// Players can use their own picture or GIF instead.
import { createAvatar } from '@dicebear/core'
import * as lorelei from '@dicebear/lorelei'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Character, Mood } from '../engine/characters'

type Look = Character['look']

const MOOD: Record<Mood, { mouth: string; eyebrows: string }> = {
  calm: { mouth: 'happy04', eyebrows: 'variant07' },
  happy: { mouth: 'happy01', eyebrows: 'variant04' },
  smug: { mouth: 'happy09', eyebrows: 'variant11' },
  sad: { mouth: 'sad03', eyebrows: 'variant02' },
  shocked: { mouth: 'sad01', eyebrows: 'variant13' },
  angry: { mouth: 'sad06', eyebrows: 'variant13' },
}
const BADGE: Record<Mood, string> = { calm: '', happy: '😄', smug: '😏', sad: '😢', shocked: '😱', angry: '😠' }

/** A small habit that gives a hand away. */
export type CueKind = 'glasses' | 'grin' | 'blink2' | 'brow'
export interface Cue {
  kind: CueKind
  id: number
}

interface Parts {
  eyes?: string
  mouth?: string
  eyebrows?: string
  noGlasses?: boolean
}

const cache = new Map<string, string>()
export function avatarUri(look: Look, mood: Mood, o: Parts = {}): string {
  const key = `${look.seed}:${look.hair}:${mood}:${o.eyes ?? ''}:${o.mouth ?? ''}:${o.eyebrows ?? ''}:${o.noGlasses ? 1 : 0}`
  let v = cache.get(key)
  if (!v) {
    const glasses = look.glasses && !o.noGlasses
    v = createAvatar(lorelei, {
      seed: look.seed,
      hair: [look.hair] as never,
      eyes: [o.eyes ?? look.eyes] as never,
      glasses: glasses ? ([look.glasses] as never) : undefined,
      glassesProbability: glasses ? 100 : 0,
      beard: look.beard ? ([look.beard] as never) : undefined,
      beardProbability: look.beard ? 100 : 0,
      skinColor: [look.skin],
      hairColor: [look.hairColor],
      backgroundColor: [look.background],
      mouth: [o.mouth ?? MOOD[mood].mouth] as never,
      eyebrows: [o.eyebrows ?? MOOD[mood].eyebrows] as never,
      earringsProbability: 0,
      frecklesProbability: 0,
    }).toDataUri()
    cache.set(key, v)
  }
  return v
}

export const PLAYER_LOOK: Look = { seed: 'you', hair: 'variant21', eyes: 'variant14', skin: 'eac393', hairColor: '6b3a1e', background: 'fde7b0' }

const BLINK = 'variant19'
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Blinks now and then, and plays tells: short changes to the face. */
function useFace(cue: Cue | undefined, animated: boolean) {
  const [parts, setParts] = useState<Parts>({})
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  // blinking
  useEffect(() => {
    if (!animated) return
    let t: ReturnType<typeof setTimeout>
    const loop = () => {
      t = setTimeout(async () => {
        setParts((p) => ({ ...p, eyes: BLINK }))
        await wait(140)
        if (alive.current) setParts((p) => ({ ...p, eyes: undefined }))
        loop()
      }, 2500 + Math.random() * 4000)
    }
    loop()
    return () => clearTimeout(t)
  }, [animated])
  // tells
  useEffect(() => {
    if (!cue) return
    let stop = false
    const set = (p: Parts) => !stop && alive.current && setParts(p)
    ;(async () => {
      if (cue.kind === 'glasses') {
        for (let i = 0; i < 2; i++) {
          set({ noGlasses: true })
          await wait(260)
          set({})
          await wait(220)
        }
      } else if (cue.kind === 'grin') {
        set({ mouth: 'happy16' })
        await wait(1300)
        set({})
      } else if (cue.kind === 'blink2') {
        for (let i = 0; i < 2; i++) {
          set({ eyes: BLINK })
          await wait(150)
          set({})
          await wait(170)
        }
      } else if (cue.kind === 'brow') {
        set({ eyebrows: 'variant11' })
        await wait(900)
        set({})
      }
    })()
    return () => {
      stop = true
    }
  }, [cue?.id])
  return parts
}

export function Avatar({
  look,
  mood,
  size = 72,
  ring,
  image,
  cue,
  tilt = 0,
  animated = true,
}: {
  look: Look
  mood: Mood
  size?: number
  ring?: string
  /** the player's own picture or GIF (data URL) */
  image?: string
  cue?: Cue
  /** 0–1: steam at 0.5 and up */
  tilt?: number
  animated?: boolean
}) {
  const reduced = useReducedMotion()
  const live = animated && !reduced
  const shown: Mood = tilt >= 0.55 && (mood === 'calm' || mood === 'sad') ? 'angry' : mood
  const parts = useFace(image ? undefined : cue, live && !image)
  const src = useMemo(() => (image ? image : avatarUri(look, shown, parts)), [image, look, shown, parts])
  const phase = useMemo(() => (look.seed.length % 7) / 7, [look.seed])
  const hot = tilt >= 0.5
  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
      animate={live ? { y: [0, -size * 0.03, 0], rotate: hot ? [-1.5, 1.5, -1.5] : [0, 0.6, 0] } : undefined}
      transition={live ? { duration: hot ? 0.5 : 3.2 + phase, repeat: Infinity, ease: 'easeInOut', delay: phase } : undefined}
    >
      <motion.img
        key={shown}
        src={src}
        alt=""
        width={size}
        height={size}
        draggable={false}
        className="rounded-full object-cover"
        style={{
          width: size,
          height: size,
          background: image ? '#1d0b2e' : undefined,
          boxShadow: `0 0 0 3px ${hot ? '#d23a4a' : (ring ?? 'rgba(232,195,106,.9)')}, 0 10px 24px -8px rgba(0,0,0,.7)`,
        }}
        initial={live ? { scale: 0.92 } : false}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 14 }}
      />
      {/* on tilt: steam */}
      <AnimatePresence>
        {hot && live && (
          <motion.span key="steam" className="pointer-events-none absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {[0, 1, 2].map((k) => (
              <motion.span
                key={k}
                className="absolute text-[18px]"
                style={{ left: `${18 + k * 30}%`, top: -6 }}
                animate={{ y: [-2, -26], opacity: [0, 1, 0], scale: [0.6, 1.1] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: k * 0.45 }}
              >
                💨
              </motion.span>
            ))}
            <span className="absolute -right-1 -top-1 text-[20px] drop-shadow">💢</span>
          </motion.span>
        )}
      </AnimatePresence>
      {/* a photo can't change its face, so the mood shows as a badge */}
      {image && BADGE[shown] && (
        <motion.span key={shown} initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-[16px]">
          {BADGE[shown]}
        </motion.span>
      )}
    </motion.div>
  )
}
