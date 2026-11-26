import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { Game, SeatView } from '../game/useGame'
import type { ActKind } from '../engine/holdem'
import { Avatar, PLAYER_LOOK } from './Avatar'
import { CardBack, PlayingCard } from './Card'
import { ChipStack, FlyingChips, money } from './Chips'
import { boardX, TALL, WIDE, type Layout, type Pt } from './layout'

function useBox() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

function Felt({ L }: { L: Layout }) {
  const { center: c, table: t } = L
  return (
    <svg className="absolute inset-0" width={L.w} height={L.h} aria-hidden>
      <defs>
        <radialGradient id="felt" cx="50%" cy="42%" r="70%">
          <stop offset="0" stopColor="#1b8a63" />
          <stop offset=".55" stopColor="#11684c" />
          <stop offset="1" stopColor="#083a2b" />
        </radialGradient>
        <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6b4128" />
          <stop offset=".5" stopColor="#3b2417" />
          <stop offset="1" stopColor="#24150d" />
        </linearGradient>
        <filter id="tableShadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="26" stdDeviation="26" floodColor="#000" floodOpacity=".65" />
        </filter>
        <pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 6 L6 0" stroke="#000" strokeOpacity=".06" strokeWidth="1" />
        </pattern>
      </defs>
      <ellipse cx={c.x} cy={c.y} rx={t.rx + 30} ry={t.ry + 30} fill="url(#rail)" filter="url(#tableShadow)" />
      <ellipse cx={c.x} cy={c.y} rx={t.rx + 30} ry={t.ry + 30} fill="none" stroke="#8a5a3a" strokeOpacity=".7" strokeWidth="2" />
      <ellipse cx={c.x} cy={c.y} rx={t.rx + 6} ry={t.ry + 6} fill="#1a0f09" />
      <ellipse cx={c.x} cy={c.y} rx={t.rx} ry={t.ry} fill="url(#felt)" />
      <ellipse cx={c.x} cy={c.y} rx={t.rx} ry={t.ry} fill="url(#weave)" />
      <ellipse cx={c.x} cy={c.y} rx={t.rx - 34} ry={t.ry - 34} fill="none" stroke="#e8c36a" strokeOpacity=".28" strokeWidth="2" />
      <text x={c.x} y={c.y + L.card.board[1] / 2 + 62} textAnchor="middle" fontFamily="DM Serif Display, Georgia, serif" fontSize={L.w > 1000 ? 40 : 46} fill="#e8c36a" fillOpacity=".16" letterSpacing="6">
        MS CLUB
      </text>
    </svg>
  )
}

const ACT_LABEL: Record<ActKind, string> = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All in' }
const ACT_TONE: Record<ActKind, string> = {
  fold: 'bg-black/60 text-white/70',
  check: 'bg-white/90 text-ink',
  call: 'bg-white/90 text-ink',
  bet: 'bg-gold text-ink',
  raise: 'bg-gold text-ink',
  allin: 'bg-ruby text-white',
}

