import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { Game } from '../game/useGame'
import { money } from './Chips'
import { ShareHand } from './Replay'

export function Controls({ game }: { game: Game }) {
  const { myTurn: l, view, myHand, players } = game
  const [to, setTo] = useState(0)
  const pot = view.pot + view.seats.reduce((a, s) => a + s.bet, 0)
  const currentBet = Math.max(0, ...view.seats.map((s) => s.bet))

  useEffect(() => {
    if (l) setTo(l.minTo)
  }, [l?.seat, l?.minTo, view.hand, view.board.length])

  const busted = !!players[0] && players[0].stack <= 0 && view.over && view.seats[0]?.stack <= 0
  if (busted)
    return (
      <Panel>
        <p className="text-cream/80">Out of chips. It happens to the best of us.</p>
        {game.canRebuy ? <button onClick={game.rebuy} className="btn-gold">Buy back in · 2,000 free chips</button> : <p className="text-[14px] text-cream/60">The table tops you up to 2,000 at the next hand.</p>}
      </Panel>
    )

  if (!l)
    return (
      <Panel>
        <p className="min-h-[24px] text-[15px] text-cream/70">
          {myHand ? <span className="mr-3 rounded-full bg-gold/15 px-3 py-1 font-semibold text-gold">{myHand}</span> : null}
          {view.seats[0]?.folded ? 'You folded — watch the others fight it out.' : game.thinking > 0 && players[game.thinking] ? <Waiting name={players[game.thinking].name} deadline={game.deadline} /> : view.over ? 'Next hand coming up…' : ' '}
        </p>
        <div className="flex items-center gap-4">
          {view.over && <ShareHand game={game} />}
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-cream/60">
            <input type="checkbox" checked={game.fast} onChange={(e) => game.setFast(e.target.checked)} className="accent-[#e8c36a]" />
            Fast
          </label>
        </div>
      </Panel>
    )

  const presets = [
    { label: '½ pot', to: currentBet + Math.round(pot / 2) },
    { label: 'Pot', to: currentBet + pot + l.toCall },
    { label: 'All in', to: l.maxTo },
  ].map((p) => ({ ...p, to: Math.max(l.minTo, Math.min(l.maxTo, p.to)) }))
  const raiseWord = currentBet > 0 ? 'Raise to' : 'Bet'

  return (
    <Panel>
      {game.deadline && <Countdown deadline={game.deadline} />}
      <AnimatePresence>
        {myHand && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-full bg-gold/15 px-3 py-1 text-[14px] font-semibold text-gold">
            {myHand}
          </motion.span>
        )}
      </AnimatePresence>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => game.play({ type: 'fold' })} className="btn-dark">
          Fold
        </button>
        <button onClick={() => game.play({ type: l.canCheck ? 'check' : 'call' })} className="btn-light">
          {l.canCheck ? 'Check' : `Call ${money(l.toCall)}`}
        </button>
        {l.canRaise && (
          <button onClick={() => game.play({ type: 'raise', to })} className="btn-gold">
            {to >= l.maxTo ? `All in ${money(l.maxTo)}` : `${raiseWord} ${money(to)}`}
          </button>
        )}
      </div>
      {l.canRaise && l.maxTo > l.minTo && (
        <div className="flex w-full max-w-[520px] items-center gap-3">
          <input
            type="range"
            min={l.minTo}
            max={l.maxTo}
            step={10}
            value={to}
            onChange={(e) => setTo(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer accent-[#e8c36a]"
            aria-label="Raise amount"
          />
          {presets.map((p) => (
            <button key={p.label} onClick={() => setTo(p.to)} className="rounded-full border border-gold/40 px-2.5 py-1 text-[12.5px] font-semibold text-gold hover:bg-gold/10">
              {p.label}
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[112px] flex-col items-center justify-center gap-3 border-t border-white/10 bg-black/40 px-4 py-4 backdrop-blur">{children}</div>
}

function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [on])
  return now
}

/** "Ana is thinking… 18 s" */
function Waiting({ name, deadline }: { name: string; deadline: number | null }) {
  const now = useNow(!!deadline)
  const left = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null
  return (
    <>
      {name} is thinking…{left !== null && <span className="ml-2 font-mono text-gold/80">{left} s</span>}
    </>
  )
}

/** Your time to act at a friends' table. */
function Countdown({ deadline }: { deadline: number }) {
  const now = useNow(true)
  const left = Math.max(0, deadline - now)
  const share = Math.min(1, left / 30000)
  return (
    <div className="flex w-full max-w-[520px] items-center gap-3 text-[13px] text-cream/60">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${share < 0.25 ? 'bg-ruby' : 'bg-gold'}`} style={{ width: `${share * 100}%`, transition: 'width .25s linear' }} />
      </div>
      <span className="font-mono">{Math.ceil(left / 1000)} s</span>
    </div>
  )
}
