// Headless playtest: loads the built game at a phone viewport, drives the
// core loop through the window.__game hooks, and saves screenshots to shots/.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

mkdirSync('shots', { recursive: true })

// Wait until the game's own clock advances — immune to rAF throttling of
// background pages, which makes wall-clock waits under-deliver sim time.
async function waitSim(pg, simSeconds, timeoutMs = 60000) {
  const t0 = await pg.evaluate(() => window.__game.state.t)
  const start = Date.now()
  for (;;) {
    await pg.waitForTimeout(100)
    const t = await pg.evaluate(() => window.__game.state.t)
    if (t - t0 >= simSeconds) return
    if (Date.now() - start > timeoutMs) throw new Error(`sim only advanced ${(t - t0).toFixed(1)}s of ${simSeconds}s`)
  }
}
const browser = await chromium.launch(
  process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {},
)
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
})
page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text()) })
page.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message))

await page.goto('file://' + resolve('dist/index.html'))
await page.waitForTimeout(600)
await page.screenshot({ path: 'shots/1-start.png' })

// start the game; freeze the enemy AI so the smoke test can verify the
// economy/training flow deterministically (the AI is checked separately below)
await page.tap('#play-btn')
await page.evaluate(() => { window.__game.state.ai.enabled = false })
await page.waitForTimeout(400)
await page.screenshot({ path: 'shots/2-base.png' })

const state = () => page.evaluate(() => {
  const g = window.__game.state
  return {
    t: Math.round(g.t),
    wood: Math.round(g.res[0].wood),
    gold: Math.round(g.res[0].gold),
    ents: g.ents.length,
    playerVillagers: g.ents.filter(e => e.team === 0 && e.kind === 'villager').length,
    playerSoldiers: g.ents.filter(e => e.team === 0 && e.kind === 'swordsman').length,
    enemySoldiers: g.ents.filter(e => e.team === 1 && e.kind === 'swordsman').length,
    playerBarracks: g.ents.filter(e => e.team === 0 && e.kind === 'barracks').length,
    over: g.over,
  }
})

// dock is contextual: hidden with nothing selected
if (!(await page.isHidden('#dock'))) throw new Error('dock visible with no selection')

// 1) order a villager to chop the nearest tree via a real tap
await page.evaluate(() => {
  const g = window.__game.state
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  window.__game.select(v.id)
})
await page.waitForTimeout(250)
if (await page.isHidden('#dock')) throw new Error('dock hidden with villager selected')
if (!(await page.isVisible('[data-cmd="build-house"]'))) throw new Error('build buttons missing for villager')

// icon dock: 7 sprite-canvas build buttons; barracks (150 wood) greyed at 100 wood
const dockIcons = await page.evaluate(() => ({
  buttons: [...document.querySelectorAll('#dock-buttons button.cmd.icon')].map(b => b.dataset.cmd),
  canvases: document.querySelectorAll('#dock-buttons canvas.sprite-icon').length,
  hintGone: !document.getElementById('hint'),
  disabled: [...document.querySelectorAll('#dock-buttons button.disabled')].map(b => b.dataset.cmd),
}))
console.log('icon dock:', dockIcons)
if (dockIcons.buttons.length !== 7 || dockIcons.canvases !== 7) throw new Error('expected 7 sprite-icon build buttons')
if (!dockIcons.hintGone) throw new Error('hint element still present')
if (!dockIcons.disabled.includes('build-barracks')) throw new Error('unaffordable barracks not greyed out')
await page.evaluate(() => { window.__game.state.res[0].wood = 0 })
await page.waitForTimeout(150)
const allDisabled = await page.evaluate(() =>
  document.querySelectorAll('#dock-buttons button.disabled').length)
if (allDisabled !== 7) throw new Error('with 0 wood all build buttons should be greyed out')
await page.evaluate(() => { window.__game.state.res[0].wood = 100 })
await page.waitForTimeout(150)
await page.evaluate(() => {
  // aim the camera so a tree is on screen, then find its screen position
  const g = window.__game.state
  const tree = g.ents
    .filter(e => e.kind === 'tree')
    .sort((a, b) => (Math.hypot(a.x - 380, a.y - 950)) - (Math.hypot(b.x - 380, b.y - 950)))[0]
  g.camera.x = tree.x; g.camera.y = tree.y
  window.__treePos = { x: tree.x, y: tree.y }
})
const treeTap = await page.evaluate(() => {
  const g = window.__game.state
  const c = document.getElementById('game').getBoundingClientRect()
  return {
    x: c.width / 2 + (window.__treePos.x - g.camera.x) * g.camera.zoom,
    y: c.height / 2 + (window.__treePos.y - g.camera.y) * g.camera.zoom,
  }
})
await page.tap('#game', { position: treeTap })
await page.waitForTimeout(300)
console.log('after gather order:', await state())

