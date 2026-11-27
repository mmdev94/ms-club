import { useEffect, useState } from 'react'
import type { Level } from './engine/brain'
import { lookFor } from './game/looks'
import { useGame } from './game/useGame'
import { Controls } from './ui/Controls'
import { Board, DailyScreen } from './ui/Daily'
import { Lobby } from './ui/Lobby'
import { GuestScreen, HostScreen } from './ui/Online'
import { Table } from './ui/Table'

const load = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) || d
  } catch {
    return d
  }
}
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* private mode */
  }
}

type Screen = { at: 'lobby' } | { at: 'solo' } | { at: 'host' } | { at: 'join'; roomId: string } | { at: 'daily' } | { at: 'board'; day?: string }

const fromHash = (): Screen => {
  const m = /^#\/t\/(.+)$/.exec(location.hash)
  if (m) return { at: 'join', roomId: decodeURIComponent(m[1]) }
  if (location.hash === '#/daily') return { at: 'daily' }
  const b = /^#\/board(?:\/(\d{4}-\d{2}-\d{2}))?$/.exec(location.hash)
  if (b) return { at: 'board', day: b[1] }
  return { at: 'lobby' }
}

function Solo({ name, level, onLeave }: { name: string; level: Level; onLeave: () => void }) {
  const game = useGame({ name, level, look: lookFor(name) })
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-4 py-2.5">
        <button onClick={onLeave} className="text-[14px] text-cream/60 hover:text-gold">← Lobby</button>
        <p className="font-display text-xl text-cream">MS <span className="text-gold">Club</span></p>
        <p className="font-mono text-[13px] text-cream/50">
          <span className="capitalize text-gold/80">{level}</span> · hand {game.view.hand}
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <Table game={game} />
      </div>
      <Controls game={game} />
    </div>
  )
}

export default function App() {
  const [name, setNameState] = useState(() => load('msclub-name', 'You'))
  const [level, setLevelState] = useState<Level>(() => (['easy', 'normal', 'hard'].includes(load('msclub-level', '')) ? (load('msclub-level', 'normal') as Level) : 'normal'))
  const [screen, setScreen] = useState<Screen>(fromHash)
  const setName = (n: string) => {
    setNameState(n)
    save('msclub-name', n)
  }
  const setLevel = (l: Level) => {
    setLevelState(l)
    save('msclub-level', l)
  }
  useEffect(() => {
    const on = () => setScreen(fromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const toLobby = () => {
    if (location.hash) history.replaceState(null, '', location.pathname)
    setScreen({ at: 'lobby' })
  }
  const who = name.trim() || 'You'
  const go = (at: 'daily' | 'board') => {
    history.replaceState(null, '', `${location.pathname}#/${at}`)
    setScreen({ at })
  }
  return (
    <div className="h-full">
      {screen.at === 'solo' && <Solo name={who} level={level} onLeave={toLobby} />}
      {screen.at === 'host' && <HostScreen name={who} level={level} onLeave={toLobby} />}
      {screen.at === 'join' && <GuestScreen roomId={screen.roomId} name={name === 'You' ? '' : name} setName={setName} onLeave={toLobby} />}
      {screen.at === 'daily' && <DailyScreen name={who} onLeave={toLobby} onBoard={() => go('board')} />}
      {screen.at === 'board' && <Board onLeave={toLobby} onPlay={() => go('daily')} start={screen.day} />}
      {screen.at === 'lobby' && (
        <div className="h-full overflow-y-auto">
          <Lobby name={name} setName={setName} level={level} setLevel={setLevel} onPlay={() => setScreen({ at: 'solo' })} onHost={() => setScreen({ at: 'host' })} onDaily={() => go('daily')} onBoard={() => go('board')} />
        </div>
      )}
    </div>
  )
}
