// A real playing card: classic faces (CC0, from Adrian Kennard's designs via
// @letele/playing-cards) and our own back. It flies in from the deck and
// flips over in 3D when it's revealed.
import { motion } from 'framer-motion'
import * as deck from '@letele/playing-cards'
import type { ComponentType, CSSProperties } from 'react'
import type { Card as CardCode } from '../engine/cards'
import { cardName } from '../engine/cards'
import type { Pt } from './layout'

const faces = deck as unknown as Record<string, ComponentType<{ style?: CSSProperties }>>
const faceKey = (c: CardCode) => `${c[1].toUpperCase()}${c[0] === 'T' ? '10' : c[0].toLowerCase()}`

export function CardBack() {
  return (
    <svg viewBox="0 0 250 350" width="100%" height="100%" aria-hidden>
      <defs>
        <pattern id="msc-diamonds" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="22" height="22" fill="#3d1d5c" />
          <rect x="3" y="3" width="16" height="16" fill="none" stroke="#e8c36a" strokeOpacity=".35" strokeWidth="1.5" />
        </pattern>
        <radialGradient id="msc-glow" cx="50%" cy="45%" r="65%">
          <stop offset="0" stopColor="#7a3fb0" stopOpacity=".55" />
          <stop offset="1" stopColor="#1d0b2e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="246" height="346" rx="18" fill="#fffdf7" stroke="#c9c2b4" strokeWidth="2" />
      <rect x="14" y="14" width="222" height="322" rx="10" fill="url(#msc-diamonds)" />
      <rect x="14" y="14" width="222" height="322" rx="10" fill="url(#msc-glow)" />
      <rect x="22" y="22" width="206" height="306" rx="7" fill="none" stroke="#e8c36a" strokeWidth="2" />
      <circle cx="125" cy="175" r="46" fill="#1d0b2e" stroke="#e8c36a" strokeWidth="3" />
      <text x="125" y="170" textAnchor="middle" fontFamily="DM Serif Display, Georgia, serif" fontSize="34" fill="#e8c36a">MS</text>
      <text x="125" y="198" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="14" letterSpacing="5" fill="#e8c36a">CLUB</text>
    </svg>
  )
}

export function CardFace({ card }: { card: CardCode }) {
  const Face = faces[faceKey(card)]
  return Face ? <Face style={{ width: '100%', height: '100%' }} /> : null
}

export interface CardProps {
  card: CardCode | null
  faceUp: boolean
  /** where it sits (centre), stage px */
  at: Pt
  size: [number, number]
  /** where it flies in from */
  from: Pt
  delay?: number
  rotate?: number
  dim?: boolean
  glow?: boolean
  z?: number
  /** arrive face down, then turn over (board cards) */
  flipIn?: boolean
  /** where it slides to when it leaves (a folded hand goes to the middle) */
  exitTo?: Pt
}

export function PlayingCard({ card, faceUp, at, size, from, delay = 0, rotate = 0, dim = false, glow = false, z = 1, flipIn = false, exitTo }: CardProps) {
  const [w, h] = size
  return (
    <motion.div
      className="absolute"
      style={{ width: w, height: h, left: at.x - w / 2, top: at.y - h / 2, zIndex: z, perspective: 900 }}
      initial={{ x: from.x - at.x, y: from.y - at.y, rotate: -25, scale: 0.55, opacity: 0 }}
      animate={{ x: 0, y: 0, rotate, scale: 1, opacity: dim ? 0.45 : 1 }}
      exit={exitTo ? { x: exitTo.x - at.x, y: exitTo.y - at.y, opacity: 0, scale: 0.5, rotate: 40, transition: { duration: 0.45, ease: 'easeIn' } } : { opacity: 0, scale: 0.8, transition: { duration: 0.25 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 26, delay }}
      aria-label={faceUp && card ? cardName(card) : 'face-down card'}
      role="img"
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={{ rotateY: 180 }}
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1], delay: faceUp ? delay + (flipIn ? 0.35 : 0.3) : 0 }}
      >
        <div className={`absolute inset-0 overflow-hidden rounded-[7%] bg-white shadow-card ${glow ? 'ring-4 ring-gold' : ''}`} style={{ backfaceVisibility: 'hidden' }}>
          {card && <CardFace card={card} />}
        </div>
        <div className="absolute inset-0 overflow-hidden rounded-[7%] shadow-card" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
          <CardBack />
        </div>
      </motion.div>
    </motion.div>
  )
}