// 2) fast-forward the economy, then script a barracks + army via the sim API
await page.evaluate(() => window.__game.setSpeed(20))
await page.waitForTimeout(2500) // ~50 sim-seconds of chopping
console.log('after ff gather:', await state())

await page.evaluate(() => {
  const g = window.__game.state
  // put remaining villagers on gold so soldiers can be paid for
  const mine = g.ents.find(e => e.kind === 'goldmine')
  for (const v of g.ents.filter(e => e.team === 0 && e.kind === 'villager')) {
    if (v.state === 'idle') { v.state = 'gather'; v.targetId = mine.id }
  }
})
await page.waitForTimeout(2500)
const s1 = await state()
console.log('economy check:', s1)
if (s1.wood <= 100 && s1.gold <= 0) throw new Error('economy did not produce resources')

// place a barracks through the real placement flow
await page.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  window.__game.select(v.id)
  g.res[0].wood = Math.max(g.res[0].wood, 200)
  g.uiDirty = true
})
await page.waitForTimeout(300)
await page.screenshot({ path: 'shots/3-villager-selected.png' })
await page.tap('[data-cmd="build-barracks"]')
await page.waitForTimeout(200)
const placeTap = await page.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  g.camera.x = tc.x; g.camera.y = tc.y
  const c = document.getElementById('game').getBoundingClientRect()
  return { x: c.width / 2 - 150 * g.camera.zoom, y: c.height / 2 + 40 * g.camera.zoom }
})
await page.tap('#game', { position: placeTap })
await page.waitForTimeout(300)
const s2 = await state()
console.log('after barracks placement:', s2)
if (!s2.playerBarracks) throw new Error('barracks was not placed')
await page.screenshot({ path: 'shots/4-construction.png' })

// let it finish building, then train soldiers
await page.evaluate(() => window.__game.setSpeed(20))
await page.waitForTimeout(1600)
await page.evaluate(() => {
  const g = window.__game.state
  const b = g.ents.find(e => e.team === 0 && e.kind === 'barracks' && e.complete)
  if (!b) throw new Error('barracks never completed')
  g.res[0].gold = 400
  for (let i = 0; i < 5; i++) b.queue.push({ kind: 'swordsman', t: 1 + i, total: 9 })
})
await page.waitForTimeout(1200)
const s3 = await state()
console.log('after training:', s3)
if (s3.playerSoldiers < 4) throw new Error('soldiers did not train')

// 2.5) army button: selects every soldier and recenters the camera on them
await page.tap('#army-btn')
await page.waitForTimeout(200)
const armySel = await page.evaluate(() => {
  const g = window.__game.state
  const army = g.ents.filter(e => e.team === 0 && e.kind === 'swordsman')
  const cx = army.reduce((s, e) => s + e.x, 0) / army.length
  const cy = army.reduce((s, e) => s + e.y, 0) / army.length
  // y is often clamped on tall viewports (whole map height fits), so check x only
  return { sel: g.selection.length, offCenterX: Math.abs(g.camera.x - cx) }
})
console.log('army select:', armySel)
if (armySel.sel < s3.playerSoldiers) throw new Error('army button did not select all soldiers')
if (armySel.offCenterX > 150) throw new Error('army button did not recenter the camera')

// 3) march the army on the enemy town hall until victory
await page.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 1 && e.kind === 'towncenter')
  for (const u of g.ents.filter(e => e.team === 0 && e.kind === 'swordsman')) {
    u.state = 'attack'; u.targetId = tc.id
  }
  // reinforce so the win is reliable in the smoke test
  const b = g.ents.find(e => e.team === 0 && e.kind === 'barracks' && e.complete)
  for (let i = 0; i < 5; i++) b.queue.push({ kind: 'swordsman', t: 1 + i, total: 9 })
})
let final = null
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1000)
  final = await state()
  if (i % 5 === 0) console.log('battle:', final)
  if (final.over) break
  await page.evaluate(() => {
    const g = window.__game.state
    const tc = g.ents.find(e => e.team === 1 && e.kind === 'towncenter')
    if (!tc) return
    for (const u of g.ents.filter(e => e.team === 0 && e.kind === 'swordsman' && e.state === 'idle')) {
      u.state = 'attack'; u.targetId = tc.id
    }
  })
}
console.log('final:', final)
await page.evaluate(() => window.__game.setSpeed(1))
await page.waitForTimeout(300)
await page.screenshot({ path: 'shots/5-end.png' })
if (final?.over !== 'win') throw new Error('did not reach victory: ' + JSON.stringify(final))