function Bubble({ text, id, place }: { text: string; id: number; place: Place }) {
  const [show, setShow] = useState(true)
  useEffect(() => {
    setShow(true)
    const t = setTimeout(() => setShow(false), 2800)
    return () => clearTimeout(t)
  }, [id])
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={id}
          initial={{ opacity: 0, y: 6, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className={`absolute z-30 w-max max-w-[200px] rounded-2xl bg-cream px-3 py-2 text-center text-[15px] font-medium leading-snug text-ink shadow-xl ${BUBBLE[place]}`}
        >
          {text}
          <span className={`absolute h-3 w-3 rotate-45 bg-cream ${TAIL[place]}`} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

type Place = 'above' | 'above-left' | 'above-right' | 'left' | 'right'
const BUBBLE: Record<Place, string> = {
  above: 'bottom-full left-1/2 mb-3 -translate-x-1/2',
  'above-left': 'bottom-full left-0 mb-3',
  'above-right': 'bottom-full right-0 mb-3',
  left: 'right-full top-2 mr-4',
  right: 'left-full top-2 ml-4',
}
const TAIL: Record<Place, string> = {
  above: '-bottom-1.5 left-1/2 -translate-x-1/2',
  'above-left': '-bottom-1.5 left-8',
  'above-right': '-bottom-1.5 right-8',
  left: '-right-1.5 top-4',
  right: '-left-1.5 top-4',
}
/** Speech bubbles point toward the middle of the table and never off the edge. */
function placeFor(at: Pt, L: Layout): Place {
  if (at.y < L.center.y - 100) return at.x < L.center.x ? 'right' : 'left'
  if (at.x < L.w * 0.25) return 'above-left'
  if (at.x > L.w * 0.75) return 'above-right'
  return 'above'
}

function Seat({ at, s, name, me, thinking, dealer, place, look, over }: { at: Pt; s: SeatView; name: string; me: boolean; thinking: boolean; dealer: boolean; place: Place; look: Parameters<typeof Avatar>[0]['look']; over: boolean }) {
  const size = me ? 86 : 78
  const winner = s.won > 0
  return (
    <div className="absolute z-20 flex flex-col items-center" style={{ left: at.x, top: at.y, transform: 'translate(-50%, -50%)' }}>
      <div className="relative">
        {thinking && <span className="absolute -inset-2 animate-ping rounded-full border-4 border-gold/70" />}
        <motion.div animate={{ scale: winner ? [1, 1.12, 1] : 1, opacity: s.folded ? 0.55 : 1 }} transition={{ duration: 0.6 }}>
          <Avatar look={look} mood={s.mood} size={size} ring={winner ? '#e8c36a' : thinking ? '#fff' : 'rgba(232,195,106,.55)'} />
        </motion.div>
        {dealer && (
          <span className="absolute -right-2 -top-1 grid h-7 w-7 place-items-center rounded-full border-2 border-ink/20 bg-white font-display text-[15px] text-ink shadow-lg" title="Dealer">
            D
          </span>
        )}
        <AnimatePresence>
          {s.action && (
            <motion.span
              key={`${s.action.kind}${s.action.amount}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-wide shadow ${ACT_TONE[s.action.kind]}`}
            >
              {ACT_LABEL[s.action.kind]}
              {s.action.kind !== 'fold' && s.action.kind !== 'check' ? ` ${money(s.action.amount)}` : ''}
            </motion.span>
          )}
        </AnimatePresence>
        {s.bubble && <Bubble text={s.bubble.text} id={s.bubble.id} place={place} />}
      </div>
      <div className={`mt-3 min-w-[124px] rounded-xl border px-3 py-1.5 text-center shadow-lg backdrop-blur ${winner ? 'border-gold bg-black/75' : 'border-white/10 bg-black/60'}`}>
        <p className="truncate text-[14px] font-semibold text-cream">{name}</p>
        <p className="font-mono text-[14px] text-gold">{s.allIn && !s.folded && s.stack === 0 && !over ? 'ALL IN' : money(s.stack)}</p>
      </div>
      {s.hand && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className={`mt-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold ${winner ? 'bg-gold text-ink' : 'bg-black/60 text-cream/80'}`}>
          {s.hand}
        </motion.p>
      )}
      {winner && (
        <motion.p initial={{ opacity: 0, y: 8, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="absolute -top-9 font-display text-[22px] text-gold drop-shadow-[0_2px_4px_rgba(0,0,0,.8)]">
          +{money(s.won)}
        </motion.p>
      )}
    </div>
  )
}

export function Table({ game }: { game: Game }) {
  const [box, size] = useBox()
  const L = size.w / Math.max(1, size.h) > 1.05 ? WIDE : TALL
  const scale = Math.min(size.w / L.w, size.h / L.h) || 0
  const { view, players, thinking } = game
  const pt = (f: { kind: 'seat' | 'bet' | 'pot'; seat?: number }): Pt => (f.kind === 'pot' ? L.pot : f.kind === 'bet' ? L.bets[f.seat!] : L.seats[f.seat!])

  return (
    <div ref={box} className="relative h-full w-full overflow-hidden">
      {scale > 0 && (
        <div className="absolute" style={{ width: L.w, height: L.h, transform: `scale(${scale})`, transformOrigin: '0 0', left: (size.w - L.w * scale) / 2, top: (size.h - L.h * scale) / 2 }}>
          <Felt L={L} />

          {/* the deck */}
          <div className="absolute" style={{ left: L.deck.x - L.card.theirs[0] / 2, top: L.deck.y - L.card.theirs[1] / 2, width: L.card.theirs[0], height: L.card.theirs[1] }}>
            {[3, 2, 1, 0].map((k) => (
              <div key={k} className="absolute inset-0 overflow-hidden rounded-[7%] shadow-card" style={{ transform: `translate(${k * 1.5}px, ${-k * 1.5}px)` }}>
                <CardBack />
              </div>
            ))}
          </div>

          {/* pot */}
          <AnimatePresence>{view.pot > 0 && <ChipStack key="pot" amount={view.pot} at={L.pot} size={28} />}</AnimatePresence>

          {/* the board */}
          <AnimatePresence>
            {view.board.map((c, k) => (
              <PlayingCard key={`${view.hand}-b${k}`} card={c} faceUp flipIn at={{ x: boardX(L, k), y: L.board.y }} size={L.card.board} from={L.deck} delay={k < 3 ? k * 0.12 : 0} z={5} />
            ))}
          </AnimatePresence>

          {/* hole cards */}
          <AnimatePresence>
            {view.seats.flatMap((s, i) =>
              (s.folded && i !== 0 ? [] : s.cards).map((c, k) => {
                const mine = i === 0
                const [w] = mine ? L.card.mine : L.card.theirs
                const spread = mine ? w * 0.56 : w * 0.42
                return (
                  <PlayingCard
                    key={`${view.hand}-${i}-${k}`}
                    card={c}
                    faceUp={s.faceUp}
                    at={{ x: L.hole[i].x + (k === 0 ? -spread : spread), y: L.hole[i].y }}
                    size={mine ? L.card.mine : L.card.theirs}
                    from={L.deck}
                    rotate={k === 0 ? -5 : 5}
                    delay={k * 0.28 + ((i - view.dealer - 1 + 5) % 5) * 0.06}
                    dim={s.folded}
                    exitTo={L.center}
                    glow={s.won > 0 && s.faceUp}
                    z={mine ? 12 : 4}
                  />
                )
              }),
            )}
          </AnimatePresence>

          {/* bets in front of each player */}
          <AnimatePresence>{view.seats.map((s, i) => (s.bet > 0 ? <ChipStack key={`bet-${i}`} amount={s.bet} at={L.bets[i]} /> : null))}</AnimatePresence>

          {/* chips on the move */}
          {view.flights.map((f) => (
            <FlyingChips key={f.id} from={pt(f.from)} to={pt(f.to)} amount={f.amount} onDone={() => game.land(f.id)} />
          ))}

          {view.seats.map((s, i) => (
            <Seat
              key={i}
              at={L.seats[i]}
              s={s}
              name={players[i]?.name ?? ''}
              me={i === 0}
              thinking={thinking === i}
              dealer={view.dealer === i && view.hand > 0}
              place={placeFor(L.seats[i], L)}
              over={view.over}
              look={players[i]?.character?.look ?? players[i]?.look ?? PLAYER_LOOK}
            />
          ))}

          <AnimatePresence mode="wait">
            {view.banner && (
              <motion.div
                key={view.banner}
                initial={{ opacity: 0, scale: 0.85, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="absolute z-30 max-w-[92%] rounded-2xl border border-gold/60 bg-black/85 px-5 py-2.5 text-center font-display text-[24px] leading-tight text-gold shadow-2xl"
                style={{ left: L.center.x, top: L.center.y + L.card.board[1] / 2 + 14, x: '-50%', width: 'max-content' }}
              >
                {view.banner}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
