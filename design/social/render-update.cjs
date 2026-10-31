// Renders update-mainnet.html to split-update-mainnet.png (1600x900). Usage: node render-update.cjs
const { chromium } = require('playwright')
const path = require('path')
;(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined })
  const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  await p.goto('file://' + path.resolve(__dirname, 'update-mainnet.html'), { waitUntil: 'networkidle' })
  await p.evaluate(() => document.fonts.ready)
  await p.screenshot({ path: path.resolve(__dirname, 'split-update-mainnet.png') })
  await b.close()
})()