// 4) fresh page: the enemy AI builds a real economy and army from the same start
const page3 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })
await page3.bringToFront()
await page3.goto('file://' + resolve('dist/index.html'))
await page3.tap('#play-btn')
await page3.evaluate(() => {
  const g = window.__game.state
  // the AI must not actually win while we watch it grow
  const pTC = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  pTC.hp = pTC.maxHp = 100000
  window.__game.setSpeed(20)
})
await waitSim(page3, 300, 180000)
const aiCheck = await page3.evaluate(() => {
  const g = window.__game.state
  return {
    res: { ...g.res[1] },
    vills: g.ents.filter(e => e.team === 1 && e.kind === 'villager').length,
    barracks: g.ents.filter(e => e.team === 1 && e.kind === 'barracks').length,
    houses: g.ents.filter(e => e.team === 1 && e.kind === 'house').length,
    soldiers: g.ents.filter(e => e.team === 1 && e.kind === 'swordsman').length,
    attacking: g.ai.attacking,
    over: g.over,
  }
})
console.log('enemy AI after 300 sim-s:', aiCheck)
if (aiCheck.vills <= 3) throw new Error('enemy AI trained no villagers')
if (aiCheck.barracks < 1) throw new Error('enemy AI built no barracks')
if (aiCheck.soldiers < 1 && !aiCheck.attacking) throw new Error('enemy AI raised no army')

// freeze and clean up the AI so the remaining feature checks are deterministic
await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  g.ai.enabled = false
  for (const e of g.ents.filter(e => e.team === 1 && e.kind === 'swordsman')) e.hp = 0
  for (const v of g.ents.filter(e => e.team === 1 && e.kind === 'villager')) {
    v.state = 'idle'; v.targetId = undefined
  }
  const pTC = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  pTC.maxHp = 800; pTC.hp = 800
  // the AI's push may have cost the idle player some units — restore the
  // starting roster so the remaining feature checks have what they expect
  while (g.ents.filter(e => e.team === 0 && e.kind === 'villager').length < 3) {
    window.__game.spawn('villager', 0, pTC.x + 60 + Math.random() * 40, pTC.y + 60)
  }
  if (!g.ents.some(e => e.team === 0 && e.kind === 'scout')) {
    window.__game.spawn('scout', 0, pTC.x - 90, pTC.y - 50)
  }
})
await page3.waitForTimeout(300)

// 5) bell + garrison: villagers shelter in the TC and it shoots attackers down
await page3.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  for (let i = 0; i < 2; i++) {
    const id = window.__game.spawn('swordsman', 1, tc.x + 260 + i * 30, tc.y - 200)
    const u = g.byId.get(id)
    u.state = 'attackmove'; u.tx = tc.x; u.ty = tc.y
  }
  window.__game.select(tc.id)
})
await page3.waitForTimeout(300)
await page3.tap('[data-cmd="bell"]')
await page3.evaluate(() => window.__game.setSpeed(10))
await page3.waitForTimeout(1000)
const gar = await page3.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  return { garrison: tc.garrison ?? 0, hidden: g.ents.filter(e => e.hidden).length }
})
console.log('garrison:', gar)
if (gar.garrison < 1 || gar.hidden < 1) throw new Error('villagers did not garrison')

let defense = null
let sawArrows = false
for (let i = 0; i < 40; i++) {
  await page3.waitForTimeout(500)
  defense = await page3.evaluate(() => {
    const g = window.__game.state
    const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
    return {
      raiders: g.ents.filter(e => e.team === 1 && e.kind === 'swordsman' && (e.state === 'attackmove' || e.state === 'attack')).length,
      arrows: g.arrowsFired,
      tcHp: tc ? Math.round(tc.hp) : 0,
    }
  })
  if (defense.arrows > 0 && !sawArrows) {
    sawArrows = true
    await page3.evaluate(() => window.__game.setSpeed(1))
    await page3.waitForTimeout(300)
    await page3.screenshot({ path: 'shots/7-garrison-defense.png' })
    await page3.evaluate(() => window.__game.setSpeed(10))
  }
  if (defense.raiders === 0 && i > 2) break
}
console.log('defense:', defense, 'sawArrows:', sawArrows)
if (!sawArrows) throw new Error('garrisoned TC never fired arrows')
if (defense.raiders > 0) throw new Error('raiders survived the garrisoned TC')
if (!defense.tcHp) throw new Error('TC died during garrison test')

