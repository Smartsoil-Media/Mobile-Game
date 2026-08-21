// Rasterize assets/icon.svg into the PNG sizes the manifest and iOS need.
// Run: PW_EXECUTABLE=/path/to/chromium node scripts/icons.mjs
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const svg = readFileSync(resolve('assets/icon.svg'), 'utf8')
const browser = await chromium.launch(
  process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {})
for (const size of [512, 192, 180]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  await page.screenshot({ path: `assets/icon-${size}.png` })
  await page.close()
  console.log(`assets/icon-${size}.png`)
}
await browser.close()
