import { useState } from 'react'
import type { Level } from './engine/brain'
import { useGame } from './game/useGame'
import { Controls } from './ui/Controls'
import { Lobby } from './ui/Lobby'
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

function Game({ name, level, onLeave }: { name: string; level: Level; onLeave: () => void }) {
  const game = useGame(name, level)
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
  const [name, setName] = useState(() => load('msclub-name', 'You'))
  const [level, setLevel] = useState<Level>(() => (['easy', 'normal', 'hard'].includes(load('msclub-level', '')) ? (load('msclub-level', 'normal') as Level) : 'normal'))
  const [seated, setSeated] = useState(false)
  return (
    <div className="h-full">
      {seated ? (
        <Game name={name.trim() || 'You'} level={level} onLeave={() => setSeated(false)} />
      ) : (
        <div className="h-full overflow-y-auto">
          <Lobby
            name={name}
            setName={(n) => {
              setName(n)
              save('msclub-name', n)
            }}
            level={level}
            setLevel={(l) => {
              setLevel(l)
              save('msclub-level', l)
            }}
            onPlay={() => setSeated(true)}
          />
        </div>
      )}
    </div>
  )
}