await page3.evaluate(() => window.__game.setSpeed(1))
await page3.waitForTimeout(300)
await page3.tap('[data-cmd="doors"]')
await page3.waitForTimeout(400)
const released = await page3.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  return { garrison: tc.garrison ?? 0, hidden: g.ents.filter(e => e.hidden).length }
})
console.log('released:', released)
if (released.garrison !== 0 || released.hidden !== 0) throw new Error('villagers were not released')


// 6) placement mode dies when you tap your own stuff instead of open ground
await page3.evaluate(() => {
  const g = window.__game.state
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  window.__game.select(v.id)
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  g.camera.x = tc.x; g.camera.y = tc.y
})
await page3.waitForTimeout(250)
await page3.tap('[data-cmd="build-house"]')
await page3.waitForTimeout(200)
const canvasBox = await page3.evaluate(() => {
  const c = document.getElementById('game').getBoundingClientRect()
  return { x: c.width / 2, y: c.height / 2 }
})
await page3.tap('#game', { position: canvasBox }) // tap the TC mid-placement
await page3.waitForTimeout(250)
const placeState = await page3.evaluate(() => {
  const g = window.__game.state
  return {
    placing: g.placing,
    houses: g.ents.filter(e => e.team === 0 && e.kind === 'house').length,
    selected: g.selection.length,
  }
})
console.log('placement cancel:', placeState)
if (placeState.placing !== null || placeState.houses > 0) throw new Error('placement was not cancelled by tapping own building')
if (!placeState.selected) throw new Error('tap did not select the tapped entity')

// 7) tapping empty ground with a building selected clears selection and hides the dock
await page3.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  window.__game.select(tc.id)
  g.camera.x = 330; g.camera.y = 550 // open meadow
})
await page3.tap('#game', { position: canvasBox })
await page3.waitForTimeout(250)
if (!(await page3.isHidden('#dock'))) throw new Error('dock still visible after clearing selection')

// 8) a second villager tapped onto a construction site joins the build
await page3.evaluate(() => {
  const g = window.__game.state
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  window.__game.select(vills[0].id)
  g.res[0].wood = 200
  g.camera.x = 330; g.camera.y = 550
  g.uiDirty = true
})
await page3.waitForTimeout(250)
await page3.tap('[data-cmd="build-house"]')
await page3.waitForTimeout(200)
await page3.tap('#game', { position: canvasBox }) // place on open meadow
await page3.waitForTimeout(250)
const siteInfo = await page3.evaluate(() => {
  const g = window.__game.state
  const site = g.ents.find(e => e.team === 0 && e.kind === 'house' && !e.complete)
  if (!site) return null
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  const other = vills.find(v => v.state !== 'build')
  window.__game.select(other.id)
  g.camera.x = site.x; g.camera.y = site.y
  return { siteId: site.id, otherId: other.id }
})
if (!siteInfo) throw new Error('house site was not placed for the join-build test')
await page3.waitForTimeout(250)
await page3.tap('#game', { position: canvasBox }) // tap the construction site
await page3.waitForTimeout(250)
const joined = await page3.evaluate(({ siteId, otherId }) => {
  const g = window.__game.state
  const v = g.byId.get(otherId)
  return { state: v.state, target: v.targetId === siteId, builders: g.ents.filter(e => e.state === 'build').length }
}, siteInfo)
console.log('join build:', joined)
if (joined.state !== 'build' || !joined.target) throw new Error('second villager did not join construction')
if (joined.builders < 2) throw new Error('expected at least two builders on the site')
await page3.evaluate(() => window.__game.setSpeed(10))
await page3.waitForTimeout(3000) // walk to the site + build together
const houseDone = await page3.evaluate(() =>
  window.__game.state.ents.some(e => e.team === 0 && e.kind === 'house' && e.complete))
if (!houseDone) throw new Error('house never completed with two builders')

