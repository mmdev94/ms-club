// Screenshots #/og into public/og.png (1200×630).   PLAYWRIGHT=… node scripts/e2e/og.cjs <url> <out.png>
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
;(async () => {
  const [base, out] = process.argv.slice(2)
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } })
  await p.goto(`${base}#/og`)
  await p.waitForTimeout(2500) // fonts + card animations
  await p.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } })
  await b.close()
})()
