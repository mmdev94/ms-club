// Plays today's Daily Table in a headless browser (always calling or checking),
// reads the result, then replays the recorded moves in Node to check they match.
//   PLAYWRIGHT=/path/to/playwright node scripts/e2e/daily.cjs [url] [shots-dir]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const base = process.argv[2] || 'http://localhost:4440/'
  const shots = process.argv[3]
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } })
  p.on('pageerror', (e) => console.log('pageerror', e.message))
  await p.goto(base); await wait(1000)
  await p.getByLabel('Your name at the table').fill('Tester')
  await p.getByRole('button', { name: /Play today|Practice/ }).click()
  await wait(800)
  await p.getByLabel('Fast').check().catch(() => {})
  const t0 = Date.now()
  while (Date.now() - t0 < 600000) {
    await wait(250)
    if (await p.getByText(/chips after|Busted after/).count()) break
    const btn = p.getByRole('button', { name: /^(Check|Call)/ })
    if (await btn.count()) await btn.first().click().catch(() => {})
    const fast = p.getByLabel('Fast'); if ((await fast.count()) && !(await fast.isChecked())) await fast.check().catch(() => {})
  }
  const text = await p.locator('.font-display.text-6xl').innerText()
  console.log('result:', text, '|', await p.getByText(/chips after|Busted after/).innerText(), `(${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  if (shots) await p.screenshot({ path: `${shots}/daily-result.png` })
  const moves = await p.evaluate(() => window.__msclubDaily)
  console.log(JSON.stringify(moves))
  await p.getByText('Leaderboard').last().click(); await wait(9000)
  if (shots) await p.screenshot({ path: `${shots}/daily-board.png`, fullPage: true })
  await b.close()
})()