// 9) tap a selected villager to deselect; double-tap to select the nearby crew
const villTap = await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  // the two house-builders are standing together at the finished house
  const house = g.ents.find(e => e.team === 0 && e.kind === 'house' && e.complete)
  const near = g.ents.filter(e => e.team === 0 && e.kind === 'villager' &&
    Math.hypot(e.x - house.x, e.y - house.y) < 120)
  const v = near[0]
  window.__game.select(v.id)
  g.camera.x = v.x; g.camera.y = v.y
  const c = document.getElementById('game').getBoundingClientRect()
  return { x: c.width / 2, y: c.height / 2, nearCount: near.length }
})
if (villTap.nearCount < 2) throw new Error('setup: expected 2+ villagers at the house')
await page3.waitForTimeout(500) // stay outside the double-tap window
await page3.tap('#game', { position: villTap })
await page3.waitForTimeout(250)
const afterToggle = await page3.evaluate(() => window.__game.state.selection.length)
console.log('deselect toggle:', { selected: afterToggle })
if (afterToggle !== 0) throw new Error('tapping a selected villager did not deselect it')
if (!(await page3.isHidden('#dock'))) throw new Error('dock still visible after deselect')

await page3.waitForTimeout(500)
await page3.tap('#game', { position: villTap })
await page3.tap('#game', { position: villTap })
await page3.waitForTimeout(250)
const crew = await page3.evaluate(() => {
  const g = window.__game.state
  const sel = g.selection.map(id => g.byId.get(id))
  return { n: sel.length, allVills: sel.every(e => e && e.kind === 'villager') }
})
console.log('double-tap crew:', crew)
if (crew.n < 2 || !crew.allVills) throw new Error('double-tap did not select the nearby villagers')

// 10) lumber camp: place near the grove, complete it, verify it's the drop-off
const grove = await page3.evaluate(() => {
  const g = window.__game.state
  g.res[0].wood = 300
  // find a clear spot near a player-side tree, using the game's own clearance rule
  const trees = g.ents.filter(e => e.kind === 'tree' && e.x < 700 && e.y > 600)
  let t = null, spot = null
  outer: for (const tree of trees) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const s = { x: tree.x + Math.cos(a) * 75, y: tree.y + Math.sin(a) * 75 }
      if (s.x < 80 || s.y < 80) continue
      const clear = g.ents.every(e =>
        (e.kind === 'villager' || e.kind === 'swordsman') ||
        Math.hypot(s.x - e.x, s.y - e.y) > 26 + e.r + 14)
      if (clear) { t = tree; spot = s; break outer }
    }
  }
  if (!spot) throw new Error('no clear spot near the grove')
  g.camera.x = spot.x; g.camera.y = spot.y
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  window.__game.select(vills[0].id)
  g.uiDirty = true
  return { treeId: t.id, spot }
})
await page3.waitForTimeout(300)
await page3.tap('[data-cmd="build-lumbercamp"]')
await page3.waitForTimeout(200)
const placingState = await page3.evaluate(() => ({
  placing: window.__game.state.placing,
  sel: window.__game.state.selection.length,
  toasts: window.__game.state.toasts.map(t => t.text),
}))
console.log('placing state:', placingState)
await page3.tap('#game', { position: canvasBox })
await page3.waitForTimeout(250)
const campPlaced = await page3.evaluate(() => ({
  placed: window.__game.state.ents.some(e => e.kind === 'lumbercamp'),
  toasts: window.__game.state.toasts.map(t => t.text),
}))
console.log('camp placement:', campPlaced)
if (!campPlaced.placed) throw new Error('lumber camp was not placed')
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 40) // walk + build
const campDone = await page3.evaluate(() =>
  window.__game.state.ents.some(e => e.kind === 'lumbercamp' && e.complete))
if (!campDone) throw new Error('lumber camp never completed')

const dropoffCheck = await page3.evaluate(({ treeId }) => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  v.state = 'gather'; v.targetId = treeId; v.gatherT = 0
  return { woodBefore: g.res[0].wood }
}, grove)
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 24) // several camp round-trips; a TC round trip alone takes ~14s
const dropoffResult = await page3.evaluate(() => {
  const g = window.__game.state
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  const camp = g.ents.find(e => e.kind === 'lumbercamp')
  const tree = g.byId.get(v.targetId)
  return {
    wood: g.res[0].wood,
    vill: { state: v.state, carry: v.carry, x: Math.round(v.x), y: Math.round(v.y), target: v.targetId },
    camp: camp ? { x: Math.round(camp.x), y: Math.round(camp.y), complete: camp.complete } : null,
    tree: tree ? { kind: tree.kind, amount: tree.amount, x: Math.round(tree.x), y: Math.round(tree.y) } : null,
  }
})
console.log('lumber camp drop-off:', dropoffCheck, '->', dropoffResult)
if (dropoffResult.wood - dropoffCheck.woodBefore < 12)
  throw new Error('camp drop-off too slow — villager likely hauling to the Town Hall')
