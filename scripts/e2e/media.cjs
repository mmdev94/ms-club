// Records the demo videos into media/raw/ (WebM):
//   regulars.webm  one hand against the regulars, desktop
//   host.webm + guest.webm  a host (desktop) and a friend (phone) at one table, ending
//                           with the friend's fair-shuffle check. times.json aligns them.
//   PLAYWRIGHT=… node scripts/e2e/media.cjs <url>
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const fs = require('fs')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = 'media/raw'
const banner = (p) => p.locator('.font-display.text-\\[24px\\]')

async function regulars(b, base) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 750 }, recordVideo: { dir: `${out}/r`, size: { width: 1200, height: 750 } } })
  const p = await ctx.newPage()
  await p.goto(base); await wait(2500)
  await p.getByLabel('Your name at the table').fill('You')
  await p.getByRole('radio', { name: /Normal/ }).click(); await wait(600)
  await p.getByText('Play the regulars').click()
  let raised = false, shown = 0
  const end = Date.now() + 60000
  while (Date.now() < end && shown < 1) {
    await wait(300)
    const call = p.getByRole('button', { name: /^(Check|Call)/ })
    if (await call.count()) {
      await wait(1100)
      const raise = p.getByRole('button', { name: /^(Bet|Raise to) / })
      const label = await call.first().innerText().catch(() => '')
      const price = Number((/Call ([\d,]+)/.exec(label)?.[1] ?? '0').replace(/,/g, ''))
      if (!raised && (await raise.count())) { await p.getByRole('button', { name: '½ pot', exact: true }).click(); await wait(600); await raise.first().click(); raised = true }
      else if (price > 250) await p.getByRole('button', { name: 'Fold', exact: true }).click().catch(() => {})
      else await call.first().click().catch(() => {})
    }
    const t = await banner(p).allInnerTexts().catch(() => [])
    if (t.length && raised) { shown++; await wait(4000) }
  }
  await ctx.close()
  fs.renameSync(fs.readdirSync(`${out}/r`).map((f) => `${out}/r/${f}`)[0], `${out}/regulars.webm`)
}

async function friends(b, base) {
  const hctx = await b.newContext({ viewport: { width: 1100, height: 760 }, recordVideo: { dir: `${out}/h`, size: { width: 1100, height: 760 } } })
  const gctx = await b.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, recordVideo: { dir: `${out}/g`, size: { width: 390, height: 760 } } })
  const host = await hctx.newPage(); const hStart = Date.now()
  const guest = await gctx.newPage(); const gStart = Date.now()
  await guest.goto('data:text/html,<body style="margin:0;background:%230c0b10"></body>')
  await host.goto(base); await wait(1500)
  await host.getByLabel('Your name at the table').fill('Bouni')
  await host.getByText('Play with friends').click()
  const link = await host.locator('code').first().innerText()
  await wait(2200)
  await guest.goto(link); await wait(1200)
  await guest.getByLabel('Your name at the table').fill('Ana'); await wait(700)
  await guest.getByText('Join the table').click()
  await host.getByText('friend ✓').waitFor({ timeout: 60000 }); await wait(2200)
  await host.getByText('Start the game').click()
  let done = false
  const end = Date.now() + 70000
  while (Date.now() < end && !done) {
    await wait(400)
    for (const p of [host, guest]) { const btn = p.getByRole('button', { name: /^(Check|Call)/ }); if (await btn.count()) { await wait(700); await btn.first().click().catch(() => {}) } }
    const badge = guest.locator('header button', { hasText: '✓ Fair shuffle' })
    if (await badge.count()) {
      await wait(2500)
      await badge.first().click(); await wait(4500)
      done = true
    }
  }
  await hctx.close(); await gctx.close()
  fs.renameSync(fs.readdirSync(`${out}/h`).map((f) => `${out}/h/${f}`)[0], `${out}/host.webm`)
  fs.renameSync(fs.readdirSync(`${out}/g`).map((f) => `${out}/g/${f}`)[0], `${out}/guest.webm`)
  fs.writeFileSync(`${out}/times.json`, JSON.stringify({ guestOffsetMs: gStart - hStart }))
}

;(async () => {
  const base = process.argv[2] || 'http://localhost:4440/'
  fs.mkdirSync(out, { recursive: true })
  const b = await chromium.launch()
  const which = process.argv[3] || 'all'
  if (which !== 'friends') {
    await regulars(b, base)
    console.log('regulars recorded')
  }
  if (which !== 'regulars') {
    await friends(b, base)
    console.log('friends recorded')
  }
  await b.close()
})()
