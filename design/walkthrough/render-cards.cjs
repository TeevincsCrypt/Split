// Renders cards.html (#bg, #frame, #title, #end) to PNGs. Usage: node render-cards.js <outdir>
const { chromium } = require('playwright')
const path = require('path')
;(async () => {
  const out = process.argv[2]
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
  for (const id of ['bg', 'frame', 'title', 'end']) {
    await p.goto('file://' + path.resolve(__dirname, 'cards.html') + '#' + id)
    await p.reload()
    await p.evaluate(() => document.fonts.ready)
    await p.screenshot({ path: `${out}/${id}.png`, omitBackground: id === 'frame' })
  }
  await b.close()
})()
