// Records the demo videos into media/raw/ (WebM):
//   regulars.webm  upload a GIF face, play a hand against the regulars, open Mind-read
//   puzzle.webm    today's Spot the Bluff on a phone: the question, the answer, the reveal
//   host.webm + guest.webm  a host (laptop, photo) and a friend (phone, GIF) at one table,
//                  ending with the friend's fair-shuffle check; times.json aligns them
//   PLAYWRIGHT=… node scripts/e2e/media.cjs <url> [regulars|puzzle|friends|all]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const fs = require('fs')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = 'media/raw'
const CAT = 'media/samples/cat.gif'
const PHOTO = 'media/samples/photo.jpg'
const banner = (p) => p.locator('.font-display.text-\\[24px\\]')

function keep(dir, name) {
  fs.renameSync(fs.readdirSync(dir).map((f) => `${dir}/${f}`)[0], `${out}/${name}`)
}

async function regulars(b, base) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 750 }, recordVideo: { dir: `${out}/r`, size: { width: 1200, height: 750 } } })
  const p = await ctx.newPage()
  await p.goto(base); await wait(1800)
  await p.getByLabel('Your name at the table').fill('Mia'); await wait(400)
  await p.locator('input[type=file]').first().setInputFiles(CAT); await wait(1400)
  await p.getByRole('radio', { name: /Hard/ }).click(); await wait(900)
  await p.getByText('Play the regulars').click()
  let raised = false
  const end = Date.now() + 70000
  while (Date.now() < end) {
    await wait(300)
    const call = p.getByRole('button', { name: /^(Check|Call)/ })
    if (await call.count()) {
      await wait(900)
      const label = await call.first().innerText().catch(() => '')
      const price = Number((/Call ([\d,]+)/.exec(label)?.[1] ?? '0').replace(/,/g, ''))
      const raise = p.getByRole('button', { name: /^(Bet|Raise to) / })
      if (!raised && (await raise.count())) { await p.getByRole('button', { name: '½ pot', exact: true }).click(); await wait(500); await raise.first().click({ timeout: 1000 }).catch(() => {}); raised = true }
      else if (price > 300) await p.getByRole('button', { name: 'Fold', exact: true }).click({ timeout: 1000 }).catch(() => {})
      else await call.first().click({ timeout: 1000 }).catch(() => {})
    }
    const mind = p.getByRole('button', { name: /Mind-read/ })
    if ((await banner(p).count()) && (await mind.count())) {
      await wait(1800)
      const n = await mind.count()
      await mind.nth(Math.min(1, n - 1)).click({ timeout: 1000 }).catch(() => {})
      await wait(1800)
      await p.mouse.wheel(0, 500); await wait(2600)
      break
    }
  }
  await ctx.close()
  keep(`${out}/r`, 'regulars.webm')
}

async function puzzle(b, base) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, recordVideo: { dir: `${out}/p`, size: { width: 400, height: 860 } } })
  const p = await ctx.newPage()
  await p.goto(`${base}#/puzzle`); await wait(4500)
  await p.mouse.wheel(0, 420); await wait(2200)
  await p.getByRole('button', { name: /^Call/ }).click(); await wait(1500)
  await p.mouse.wheel(0, 500); await wait(3500)
  await ctx.close()
  keep(`${out}/p`, 'puzzle.webm')
}

async function friends(b, base) {
  const hctx = await b.newContext({ viewport: { width: 1100, height: 760 }, recordVideo: { dir: `${out}/h`, size: { width: 1100, height: 760 } } })
  const gctx = await b.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, recordVideo: { dir: `${out}/g`, size: { width: 390, height: 760 } } })
  const host = await hctx.newPage(); const hStart = Date.now()
  const guest = await gctx.newPage(); const gStart = Date.now()
  await guest.goto('data:text/html,<body style="margin:0;background:%230c0b10"></body>')
  await host.goto(base); await wait(1200)
  await host.getByLabel('Your name at the table').fill('Bouni')
  await host.locator('input[type=file]').first().setInputFiles(PHOTO); await wait(900)
  await host.getByText('Play with friends').click()
  const link = await host.locator('code').first().innerText()
  await wait(2000)
  await guest.goto(link); await wait(1000)
  await guest.getByLabel('Your name at the table').fill('Ana'); await wait(500)
  await guest.locator('input[type=file]').first().setInputFiles(CAT); await wait(1200)
  await guest.getByText('Join the table').click()
  await host.getByText('friend ✓').waitFor({ timeout: 60000 }); await wait(2200)
  await host.getByText('Start the game').click()
  let done = false
  const end = Date.now() + 70000
  while (Date.now() < end && !done) {
    await wait(400)
    for (const p of [host, guest]) {
      const btn = p.getByRole('button', { name: /^(Check|Call)/ })
      if (await btn.count()) {
        const label = await btn.first().innerText().catch(() => '')
        const price = Number((/Call ([\d,]+)/.exec(label)?.[1] ?? '0').replace(/,/g, ''))
        await wait(700)
        if (price > 300) await p.getByRole('button', { name: 'Fold', exact: true }).click({ timeout: 1000 }).catch(() => {})
        else await btn.first().click({ timeout: 1000 }).catch(() => {})
      }
    }
    const badge = guest.locator('header button', { hasText: '✓ Fair shuffle' })
    if (await badge.count()) {
      await wait(2500)
      await badge.first().click({ timeout: 1000 }).catch(() => {}); await wait(4500)
      done = true
    }
  }
  await hctx.close(); await gctx.close()
  keep(`${out}/h`, 'host.webm')
  keep(`${out}/g`, 'guest.webm')
  fs.writeFileSync(`${out}/times.json`, JSON.stringify({ guestOffsetMs: gStart - hStart }))
}

;(async () => {
  const base = process.argv[2] || 'http://localhost:4440/'
  const which = process.argv[3] || 'all'
  fs.mkdirSync(out, { recursive: true })
  const b = await chromium.launch()
  if (which === 'all' || which === 'regulars') { await regulars(b, base); console.log('regulars recorded') }
  if (which === 'all' || which === 'puzzle') { await puzzle(b, base); console.log('puzzle recorded') }
  if (which === 'all' || which === 'friends') { await friends(b, base); console.log('friends recorded') }
  await b.close()
})()