await page3.evaluate(() => window.__game.setSpeed(1))
await page3.waitForTimeout(300)
await page3.screenshot({ path: 'shots/8-lumber-camp.png' })

// 11) depletion: trees become stumps, mines shrink into rubble — both stay in the world
const depSetup = await page3.evaluate(({ treeId }) => {
  const g = window.__game.state
  const tree = g.byId.get(treeId)
  tree.amount = 2
  const mine = g.ents.reduce((best, e) => {
    if (e.kind !== 'goldmine') return best
    const d = Math.hypot(e.x - tree.x, e.y - tree.y)
    return !best || d < best.d ? { e, d } : best
  }, null).e
  mine.amount = 3
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  vills[0].state = 'gather'; vills[0].targetId = tree.id; vills[0].gatherT = 0
  vills[1].state = 'gather'; vills[1].targetId = mine.id; vills[1].gatherT = 0
  window.__game.setSpeed(15)
  return { treeId: tree.id, mineId: mine.id }
}, grove)
await waitSim(page3, 40)
const depleted = await page3.evaluate(({ treeId, mineId }) => {
  const g = window.__game.state
  const tree = g.byId.get(treeId)
  const mine = g.byId.get(mineId)
  const chopper = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  return {
    stump: tree ? { amount: tree.amount, r: tree.r } : null,
    rubble: mine ? { amount: mine.amount, r: mine.r } : null,
    chopperRetargeted: chopper.state === 'gather' && chopper.targetId !== treeId,
  }
}, depSetup)
console.log('depletion:', depleted)
if (!depleted.stump || depleted.stump.amount !== 0 || depleted.stump.r !== 8)
  throw new Error('tree did not become a stump')
if (!depleted.rubble || depleted.rubble.amount !== 0 || depleted.rubble.r !== 16)
  throw new Error('mine did not become rubble')
if (!depleted.chopperRetargeted) throw new Error('chopper did not retarget a living tree')
await page3.evaluate(({ treeId }) => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const tree = g.byId.get(treeId)
  g.camera.x = tree.x; g.camera.y = tree.y
}, depSetup)
await page3.waitForTimeout(300)
await page3.screenshot({ path: 'shots/9-stump.png' })

// 12) food & stone: forage a bush, quarry stone
const fsSetup = await page3.evaluate(() => {
  const g = window.__game.state
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  const bush = g.ents.find(e => e.kind === 'berrybush' && (e.amount ?? 0) > 0 && e.x < 960)
  const quarry = g.ents.find(e => e.kind === 'stonequarry' && e.x < 960)
  vills[0].state = 'gather'; vills[0].targetId = bush.id; vills[0].gatherT = 0
  vills[1].state = 'gather'; vills[1].targetId = quarry.id; vills[1].gatherT = 0
  window.__game.setSpeed(15)
  return { food: g.res[0].food, stone: g.res[0].stone }
})
await waitSim(page3, 45)
const fsResult = await page3.evaluate(() => ({
  food: window.__game.state.res[0].food, stone: window.__game.state.res[0].stone,
}))
console.log('food/stone gathering:', fsSetup, '->', fsResult)
if (fsResult.food - fsSetup.food < 8) throw new Error('foraging produced no food')
if (fsResult.stone - fsSetup.stone < 8) throw new Error('quarrying produced no stone')

// 13) farm: build via the menu, then a villager works the field for steady food
await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  window.__game.select(vills[2].id)
  g.res[0].wood = Math.max(g.res[0].wood, 200)
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  g.camera.x = tc.x - 120; g.camera.y = tc.y + 150
  g.uiDirty = true
})
await page3.waitForTimeout(250)
await page3.tap('[data-cmd="build-farm"]')
await page3.waitForTimeout(200)
await page3.tap('#game', { position: canvasBox })
await page3.waitForTimeout(250)
const farmPlaced = await page3.evaluate(() => window.__game.state.ents.some(e => e.kind === 'farm' && e.team === 0))
if (!farmPlaced) throw new Error('farm was not placed')
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 30)
const farmReady = await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const farm = g.ents.find(e => e.kind === 'farm' && e.team === 0 && e.complete)
  if (!farm) return null
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  window.__game.select(vills[2].id)
  g.camera.x = farm.x; g.camera.y = farm.y
  return { food: g.res[0].food }
})
if (!farmReady) throw new Error('farm never completed')
await page3.waitForTimeout(250)
await page3.tap('#game', { position: canvasBox }) // tap the farm -> work it
await page3.waitForTimeout(250)
const farmWorking = await page3.evaluate(() => {
  const g = window.__game.state
  const farm = g.ents.find(e => e.kind === 'farm' && e.team === 0 && e.complete)
  const v = g.ents.filter(e => e.team === 0 && e.kind === 'villager')[2]
  return { state: v.state, onFarm: v.targetId === farm.id }
})
console.log('farm working:', farmWorking)
if (farmWorking.state !== 'gather' || !farmWorking.onFarm) throw new Error('villager did not start working the farm')
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 30)
const farmFood = await page3.evaluate(() => window.__game.state.res[0].food)
console.log('farm food:', farmReady.food, '->', farmFood)
if (farmFood - farmReady.food < 6) throw new Error('farm produced no food')

