// Where everything sits on the table, in "stage" pixels. The stage is a fixed
// size and gets scaled to the screen, so every animation uses the same numbers
// on a phone and a desktop. Seat 0 is always the human, at the bottom.

export interface Pt {
  x: number
  y: number
}
export interface Layout {
  w: number
  h: number
  center: Pt
  /** the felt oval */
  table: { rx: number; ry: number }
  seats: Pt[]
  /** where each seat's two cards sit */
  hole: Pt[]
  bets: Pt[]
  board: Pt
  pot: Pt
  deck: Pt
  /** card sizes: board, the human's cards, the others' cards */
  card: { board: [number, number]; mine: [number, number]; theirs: [number, number] }
  gap: number
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

function build(w: number, h: number, center: Pt, table: Layout['table'], seats: Pt[], card: Layout['card'], gap: number, mineAt: Pt, holeT: number, betT: number): Layout {
  return {
    w,
    h,
    center,
    table,
    seats,
    hole: seats.map((s, i) => (i === 0 ? mineAt : lerp(s, center, holeT))),
    bets: seats.map((s, i) => (i === 0 ? { x: center.x, y: mineAt.y - card.mine[1] / 2 - 46 } : lerp(s, center, betT))),
    board: center,
    pot: { x: center.x, y: center.y - card.board[1] / 2 - 44 },
    deck: { x: center.x, y: center.y - table.ry + 40 },
    card,
    gap,
  }
}

export const WIDE = build(
  1200,
  790,
  { x: 600, y: 330 },
  { rx: 500, ry: 262 },
  [
    { x: 600, y: 664 },
    { x: 108, y: 360 },
    { x: 330, y: 84 },
    { x: 870, y: 84 },
    { x: 1092, y: 360 },
  ],
  { board: [74, 104], mine: [92, 129], theirs: [52, 73] },
  10,
  { x: 600, y: 528 },
  0.34,
  0.5,
)

export const TALL = build(
  720,
  1120,
  { x: 360, y: 470 },
  { rx: 330, ry: 430 },
  [
    { x: 360, y: 1040 },
    { x: 78, y: 690 },
    { x: 182, y: 112 },
    { x: 538, y: 112 },
    { x: 642, y: 690 },
  ],
  { board: [80, 112], mine: [124, 174], theirs: [62, 87] },
  8,
  { x: 360, y: 850 },
  0.38,
  0.55,
)

/** x of board card k (0–4), centred. */
export const boardX = (l: Layout, k: number) => l.board.x + (k - 2) * (l.card.board[0] + l.gap)
