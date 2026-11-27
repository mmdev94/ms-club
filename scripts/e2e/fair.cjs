// Host + friend in two browsers; plays hands and prints the shuffle badges and the friend's check.
//   PLAYWRIGHT=… node scripts/e2e/fair.cjs <url>
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const base = process.argv[2] || 'http://localhost:4440/'
  const b = await chromium.launch()
  const host = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage()
  const guest = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage()
  for (const [n, p] of [['host', host], ['guest', guest]]) p.on('pageerror', (e) => console.log(n, 'pageerror', e.message))
  await host.goto(base); await wait(1000)
  await host.getByLabel('Your name at the table').fill('Host')
  await host.getByText('Play with friends').click()
  const link = await host.locator('code').first().innerText()
  const t0 = Date.now()
  await guest.goto(link); await guest.getByLabel('Your name at the table').fill('Friend'); await guest.getByText('Join the table').click()
  await host.getByText('friend ✓').waitFor({ timeout: 60000 })
  console.log('friend seated after', ((Date.now() - t0) / 1000).toFixed(1), 's')
  await host.getByText('Start the game').click()
  const seen = new Set()
  const end = Date.now() + 70000
  while (Date.now() < end) {
    await wait(500)
    for (const p of [host, guest]) { const btn = p.getByRole('button', { name: /^(Check|Call)/ }); if (await btn.count()) await btn.first().click().catch(() => {}) }
    const g = (await guest.locator('header button').allInnerTexts()).filter((x) => /huffle/.test(x)).join()
    if (g && !seen.has(g)) { seen.add(g); console.log('friend badge:', g) }
  }
  await guest.locator('header button', { hasText: /huffle/ }).first().click(); await wait(400)
  console.log((await guest.locator('ul').last().innerText()))
  await b.close()
})()
