import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
async function waitSim(pg, s, ms = 120000) {
  const t0 = await pg.evaluate(() => window.__game.state.t)
  const start = Date.now()
  for (;;) {
    await pg.waitForTimeout(100)
    if (await pg.evaluate(() => window.__game.state.t) - t0 >= s) return
    if (Date.now() - start > ms) throw new Error('slow sim')
  }
}
const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
await page.goto('file://' + resolve('dist/index.html') + '?map=classic')
await page.evaluate(() => window.__game.allowPortrait())
await page.tap('#play-btn')
const setup = await page.evaluate(() => {
  const g = window.__game.state
  g.ai.enabled = false
  // a U-shaped tree pocket opening WEST; the walk crosses right through its mouth
  for (let y = 1075; y <= 1225; y += 25) window.__game.spawn('tree', -1, 1760, y) // back wall
  for (let x = 1620; x <= 1740; x += 25) { window.__game.spawn('tree', -1, x, 1075); window.__game.spawn('tree', -1, x, 1225) }
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  v.x = 1560; v.y = 1150; v.state = 'move'; v.tx = 1830; v.ty = 1150; v.targetId = undefined
  window.__game.setSpeed(15)
  return { villId: v.id }
})
await waitSim(page, 30)
const result = await page.evaluate(({ villId }) => {
  const g = window.__game.state
  const v = g.byId.get(villId)
  return { d: Math.round(Math.hypot(v.x - 1830, v.y - 1150)), at: { x: Math.round(v.x), y: Math.round(v.y) }, state: v.state }
}, setup)
console.log('pocket escape:', result)
await browser.close()
if (result.d > 40) { console.log('STILL STUCK'); process.exit(1) }
console.log('POCKET PASSED')
