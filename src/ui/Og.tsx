// The link-preview card (1200×630), drawn with the game's own cards, faces and
// chips. scripts/e2e/media.cjs screenshots #/og into public/og.png.
import { CHARACTERS } from '../engine/characters'
import { Avatar } from './Avatar'
import { PlayingCard } from './Card'
import { Chip } from './Chips'

const FAN = ['As', 'Ks', 'Qs', 'Js', 'Ts']

export function OgCard() {
  return (
    <div className="relative overflow-hidden" style={{ width: 1200, height: 630, background: 'radial-gradient(ellipse at 72% 40%, #1b8a63 0%, #0f5c45 32%, #0a2f26 58%, #0c0b10 82%)' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 10% 0%, rgba(91,42,134,.75), transparent 55%)' }} />
      {/* the table rail */}
      <div className="absolute rounded-[50%]" style={{ left: 560, top: 70, width: 760, height: 520, border: '22px solid #3b2417', boxShadow: '0 30px 60px rgba(0,0,0,.6), inset 0 0 0 2px rgba(232,195,106,.25)' }} />
      {/* royal flush */}
      <div className="absolute" style={{ left: 640, top: 150, width: 480, height: 260 }}>
        {FAN.map((c, i) => (
          <PlayingCard key={c} card={c} faceUp at={{ x: 240 + (i - 2) * 70, y: 140 + Math.abs(i - 2) * 14 }} size={[128, 179]} from={{ x: 240, y: 140 }} rotate={(i - 2) * 10} z={i} />
        ))}
      </div>
      {/* chips */}
      <div className="absolute flex items-end gap-2" style={{ left: 770, top: 420 }}>
        {[
          ['#16161a', '#e8c36a', 7],
          ['#6b2fa3', '#f2ecff', 5],
          ['#c8323f', '#f6efe2', 4],
          ['#1f8a4c', '#f6efe2', 2],
        ].map(([c, e, n], i) => (
          <div key={i} className="relative" style={{ width: 46, height: 46 + Number(n) * 7 }}>
            {Array.from({ length: Number(n) }, (_, k) => (
              <div key={k} className="absolute left-0" style={{ bottom: k * 7, filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.55))' }}>
                <Chip color={String(c)} edge={String(e)} size={46} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="absolute" style={{ left: 72, top: 70, width: 560 }}>
        <p className="font-mono text-[18px] font-semibold uppercase tracking-[0.2em] text-gold/80">Texas Hold’em · free · no sign-up</p>
        <h1 className="mt-4 font-display text-[124px] leading-[0.95] text-cream">
          MS <span className="text-gold">Club</span>
        </h1>
        <p className="mt-6 text-[30px] leading-snug text-cream/85">Play the regulars, invite your friends, top the daily board.</p>
        <div className="mt-9 flex items-center gap-4">
          {CHARACTERS.map((c, i) => (
            <div key={c.id} className="flex flex-col items-center">
              <Avatar look={c.look} mood={i % 2 ? 'smug' : 'happy'} size={76} />
              <span className="mt-2 text-[16px] font-semibold text-cream/80">{c.name}</span>
            </div>
          ))}
        </div>
        <p className="mt-7 whitespace-nowrap text-[18px] text-cream/55">Provably fair shuffle · checked scores · on ms.computer</p>
      </div>
    </div>
  )
}
