// Your face at the table: the cartoon picked from your name, or your own
// picture or GIF. Pictures are cropped to a small square in the browser;
// GIFs stay animated if they're small enough. Kept on this device only.
import { useRef, useState } from 'react'
import { lookFor } from '../game/looks'
import { Avatar } from './Avatar'

/** GIFs up to this size stay animated; anything bigger becomes a still picture. */
export const MAX_GIF = 400_000
const SIDE = 192
const OK_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export const loadFace = (): string | undefined => {
  try {
    return localStorage.getItem('msclub-face') ?? undefined
  } catch {
    return undefined
  }
}
const saveFace = (v: string | undefined) => {
  try {
    if (v) localStorage.setItem('msclub-face', v)
    else localStorage.removeItem('msclub-face')
  } catch {
    /* private mode or full */
  }
}

/** Accepts only small, real images; used for faces that arrive from other players too. */
export const isFace = (v: unknown): v is string => typeof v === 'string' && v.length < 600_000 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)

const readAsDataUrl = (f: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(r.error)
    r.readAsDataURL(f)
  })

async function toSquare(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const s = Math.min(img.naturalWidth, img.naturalHeight)
    const c = document.createElement('canvas')
    c.width = c.height = SIDE
    c.getContext('2d')!.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, SIDE, SIDE)
    const webp = c.toDataURL('image/webp', 0.85)
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function faceFromFile(file: File): Promise<{ face: string; note?: string }> {
  if (!OK_TYPES.includes(file.type)) throw new Error('Use a PNG, JPEG, WebP or GIF picture.')
  if (file.type === 'image/gif' && file.size <= MAX_GIF) {
    const face = await readAsDataUrl(file)
    if (isFace(face)) return { face }
  }
  const face = await toSquare(file)
  return { face, note: file.type === 'image/gif' ? 'That GIF is over 400 KB, so it became a still picture.' : undefined }
}

export function FacePicker({ name, face, setFace }: { name: string; face?: string; setFace: (f: string | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const pick = async (f: File | undefined) => {
    if (!f) return
    try {
      const r = await faceFromFile(f)
      setFace(r.face)
      saveFace(r.face)
      setNote(r.note ?? '')
    } catch (e) {
      setNote((e as Error).message || 'Couldn’t read that picture.')
    }
  }
  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[.03] p-3 text-left">
      <Avatar look={lookFor(name)} mood="happy" size={64} image={face} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-cream">{face ? 'Your picture' : 'Your cartoon'}</p>
        <div className="mt-1 flex flex-wrap gap-2 text-[13px]">
          <button type="button" onClick={() => input.current?.click()} className="rounded-full border border-gold/50 px-3 py-1 font-semibold text-gold hover:bg-gold/10">
            Upload picture or GIF
          </button>
          {face && (
            <button
              type="button"
              onClick={() => {
                setFace(undefined)
                saveFace(undefined)
                setNote('')
              }}
              className="rounded-full border border-white/15 px-3 py-1 text-cream/70 hover:border-white/35"
            >
              Use the cartoon
            </button>
          )}
        </div>
        {note && <p className="mt-1.5 text-[12.5px] text-cream/55">{note}</p>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? undefined)} />
    </div>
  )
}
