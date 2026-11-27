// Posts one honest and one fake score for a test day from two browsers (dev server),
// then opens that day's board: the honest one must be ranked, the fake one left out.
//   PLAYWRIGHT=… node scripts/e2e/board.cjs <dev-url> '<session json>' [shots-dir]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const [base, json, shots] = process.argv.slice(2)
  const s = JSON.parse(json)
  const b = await chromium.launch()
  const honest = await (await b.newContext()).newPage()
  const cheat = await (await b.newContext()).newPage()
  for (const p of [honest, cheat]) { p.on('pageerror', (e) => console.log('pageerror', e.message)); await p.goto(base); await wait(1500) }
  const n1 = await honest.evaluate((x) => globalThis.__msclubBoard.post({ name: 'e2e honest', day: x.day, moves: x.moves, final: x.final }), s)
  const n2 = await cheat.evaluate((x) => globalThis.__msclubBoard.post({ name: 'e2e cheater', day: x.day, moves: x.moves, final: 999999 }), s)
  console.log('relays accepted: honest', n1, 'cheater', n2)
  await wait(2000)
  const viewer = await (await b.newContext({ viewport: { width: 900, height: 900 } })).newPage()
  await viewer.goto(`${base}#/board/${s.day}`)
  await wait(12000)
  const rows = await viewer.locator('ol li').allInnerTexts()
  console.log('ranked:', rows.map((r) => r.replace(/\s+/g, ' ')).join(' | '))
  console.log('note:', await viewer.getByText(/left out/).innerText().catch(() => '(none)'))
  if (shots) await viewer.screenshot({ path: `${shots}/board-test.png` })
  await b.close()
})()