// 14) expansion: a second Town Hall paid with stone
const tcSetup = await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  g.res[0].wood = 400; g.res[0].stone = 300
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  window.__game.select(vills[0].id)
  g.camera.x = 900; g.camera.y = 480
  g.uiDirty = true
  return { popText: document.getElementById('pop-n').textContent }
})
await page3.waitForTimeout(250)
await page3.tap('[data-cmd="build-towncenter"]')
await page3.waitForTimeout(200)
await page3.tap('#game', { position: canvasBox })
await page3.waitForTimeout(250)
const tcPlaced = await page3.evaluate(() =>
  window.__game.state.ents.filter(e => e.team === 0 && e.kind === 'towncenter').length)
if (tcPlaced !== 2) throw new Error('second town hall was not placed')
await page3.evaluate(() => window.__game.setSpeed(20))
await waitSim(page3, 75) // long walk + 45s build
const tcDone = await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  return {
    complete: g.ents.filter(e => e.team === 0 && e.kind === 'towncenter' && e.complete).length,
    popText: document.getElementById('pop-n').textContent,
  }
})
console.log('expansion:', tcSetup.popText, '->', tcDone)
if (tcDone.complete !== 2) throw new Error('second town hall never completed')
if (!tcDone.popText.endsWith('/17')) throw new Error('pop cap did not grow to 17: ' + tcDone.popText)
await page3.screenshot({ path: 'shots/10-expansion.png' })

// 15) fog of war: black until scouted, shadow after the scout leaves
const fogStart = await page3.evaluate(() => {
  const g = window.__game.state
  const eTC = g.ents.find(e => e.team === 1 && e.kind === 'towncenter')
  const idx = Math.floor(eTC.y / 32) * g.fog.w + Math.floor(eTC.x / 32)
  const scout = g.ents.find(e => e.team === 0 && e.kind === 'scout')
  if (scout) {
    // approach from the west, outside the guards' aggro
    scout.state = 'move'; scout.tx = eTC.x - 240; scout.ty = eTC.y - 40
    g.camera.x = eTC.x - 200; g.camera.y = eTC.y
  }
  window.__game.setSpeed(20)
  return { idx, explored: g.fog.explored[idx], hasScout: !!scout }
})
console.log('fog start:', fogStart)
if (!fogStart.hasScout) throw new Error('player scout missing')
if (fogStart.explored) throw new Error('enemy base should start unexplored')
await waitSim(page3, 30)
const fogSeen = await page3.evaluate(({ idx }) => {
  const g = window.__game.state
  return { explored: g.fog.explored[idx], visible: g.fog.visible[idx] }
}, fogStart)
console.log('fog after scouting:', fogSeen)
if (!fogSeen.explored || !fogSeen.visible) throw new Error('scout did not reveal the enemy base')
await page3.evaluate(() => window.__game.setSpeed(1))
await page3.waitForTimeout(300)
await page3.screenshot({ path: 'shots/11-scouted.png' })

await page3.evaluate(() => {
  const g = window.__game.state
  const scout = g.ents.find(e => e.team === 0 && e.kind === 'scout')
  scout.state = 'move'; scout.tx = 380; scout.ty = 950
  window.__game.setSpeed(20)
})
await waitSim(page3, 30)
const fogShadow = await page3.evaluate(({ idx }) => {
  const g = window.__game.state
  const eUnit = g.ents.find(e => e.team === 1 && e.kind === 'villager' && !e.hidden)
  // shadowed enemy units must not be tappable — probe the hit-test via a tap
  // by checking the selection stays empty after tapping their position
  return {
    explored: g.fog.explored[idx],
    visible: g.fog.visible[idx],
    scoutAlive: g.ents.some(e => e.team === 0 && e.kind === 'scout'),
  }
}, fogStart)
console.log('fog shadow:', fogShadow)
if (!fogShadow.explored || fogShadow.visible) throw new Error('enemy base should drop to shadow')
if (!fogShadow.scoutAlive) throw new Error('scout died on a safe route')

// 16) watchtower: fires on its own, shelters units, releases them
await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  g.res[0].wood = 300
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  for (const v of vills) { v.state = 'idle'; v.targetId = undefined } // all hands available
  window.__game.select(vills[0].id)
  g.camera.x = 500; g.camera.y = 1000
  g.uiDirty = true
})
await page3.waitForTimeout(250)
await page3.tap('[data-cmd="build-watchtower"]')
await page3.waitForTimeout(200)
await page3.tap('#game', { position: canvasBox })
await page3.waitForTimeout(250)
const towerPlaced = await page3.evaluate(() =>
  window.__game.state.ents.some(e => e.team === 0 && e.kind === 'watchtower'))
if (!towerPlaced) throw new Error('watchtower was not placed')
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 35)
const towerReady = await page3.evaluate(() => {
  const g = window.__game.state
  const tower = g.ents.find(e => e.team === 0 && e.kind === 'watchtower' && e.complete)
  if (!tower) return null
  // an empty tower must still defend itself: one attacker, locked onto it
  // (attack directly so wandering villagers can't lure it out of the test)
  const id = window.__game.spawn('swordsman', 1, tower.x + 120, tower.y)
  const u = g.byId.get(id)
  u.state = 'attack'; u.targetId = tower.id
  return { arrowsBefore: g.arrowsFired, towerHp: tower.hp }
})
if (!towerReady) throw new Error('watchtower never completed')
await waitSim(page3, 60) // 1 arrow / 1.6s vs 70hp needs ~23s once in range; generous margin
const towerFight = await page3.evaluate(() => {
  const g = window.__game.state
  const tower = g.ents.find(e => e.team === 0 && e.kind === 'watchtower')
  return {
    arrows: g.arrowsFired,
    attackerAlive: g.ents.some(e => e.team === 1 && e.kind === 'swordsman'),
    towerAlive: !!tower,
    towerHp: tower ? Math.round(tower.hp) : 0,
  }
})
console.log('tower defense:', towerReady.arrowsBefore, '->', towerFight)
if (towerFight.arrows <= towerReady.arrowsBefore) throw new Error('empty tower never fired')
if (towerFight.attackerAlive) throw new Error('tower did not defeat a lone attacker')
if (!towerFight.towerAlive) throw new Error('tower died to a lone attacker')

// garrison two villagers by tapping the tower, then open the doors
await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  g.selection = [vills[0].id, vills[1].id]
  const tower = g.ents.find(e => e.team === 0 && e.kind === 'watchtower')
  g.camera.x = tower.x; g.camera.y = tower.y
  g.uiDirty = true
})
await page3.waitForTimeout(250)
await page3.tap('#game', { position: canvasBox })
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 15)
const towerGarrison = await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const tower = g.ents.find(e => e.team === 0 && e.kind === 'watchtower')
  window.__game.select(tower.id)
  return {
    garrison: tower.garrison ?? 0,
    inside: g.ents.filter(e => e.hidden && e.insideId === tower.id).length,
  }
})
console.log('tower garrison:', towerGarrison)
if (towerGarrison.garrison !== 2 || towerGarrison.inside !== 2)
  throw new Error('villagers did not garrison the tower')
await page3.waitForTimeout(250)
await page3.screenshot({ path: 'shots/13-watchtower.png' })
await page3.tap('[data-cmd="doors"]')
await page3.waitForTimeout(300)
const towerReleased = await page3.evaluate(() => {
  const g = window.__game.state
  const tower = g.ents.find(e => e.team === 0 && e.kind === 'watchtower')
  return { garrison: tower.garrison ?? 0, hidden: g.ents.filter(e => e.hidden).length }
})
console.log('tower released:', towerReleased)
if (towerReleased.garrison !== 0 || towerReleased.hidden !== 0)
  throw new Error('tower did not release its garrison')

// landscape sanity shot
const page2 = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true })
await page2.goto('file://' + resolve('dist/index.html'))
await page2.tap('#play-btn')
await page2.waitForTimeout(400)
await page2.screenshot({ path: 'shots/6-landscape.png' })

await browser.close()
console.log('PLAYTEST PASSED')
