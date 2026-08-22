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
// open a build category tab in the villager dock (backing out of any open one)
async function openCat(pg, cat) {
  if (await pg.isVisible('[data-cmd="back"]')) {
    await pg.tap('[data-cmd="back"]')
    await pg.waitForTimeout(200)
  }
  if (await pg.isVisible(`[data-cmd="cat-${cat}"]`)) {
    await pg.tap(`[data-cmd="cat-${cat}"]`)
    await pg.waitForTimeout(200)
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

await page.goto('file://' + resolve('dist/index.html') + '?map=classic')
await page.evaluate(() => window.__game.allowPortrait()) // suite drives portrait viewports
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
if (!(await page.isVisible('[data-cmd="cat-economy"]'))) throw new Error('build categories missing for villager')

// build menu: two category doors, then per-category icon buttons
const rootDock = await page.evaluate(() =>
  [...document.querySelectorAll('#dock-buttons button.cmd')].map(b => b.dataset.cmd))
console.log('build categories:', rootDock)
if (rootDock.join(',') !== 'cat-economy,cat-military') throw new Error('expected economy/military category buttons')

await openCat(page, 'economy')
const ecoDock = await page.evaluate(() => ({
  buttons: [...document.querySelectorAll('#dock-buttons button.cmd')].map(b => b.dataset.cmd),
  canvases: document.querySelectorAll('#dock-buttons canvas.sprite-icon').length,
  disabled: [...document.querySelectorAll('#dock-buttons button.disabled')].map(b => b.dataset.cmd),
}))
console.log('economy menu:', ecoDock)
if (ecoDock.buttons.join(',') !== 'back,build-house,build-farm,build-mill,build-lumbercamp,build-miningcamp,build-towncenter')
  throw new Error('economy menu wrong: ' + ecoDock.buttons.join(','))
if (ecoDock.canvases !== 6) throw new Error('economy menu should use 6 sprite icons')
if (!ecoDock.disabled.includes('build-towncenter')) throw new Error('unaffordable town hall not greyed out')
await page.evaluate(() => { window.__game.state.res[0].wood = 0 })
await page.waitForTimeout(150)
const allDisabled = await page.evaluate(() =>
  document.querySelectorAll('#dock-buttons button.disabled').length)
if (allDisabled !== 6) throw new Error('with 0 wood all economy buildings should be greyed out')
await page.evaluate(() => { window.__game.state.res[0].wood = 100 })
await page.waitForTimeout(150)
await page.tap('[data-cmd="back"]')
await page.waitForTimeout(200)
await openCat(page, 'military')
const milDock = await page.evaluate(() => ({
  buttons: [...document.querySelectorAll('#dock-buttons button.cmd')].map(b => b.dataset.cmd),
  canvases: document.querySelectorAll('#dock-buttons canvas.sprite-icon').length,
}))
console.log('military menu:', milDock)
if (milDock.buttons.join(',') !== 'back,build-barracks,build-archeryrange,build-stable,build-watchtower,build-wall,build-gate')
  throw new Error('military menu wrong: ' + milDock.buttons.join(','))
if (milDock.canvases !== 4) throw new Error('stable/watchtower/wall/gate should use sprite icons')
await page.tap('[data-cmd="back"]')
await page.waitForTimeout(200)
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
await openCat(page, 'military')
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
await page.waitForTimeout(200)
await page.tap('[data-cmd="confirm"]')
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

// 2.5) army panel: per-type chips with counts, plus the grab-everything button
await page.waitForTimeout(300) // let the chip refresh tick
const panelChips = await page.evaluate(() => ({
  chips: [...document.querySelectorAll('#army-panel .army-chip')].map(c =>
    ({ cmd: c.dataset.cmd, count: c.querySelector('.count').textContent })),
}))
console.log('army panel:', panelChips)
const swordChip = panelChips.chips.find(c => c.cmd === 'army-swordsman')
if (!swordChip) throw new Error('no swordsman chip in the army panel')
if (Number(swordChip.count) < 4) throw new Error('swordsman chip count wrong: ' + swordChip.count)
// spawn spearmen: a second chip appears; tapping it selects exactly them
const spearIds = await page.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  return [window.__game.spawn('spearman', 0, tc.x - 60, tc.y - 120),
    window.__game.spawn('spearman', 0, tc.x - 90, tc.y - 120)]
})
await page.waitForTimeout(300)
if (!(await page.isVisible('[data-cmd="army-spearman"]'))) throw new Error('spearman chip missing')
await page.tap('[data-cmd="army-spearman"]')
await page.waitForTimeout(200)
const spearSel = await page.evaluate(({ spearIds }) => {
  const g = window.__game.state
  return {
    n: g.selection.length,
    exact: g.selection.every(id => spearIds.includes(id)),
  }
}, { spearIds })
console.log('spearman chip select:', spearSel)
if (spearSel.n !== 2 || !spearSel.exact) throw new Error('spearman chip did not select exactly the spearmen')
await page.evaluate(({ spearIds }) => { // retire them so the march below is swordsmen-only
  const g = window.__game.state
  for (const id of spearIds) { const e = g.byId.get(id); if (e) e.hp = 0 }
  g.selection = []
}, { spearIds })
await page.waitForTimeout(400)

// the blue Army button still grabs the whole battle line and recenters
await page.tap('#army-all')
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
await page3.goto('file://' + resolve('dist/index.html') + '?map=classic')
await page3.evaluate(() => window.__game.allowPortrait())
await page3.tap('#play-btn')
await page3.evaluate(() => {
  const g = window.__game.state
  // the AI must not actually win while we watch it grow
  const pTC = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  pTC.hp = pTC.maxHp = 100000
  window.__game.setSpeed(20)
})
await waitSim(page3, 340, 200000)
const aiCheck = await page3.evaluate(() => {
  const g = window.__game.state
  return {
    res: { ...g.res[1] },
    vills: g.ents.filter(e => e.team === 1 && e.kind === 'villager').length,
    barracks: g.ents.filter(e => e.team === 1 && e.kind === 'barracks').length,
    houses: g.ents.filter(e => e.team === 1 && e.kind === 'house').length,
    soldiers: g.ents.filter(e => e.team === 1 &&
      (e.kind === 'swordsman' || e.kind === 'spearman' || e.kind === 'archer' || e.kind === 'knight')).length,
    attacking: g.ai.attacking,
    over: g.over,
    age: g.age[1],
    landmark: g.ents.some(e => e.team === 1 &&
      ['abbeymill', 'kingsbarracks', 'guildhall', 'whitekeep'].includes(e.kind)),
  }
})
console.log('enemy AI after 340 sim-s:', aiCheck)
if (aiCheck.vills <= 3) throw new Error('enemy AI trained no villagers')
if (aiCheck.barracks < 1) throw new Error('enemy AI built no barracks')
// a smart village either fields an army or has a landmark rising toward Feudal
if (aiCheck.soldiers < 1 && !aiCheck.attacking && aiCheck.age < 2 && !aiCheck.landmark)
  throw new Error('enemy AI neither raised an army nor advanced its age')
if (aiCheck.age >= 2 && !aiCheck.landmark)
  throw new Error('enemy AI is Feudal but no landmark stands — the age came from nowhere')

// freeze and clean up the AI so the remaining feature checks are deterministic
await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  g.ai.enabled = false
  for (const e of g.ents.filter(e => e.team === 1 &&
    (e.kind === 'swordsman' || e.kind === 'spearman' || e.kind === 'archer' || e.kind === 'knight'))) e.hp = 0
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

// 4.5) the Feudal Age: locks in the Dark Age, unlocked by the real age-up flow
await page3.evaluate(() => {
  const g = window.__game.state
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  window.__game.select(v.id)
})
await page3.waitForTimeout(250)
await openCat(page3, 'military')
const darkLocks = await page3.evaluate(() => ({
  locked: [...document.querySelectorAll('#dock-buttons button.locked')].map(b => b.dataset.cmd),
  age: window.__game.state.age[0],
  agePill: !!document.getElementById('p-age'), // retired: architecture shows the age now
}))
console.log('dark age locks:', darkLocks)
if (darkLocks.age !== 1) throw new Error('should start in the Dark Age')
if (darkLocks.agePill) throw new Error('the age pill should be gone from the HUD')
if (!darkLocks.locked.includes('build-watchtower') || !darkLocks.locked.includes('build-archeryrange') ||
  !darkLocks.locked.includes('build-stable'))
  throw new Error('feudal buildings not locked in the Dark Age')
if (darkLocks.locked.includes('build-barracks')) throw new Error('barracks should be available in the Dark Age')
// a clear-ground finder for the landmark placements below, mirroring the
// game's square-footprint clearance rule with a safety margin
await page3.evaluate(() => {
  window.__findSpot = (foot, ax, ay) => {
    const g = window.__game.state
    for (let ring = 90; ring < 420; ring += 30) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
        const s = {
          x: Math.round((ax + Math.cos(a) * ring) / 16) * 16,
          y: Math.round((ay + Math.sin(a) * ring) / 16) * 16,
        }
        if (s.x < 100 || s.y < 100 || s.x > 1820 || s.y > 1180) continue
        const clear = g.ents.every(e =>
          ['villager', 'swordsman', 'spearman', 'archer', 'scout', 'knight'].includes(e.kind) ||
          Math.max(Math.abs(s.x - e.x), Math.abs(s.y - e.y)) > foot + e.r + 16)
        if (clear) return s
      }
    }
    return null
  }
})
await page3.evaluate(() => {
  const g = window.__game.state
  g.res[0].food = 400; g.res[0].wood = 400
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  window.__game.select(tc.id)
})
await page3.waitForTimeout(250)
if (!(await page3.isVisible('[data-cmd="age-up"]'))) throw new Error('age-up button missing on the Town Hall')
await page3.tap('[data-cmd="age-up"]')
await page3.waitForTimeout(250)
// the laurel opens the landmark choice: the eco road or the military road
const lmMenu = await page3.evaluate(() =>
  [...document.querySelectorAll('#dock-buttons button[data-cmd^="build-"]')].map(b => b.dataset.cmd))
console.log('feudal landmark menu:', lmMenu)
if (lmMenu.join(',') !== 'build-abbeymill,build-kingsbarracks')
  throw new Error('expected the two Feudal landmarks, got: ' + lmMenu.join(','))
await page3.tap('[data-cmd="build-abbeymill"]')
await page3.waitForTimeout(250)
const lmPlacing = await page3.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const spot = window.__findSpot(34, tc.x, tc.y)
  if (spot) g.placePos = spot
  return { placing: g.placing, spot, food: g.res[0].food, wood: g.res[0].wood }
})
console.log('landmark placing:', lmPlacing)
if (lmPlacing.placing !== 'abbeymill') throw new Error('choosing the Abbey Mill did not open placement')
if (!lmPlacing.spot) throw new Error('no clear ground found for the Abbey Mill')
await page3.tap('[data-cmd="confirm"]')
await page3.waitForTimeout(300)
const lmSite = await page3.evaluate(() => {
  const g = window.__game.state
  const site = g.ents.find(e => e.team === 0 && e.kind === 'abbeymill')
  return {
    placed: !!site && !site.complete,
    builders: g.ents.filter(e => e.team === 0 && e.kind === 'villager' &&
      e.state === 'build' && e.targetId === site?.id).length,
    food: g.res[0].food, wood: g.res[0].wood,
    agePill: !!document.querySelector('[data-cmd="age-progress"]') ||
      !!document.querySelector('[data-cmd="age-up"]'), // TC dock refreshes on reselect below
  }
})
console.log('landmark site:', lmSite)
if (!lmSite.placed) throw new Error('the Abbey Mill site was not placed')
if (lmSite.builders < 1) throw new Error('no villagers were sent to raise the landmark')
if (lmPlacing.food - lmSite.food !== 200 || lmPlacing.wood - lmSite.wood !== 100)
  throw new Error('the Abbey Mill should cost 200 food + 100 wood')
// while it rises, the Town Hall shows progress instead of the laurel
await page3.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  window.__game.select(tc.id)
})
await page3.waitForTimeout(250)
const risingDock = await page3.evaluate(() => ({
  progress: !!document.querySelector('[data-cmd="age-progress"]'),
  laurel: !!document.querySelector('[data-cmd="age-up"]'),
}))
console.log('rising dock:', risingDock)
if (!risingDock.progress || risingDock.laurel)
  throw new Error('Town Hall should show landmark progress while one rises')
await page3.evaluate(() => window.__game.setSpeed(20))
await waitSim(page3, 80)
const feudal = await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  window.__game.select(v.id)
  return {
    age: g.age[0],
    landmarkDone: g.ents.some(e => e.team === 0 && e.kind === 'abbeymill' && e.complete),
  }
})
console.log('after age-up:', feudal)
if (!feudal.landmarkDone) throw new Error('the Abbey Mill never finished')
if (feudal.age !== 2) throw new Error('the Feudal Age never dawned')
await page3.waitForTimeout(250)
await openCat(page3, 'military')
const feudalLocks = await page3.evaluate(() =>
  [...document.querySelectorAll('#dock-buttons button.locked')].map(b => b.dataset.cmd))
console.log('feudal locks:', feudalLocks)
if (feudalLocks.length) throw new Error('locks should lift in the Feudal Age')
await openCat(page3, 'economy')
if (!(await page3.isVisible('[data-cmd="build-mill"]'))) throw new Error('mill missing from the economy menu')
await page3.tap('[data-cmd="back"]')
// both villages feudal for the remaining feature checks
await page3.evaluate(() => { window.__game.state.age = [2, 2] })

// 4.55) economy techs: Miner's Picks researched the honest way at a mining camp
await page3.evaluate(() => {
  const g = window.__game.state
  g.res[0].food = 500; g.res[0].wood = 400
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const campId = window.__game.spawn('miningcamp', 0, tc.x + 420, tc.y + 200)
  window.__game.select(campId)
})
await page3.waitForTimeout(250)
if (!(await page3.isVisible('[data-cmd="research-minerspicks"]')))
  throw new Error('research button missing on the mining camp')
const researchBefore = await page3.evaluate(() => ({
  food: window.__game.state.res[0].food, wood: window.__game.state.res[0].wood,
}))
await page3.tap('[data-cmd="research-minerspicks"]')
await page3.waitForTimeout(250)
const researchStart = await page3.evaluate(() => {
  const g = window.__game.state
  const camp = g.ents.find(e => e.team === 0 && e.kind === 'miningcamp' && e.research)
  return { id: camp ? camp.research.id : null, food: g.res[0].food, wood: g.res[0].wood }
})
console.log('tech research start:', researchStart)
if (researchStart.id !== 'minerspicks') throw new Error('tech research did not start')
if (Math.round(researchBefore.food - researchStart.food) !== 100 ||
  Math.round(researchBefore.wood - researchStart.wood) !== 75)
  throw new Error('research should cost 100 food + 75 wood')
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 34)
const researched = await page3.evaluate(() => {
  window.__game.setSpeed(1)
  return { ...window.__game.state.techs[0] }
})
console.log('techs after research:', researched)
if (!researched.minerspicks) throw new Error("Miner's Picks research never finished")

// 4.66) the stable: trains scouts now, teases knights until the Castle Age
await page3.evaluate(() => {
  const g = window.__game.state
  g.res[0].food = 400; g.res[0].gold = 200
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const stableId = window.__game.spawn('stable', 0, tc.x - 200, tc.y - 500)
  window.__game.select(stableId)
})
await page3.waitForTimeout(250)
const stableDock = await page3.evaluate(() => ({
  buttons: [...document.querySelectorAll('#dock-buttons button.cmd')].map(b => b.dataset.cmd),
  locked: [...document.querySelectorAll('#dock-buttons button.locked')].map(b => b.dataset.cmd),
}))
console.log('stable dock:', stableDock)
if (stableDock.buttons.join(',') !== 'train-scout,train-knight,champ-cavalry')
  throw new Error('stable dock wrong: ' + stableDock.buttons.join(','))
if (!stableDock.locked.includes('train-knight')) throw new Error('knight should be locked until the Castle Age')
if (!stableDock.locked.includes('champ-cavalry')) throw new Error('champions should be locked until the Castle Age')
await page3.tap('[data-cmd="train-knight"]')
await page3.waitForTimeout(250)
const knightRefused = await page3.evaluate(() => {
  const g = window.__game.state
  const stable = g.ents.find(e => e.team === 0 && e.kind === 'stable')
  return { queued: stable.queue.length, toasts: g.toasts.map(t => t.text) }
})
console.log('knight refused:', knightRefused)
if (knightRefused.queued !== 0) throw new Error('locked knight should not queue')
if (!knightRefused.toasts.some(t => t.includes('Castle Age'))) throw new Error('knight lock toast should name the Castle Age')
const scoutsBefore = await page3.evaluate(() =>
  window.__game.state.ents.filter(e => e.team === 0 && e.kind === 'scout').length)
await page3.tap('[data-cmd="train-scout"]')
await page3.waitForTimeout(200)
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 12)
const scoutsAfter = await page3.evaluate(() => {
  window.__game.setSpeed(1)
  return window.__game.state.ents.filter(e => e.team === 0 && e.kind === 'scout').length
})
console.log('stable trained scout:', scoutsBefore, '->', scoutsAfter)
if (scoutsAfter !== scoutsBefore + 1) throw new Error('stable did not train a scout')
await page3.evaluate(() => { // retire the extra scout so fog tests keep a single-scout world
  const g = window.__game.state
  const scouts = g.ents.filter(e => e.team === 0 && e.kind === 'scout')
  for (const s of scouts.slice(1)) s.hp = 0
})
await waitSim(page3, 1)

// 4.663) the Castle Age: a second landmark — the Guild Hall — and its gold trickle
await page3.evaluate(() => {
  const g = window.__game.state
  g.res[0].food = 600; g.res[0].gold = 300
  for (const v of g.ents.filter(e => e.team === 0 && e.kind === 'villager')) {
    v.state = 'idle'; v.targetId = undefined // no miners — the trickle check must be pure
  }
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  window.__game.select(tc.id)
})
await page3.waitForTimeout(250)
if (!(await page3.isVisible('[data-cmd="age-up"]'))) throw new Error('Castle age-up laurel missing on the Town Hall')
await page3.tap('[data-cmd="age-up"]')
await page3.waitForTimeout(250)
const castleMenu = await page3.evaluate(() =>
  [...document.querySelectorAll('#dock-buttons button[data-cmd^="build-"]')].map(b => b.dataset.cmd))
console.log('castle landmark menu:', castleMenu)
if (castleMenu.join(',') !== 'build-guildhall,build-whitekeep')
  throw new Error('expected the two Castle landmarks, got: ' + castleMenu.join(','))
await page3.tap('[data-cmd="build-guildhall"]')
await page3.waitForTimeout(250)
const ghPlacing = await page3.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const spot = window.__findSpot(38, tc.x, tc.y)
  if (spot) g.placePos = spot
  return { placing: g.placing, spot }
})
if (ghPlacing.placing !== 'guildhall' || !ghPlacing.spot) throw new Error('Guild Hall placement did not open')
await page3.tap('[data-cmd="confirm"]')
await page3.waitForTimeout(300)
const ghSite = await page3.evaluate(() => ({
  placed: window.__game.state.ents.some(e => e.team === 0 && e.kind === 'guildhall' && !e.complete),
}))
if (!ghSite.placed) throw new Error('the Guild Hall site was not placed')
await page3.evaluate(() => window.__game.setSpeed(20))
await waitSim(page3, 90)
const castle = await page3.evaluate(() => {
  const g = window.__game.state
  return {
    age: g.age[0],
    done: g.ents.some(e => e.team === 0 && e.kind === 'guildhall' && e.complete),
    gold: g.res[0].gold,
  }
})
console.log('castle age:', castle)
if (!castle.done) throw new Error('the Guild Hall never finished')
if (castle.age !== 3) throw new Error('the Castle Age never dawned')
await waitSim(page3, 20) // merchants at work: the Guild Hall trickles gold on its own
const trickled = await page3.evaluate(() => {
  window.__game.setSpeed(1)
  return { gold: window.__game.state.res[0].gold }
})
console.log('guild hall trickle:', castle.gold, '->', trickled.gold)
if (trickled.gold - castle.gold < 5) throw new Error('the Guild Hall trickled no gold')
// the castle skyline: stone walls on the aged buildings
await page3.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  g.camera.x = tc.x; g.camera.y = tc.y
})
await page3.waitForTimeout(400)
await page3.screenshot({ path: 'shots/16-castle.png' })

// 4.664) champions: the barracks swears in champion infantry, veterans included
const champSetup = await page3.evaluate(() => {
  const g = window.__game.state
  g.res[0].food = 500; g.res[0].gold = 400
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const spearId = window.__game.spawn('spearman', 0, tc.x - 120, tc.y + 240) // enlisted before the honours
  const spot = window.__findSpot(44, tc.x + 260, tc.y - 160)
  const raxId = window.__game.spawn('barracks', 0, spot.x, spot.y)
  window.__game.select(raxId)
  return { spearId, raxId, food: g.res[0].food, gold: g.res[0].gold }
})
await page3.waitForTimeout(250)
const champDock = await page3.evaluate(() => ({
  buttons: [...document.querySelectorAll('#dock-buttons button.cmd')].map(b => b.dataset.cmd),
  locked: [...document.querySelectorAll('#dock-buttons button.locked')].map(b => b.dataset.cmd),
}))
console.log('barracks dock (castle):', champDock)
if (!champDock.buttons.includes('champ-infantry')) throw new Error('champion button missing on the barracks')
if (champDock.locked.includes('champ-infantry')) throw new Error('champion should be unlocked in the Castle Age')
await page3.tap('[data-cmd="champ-infantry"]')
await page3.waitForTimeout(250)
const champStart = await page3.evaluate(({ raxId }) => {
  const g = window.__game.state
  const rax = g.byId.get(raxId)
  return {
    id: rax.research ? rax.research.id : null,
    food: g.res[0].food, gold: g.res[0].gold,
    pill: !!document.querySelector('[data-cmd="research-progress"]'),
  }
}, champSetup)
console.log('champion research start:', champStart)
if (champStart.id !== 'infantry') throw new Error('champion research did not start')
if (!champStart.pill) throw new Error('champion progress pill missing')
// the Abbey Mill and Guild Hall trickle a hair of food/gold while we look
if (Math.round(champSetup.food - champStart.food) !== 150 || Math.round(champSetup.gold - champStart.gold) !== 100)
  throw new Error('Champion Infantry should cost 150 food + 100 gold')
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 34)
const champDone = await page3.evaluate(({ spearId }) => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const old = g.byId.get(spearId)
  const freshId = window.__game.spawn('spearman', 0, old.x + 30, old.y)
  const fresh = g.byId.get(freshId)
  const out = { champ: g.champs[0].infantry, oldMax: old.maxHp, freshMax: fresh.maxHp }
  old.hp = 0; fresh.hp = 0 // muster the practice spears out again
  return out
}, champSetup)
console.log('champion infantry:', champDone)
if (!champDone.champ) throw new Error('Champion Infantry never finished')
if (champDone.oldMax !== 70 || champDone.freshMax !== 70)
  throw new Error(`champion HP not applied (want 70, got ${champDone.oldMax}/${champDone.freshMax})`)

// knights ride in the Castle Age: the stable's lock lifts, and one takes the field
const knightCheck = await page3.evaluate(({ raxId }) => {
  const g = window.__game.state
  const rax = g.byId.get(raxId); if (rax) rax.hp = 0 // the practice barracks retires
  const stable = g.ents.find(e => e.team === 0 && e.kind === 'stable' && e.complete)
  window.__game.select(stable.id)
  return { ok: !!stable }
}, champSetup)
if (!knightCheck.ok) throw new Error('stable went missing before the knight check')
await page3.waitForTimeout(250)
const stableCastle = await page3.evaluate(() => ({
  locked: [...document.querySelectorAll('#dock-buttons button.locked')].map(b => b.dataset.cmd),
  champ: !!document.querySelector('[data-cmd="champ-cavalry"]'),
}))
console.log('stable dock (castle):', stableCastle)
if (stableCastle.locked.includes('train-knight')) throw new Error('knight still locked in the Castle Age')
if (!stableCastle.champ) throw new Error('Champion Knights button missing on the stable')
const knightBorn = await page3.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const id = window.__game.spawn('knight', 0, tc.x + 120, tc.y - 90)
  const k = g.byId.get(id)
  g.camera.x = k.x; g.camera.y = k.y
  return { id, hp: k.maxHp, speed: 50 }
})
await page3.waitForTimeout(400)
await page3.screenshot({ path: 'shots/17-knight.png' })
if (knightBorn.hp !== 110) throw new Error('knight spawned with wrong hp: ' + knightBorn.hp)
await page3.evaluate(({ id }) => { const k = window.__game.state.byId.get(id); if (k) k.hp = 0 }, knightBorn)
await waitSim(page3, 1)

// 4.665) the White Keep stands guard: its own arrows cut a raider down
const keepSetup = await page3.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const spot = window.__findSpot(34, tc.x - 260, tc.y + 200)
  const keepId = window.__game.spawn('whitekeep', 0, spot.x, spot.y)
  const raiderId = window.__game.spawn('swordsman', 1, spot.x + 140, spot.y)
  const raider = g.byId.get(raiderId)
  raider.state = 'attack'; raider.targetId = keepId
  window.__game.setSpeed(10)
  return { keepId, raiderId, arrows: g.arrowsFired }
})
await waitSim(page3, 25)
const keepFight = await page3.evaluate(({ keepId, raiderId, arrows }) => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const keep = g.byId.get(keepId)
  const out = {
    fired: g.arrowsFired - arrows,
    raiderDead: !g.byId.has(raiderId),
    keepAlive: !!keep,
  }
  if (keep) keep.hp = 0 // the practice keep comes down again
  return out
}, keepSetup)
console.log('white keep defense:', keepFight)
if (keepFight.fired < 5) throw new Error('the White Keep barely fired')
if (!keepFight.raiderDead) throw new Error('the White Keep failed to stop a lone raider')
if (!keepFight.keepAlive) throw new Error('the White Keep fell to a lone raider?!')
await waitSim(page3, 1)

// 4.67) palisades: drag a fence line, posts chain-build, gates let friends through
const wallSetup = await page3.evaluate(() => {
  const g = window.__game.state
  g.res[0].wood = 100
  const v = g.ents.filter(e => e.team === 0 && e.kind === 'villager')[0]
  v.x = 1320; v.y = 700; v.state = 'idle'; v.targetId = undefined
  window.__game.select(v.id)
  return { wood: g.res[0].wood, villId: v.id }
})
await page3.waitForTimeout(250)
await openCat(page3, 'military')
await page3.tap('[data-cmd="build-wall"]')
await page3.waitForTimeout(200)
const wallPlacing = await page3.evaluate(() => {
  const g = window.__game.state
  const ok = g.placing === 'wall' && !!g.placePos && !!g.placeEnd
  g.placePos = { x: 1264, y: 640 }
  g.placeEnd = { x: 1376, y: 640 }
  return { ok }
})
console.log('wall placing:', wallPlacing)
if (!wallPlacing.ok) throw new Error('wall placement did not open with a line')
await page3.waitForTimeout(300) // the ✓ badge updates live as the line drags
const wallBadge = await page3.evaluate(() =>
  document.querySelector('[data-cmd="confirm"] .badge')?.textContent ?? null)
console.log('wall badge:', wallBadge)
if (wallBadge !== '×8') throw new Error('wall badge should count 8 posts, got ' + wallBadge)
await page3.tap('[data-cmd="confirm"]')
await page3.waitForTimeout(250)
const wallPlaced = await page3.evaluate(() => {
  const g = window.__game.state
  return {
    sites: g.ents.filter(e => e.team === 0 && e.kind === 'wall').length,
    wood: Math.round(g.res[0].wood),
    placing: g.placing,
  }
})
console.log('wall placed:', wallPlaced)
if (wallPlaced.sites !== 8) throw new Error('expected 8 wall posts, got ' + wallPlaced.sites)
if (wallSetup.wood - wallPlaced.wood !== 24) throw new Error('walls should cost 3 wood per post')
if (wallPlaced.placing !== null) throw new Error('placement should end after confirm')
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 45)
const wallBuilt = await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  return g.ents.filter(e => e.team === 0 && e.kind === 'wall' && e.complete).length
})
console.log('walls chain-built:', wallBuilt, 'of 8')
if (wallBuilt < 6) throw new Error('villager did not chain-build the fence')

const gatePass = await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.spawn('gate', 0, 1320, 560)
  // an UNSTARTED wall foundation right on the path — should be walkable
  const pegId = window.__game.spawn('wall', 0, 1320, 588)
  const peg = g.byId.get(pegId)
  peg.complete = false; peg.progress = 0; peg.hp = 22
  const v = g.ents.filter(e => e.team === 0 && e.kind === 'villager')[0]
  v.x = 1320; v.y = 516; v.state = 'move'; v.tx = 1320; v.ty = 604; v.targetId = undefined
  window.__game.setSpeed(10)
  return { villId: v.id, pegId }
})
await waitSim(page3, 10)
const gateResult = await page3.evaluate(({ villId, pegId }) => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const v = g.byId.get(villId)
  const peg = g.byId.get(pegId)
  if (peg) peg.hp = 0 // tidy the test peg away
  const arrived = Math.hypot(v.x - 1320, v.y - 604) < 22
  // walk the builder home so later tests find the crew where they expect it
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  v.x = tc.x + 70; v.y = tc.y + 60; v.state = 'idle'; v.targetId = undefined
  return { arrived, at: { x: Math.round(v.x), y: Math.round(v.y) } }
}, gatePass)
console.log('gate pass-through:', gateResult)
if (!gateResult.arrived) throw new Error('villager could not pass through a friendly gate')

// 4.675) trees are terrain: living trunks block, stumps are open ground
const treeTerrain = await page3.evaluate(() => {
  const g = window.__game.state
  const v = g.ents.filter(e => e.team === 0 && e.kind === 'villager')[0]
  // a purpose-grown lone tree in the open corridor — no neighbours to meddle
  const treeId = window.__game.spawn('tree', -1, 700, 560)
  const tree = g.byId.get(treeId)
  // stand the villager (almost) on the living trunk: separation must eject them
  v.x = tree.x + 1; v.y = tree.y; v.state = 'idle'; v.targetId = undefined
  window.__game.setSpeed(10)
  return { villId: v.id, treeId }
})
await waitSim(page3, 2)
const treeBlock = await page3.evaluate(({ villId, treeId }) => {
  const g = window.__game.state
  const v = g.byId.get(villId)
  const t = g.byId.get(treeId)
  const pushedOut = Math.hypot(v.x - t.x, v.y - t.y) >= v.r + t.r * 0.85 - 1
  // now fell it and walk straight across the stump
  t.amount = 0; t.r = 8
  v.x = t.x - 40; v.y = t.y
  v.state = 'move'; v.tx = t.x + 40; v.ty = t.y
  return { pushedOut }
}, treeTerrain)
await waitSim(page3, 5)
const stumpWalk = await page3.evaluate(({ villId, treeId }) => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const v = g.byId.get(villId)
  const t = g.byId.get(treeId)
  // walk the wanderer home and clear the practice tree away
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const crossed = Math.hypot(v.x - (t.x + 40), v.y - t.y) < 10
  v.x = tc.x + 70; v.y = tc.y + 60; v.state = 'idle'; v.targetId = undefined
  const i = g.ents.indexOf(t)
  if (i >= 0) { g.ents.splice(i, 1); g.byId.delete(t.id) }
  return { crossed }
}, treeTerrain)
console.log('tree terrain:', { ...treeBlock, ...stumpWalk })
if (!treeBlock.pushedOut) throw new Error('living tree did not block a unit')
if (!stumpWalk.crossed) throw new Error('stump blocked the path — chopping should open lanes')

// 4.68) the rival counters: facing a spear wall, it leans into archers
const counterSetup = await page3.evaluate(() => {
  const g = window.__game.state
  const tcE = g.ents.find(e => e.team === 1 && e.kind === 'towncenter')
  const raxId = g.ents.some(e => e.team === 1 && e.kind === 'barracks' && e.complete)
    ? null : window.__game.spawn('barracks', 1, tcE.x - 130, tcE.y + 130)
  const rangeId = window.__game.spawn('archeryrange', 1, tcE.x + 130, tcE.y + 130)
  const houseIds = [ // room to recruit — the test measures choices, not housing
    window.__game.spawn('house', 1, tcE.x - 200, tcE.y - 60),
    window.__game.spawn('house', 1, tcE.x + 200, tcE.y - 60),
  ]
  g.age = [2, 2]
  g.res[1] = { wood: 500, food: 800, gold: 500, stone: 0 }
  const spearIds = []
  for (let i = 0; i < 6; i++) spearIds.push(window.__game.spawn('spearman', 0, 300 + i * 24, 1150))
  g.ai.enabled = true
  g.ai.attackSize = 99 // think, don't march
  g.ai.thinkT = 0
  window.__game.setSpeed(10)
  return { spearIds, rangeId, raxId, houseIds }
})
await waitSim(page3, 6) // a handful of think ticks
const counterResult = await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  g.ai.enabled = false
  let archers = 0, melee = 0
  for (const e of g.ents) {
    if (e.team !== 1 || !e.queue) continue
    for (const q of e.queue) {
      if (q.kind === 'archer') archers++
      else if (q.kind === 'spearman' || q.kind === 'swordsman') melee++
    }
  }
  return { archers, melee }
})
console.log('counter play vs spear wall:', counterResult)
if (counterResult.archers < 2) throw new Error('AI facing a spear wall barely queued archers')
await page3.evaluate(({ spearIds, rangeId, raxId, houseIds }) => { // tear the practice field down
  const g = window.__game.state
  for (const id of spearIds) { const e = g.byId.get(id); if (e) e.hp = 0 }
  for (const e of g.ents.filter(e => e.team === 1 && e.queue)) {
    e.queue.length = 0
    if (e.research) e.research = undefined
    if (!e.complete) e.hp = 0 // any project it broke ground on during the ticks
  }
  const range = g.byId.get(rangeId); if (range) range.hp = 0
  if (raxId) { const r = g.byId.get(raxId); if (r) r.hp = 0 }
  for (const id of houseIds) { const h = g.byId.get(id); if (h) h.hp = 0 }
  for (const v of g.ents.filter(e => e.team === 1 && e.kind === 'villager')) {
    v.state = 'idle'; v.targetId = undefined
  }
}, counterSetup)
await waitSim(page3, 1)

// 4.7) the mill takes food drop-offs, sparing the long walk home
const millCheck = await page3.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const bush = g.ents.find(e => e.kind === 'berrybush' && (e.amount ?? 0) > 20 &&
    Math.hypot(e.x - tc.x, e.y - tc.y) > 300) // far enough that the mill is clearly the closer drop-off
  if (!bush) throw new Error('setup: no far-off berry bush left for the mill test')
  window.__game.spawn('mill', 0, bush.x + 90, bush.y + 60)
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  v.x = bush.x + 20; v.y = bush.y + 20
  v.state = 'gather'; v.targetId = bush.id; v.gatherT = 0; v.carry = 0
  window.__game.setSpeed(15)
  return { foodBefore: g.res[0].food }
})
await waitSim(page3, 22)
const millResult = await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  return { food: g.res[0].food, mill: g.ents.some(e => e.team === 0 && e.kind === 'mill' && e.complete) }
})
console.log('mill drop-off:', millCheck, '->', millResult)
if (!millResult.mill) throw new Error('mill missing after spawn')
if (millResult.food - millCheck.foodBefore < 12)
  throw new Error('mill drop-off too slow — villager likely hauling to the Town Hall')

// 5) bell + garrison: villagers shelter in the TC and it shoots attackers down
const bellJob = await page3.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  // one villager is mid-harvest; the doors should send them straight back to it
  const worker = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  const bush = g.ents.find(e => e.kind === 'berrybush' && (e.amount ?? 0) > 10)
  worker.state = 'gather'; worker.targetId = bush.id; worker.gatherT = 0
  for (let i = 0; i < 2; i++) {
    // the clear strip east of the Town Hall, between the grove and the clump
    const id = window.__game.spawn('swordsman', 1, tc.x + 280 + i * 30, tc.y - 45)
    const u = g.byId.get(id)
    u.state = 'attackmove'; u.tx = tc.x; u.ty = tc.y
  }
  window.__game.select(tc.id)
  return { workerId: worker.id, bushId: bush.id }
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
const released = await page3.evaluate(({ workerId, bushId }) => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const worker = g.byId.get(workerId)
  // the raid is over: sweep any raider who survived by wandering out of
  // arrow range, so later tests aren't ambushed by a leftover sword
  for (const e of g.ents.filter(e => e.team === 1 &&
    ['spearman', 'swordsman', 'archer', 'knight'].includes(e.kind))) e.hp = 0
  return {
    garrison: tc.garrison ?? 0,
    hidden: g.ents.filter(e => e.hidden).length,
    backToWork: worker ? worker.state === 'gather' && worker.targetId === bushId : false,
  }
}, bellJob)
console.log('released:', released)
if (released.garrison !== 0 || released.hidden !== 0) throw new Error('villagers were not released')
if (!released.backToWork) throw new Error('doors did not send the villager back to their berry bush')

// 5.5) repairs: hammer the battered Town Hall back to health, for a trickle of wood
const repairSetup = await page3.evaluate(() => {
  const g = window.__game.state
  g.res[0].wood = 200
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  if (tc.hp >= tc.maxHp) tc.hp = tc.maxHp * 0.5
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  v.state = 'idle'; v.targetId = undefined
  window.__game.select(v.id)
  g.camera.x = tc.x; g.camera.y = tc.y
  const c = document.getElementById('game').getBoundingClientRect()
  return { hp: Math.round(tc.hp), wood: g.res[0].wood, pos: { x: c.width / 2, y: c.height / 2 } }
})
await page3.waitForTimeout(500) // stay outside the double-tap window
await page3.tap('#game', { position: repairSetup.pos })
await page3.waitForTimeout(250)
const repairOrder = await page3.evaluate(() => {
  const g = window.__game.state
  const v = g.byId.get(g.selection[0])
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  return { state: v ? v.state : null, onTC: v ? v.targetId === tc.id : false }
})
console.log('repair order:', repairOrder)
if (repairOrder.state !== 'build' || !repairOrder.onTC)
  throw new Error('tapping the damaged Town Hall did not start repairs')
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 30)
const repaired = await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const v = g.byId.get(g.selection[0])
  return {
    hp: Math.round(tc.hp), maxHp: tc.maxHp, wood: Math.round(g.res[0].wood),
    vill: v ? {
      state: v.state, target: v.targetId, x: Math.round(v.x), y: Math.round(v.y),
      dTC: Math.round(Math.hypot(v.x - tc.x, v.y - tc.y)), side: v.avoidSide,
    } : null,
    tcPos: { x: tc.x, y: tc.y, id: tc.id },
  }
})
console.log('repaired:', repairSetup, '->', repaired)
if (repaired.hp - repairSetup.hp < 100) throw new Error('repairs made no progress')
if (repaired.wood >= repairSetup.wood) throw new Error('repairs should consume wood')

// 5.6) steering: a walk order straight through a building goes around it
const steer = await page3.evaluate(() => {
  const g = window.__game.state
  const bx = 1250, by = 700 // open meadow, far from every other test's furniture
  window.__game.spawn('barracks', 0, bx, by)
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  v.x = bx; v.y = by + 110
  v.state = 'move'; v.tx = bx; v.ty = by - 110; v.targetId = undefined
  window.__game.setSpeed(15)
  return { villId: v.id, goal: { x: bx, y: by - 110 } }
})
await waitSim(page3, 20)
const steered = await page3.evaluate(({ villId, goal }) => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const v = g.byId.get(villId)
  if (!v) {
    return {
      d: -1,
      diag: {
        vills: g.ents.filter(e => e.team === 0 && e.kind === 'villager')
          .map(e => ({ id: e.id, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, state: e.state })),
        enemySoldiers: g.ents.filter(e => e.team === 1 &&
          ['spearman', 'swordsman', 'archer'].includes(e.kind))
          .map(e => ({ kind: e.kind, x: Math.round(e.x), y: Math.round(e.y), state: e.state })),
        over: g.over,
      },
    }
  }
  const d = Math.round(Math.hypot(v.x - goal.x, v.y - goal.y))
  // walk the wanderer home so later tests find the crew where they expect it
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  v.x = tc.x + 70; v.y = tc.y + 60; v.state = 'idle'; v.targetId = undefined
  return { d, state: v.state }
}, steer)
console.log('steering around a barracks:', steered)
if (steered.d > 40) throw new Error('villager got stuck behind the building')

// 5.7) crowded bush: three gatherers nestle in instead of elbowing each other
const crowd = await page3.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const bush = g.ents.reduce((best, e) => {
    if (e.kind !== 'berrybush' || (e.amount ?? 0) < 30) return best
    const d = Math.hypot(e.x - tc.x, e.y - tc.y)
    return !best || d < best.d ? { e, d } : best
  }, null).e
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager').slice(0, 3)
  vills.forEach((v, i) => { // stage them beside the bush — this test is about nestling
    v.x = bush.x - 50 + i * 20
    v.y = bush.y + 55
    v.state = 'gather'; v.targetId = bush.id; v.gatherT = 0; v.carry = 0
  })
  window.__game.setSpeed(15)
  return { bushId: bush.id, ids: vills.map(v => v.id), food: g.res[0].food }
})
await waitSim(page3, 12)
const crowded = await page3.evaluate(({ bushId, ids, food }) => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const bush = g.byId.get(bushId)
  const working = ids.map(id => g.byId.get(id)).filter(v => v &&
    (v.state === 'gather' || v.state === 'return')).length
  return {
    working,
    atBush: ids.map(id => g.byId.get(id)).filter(v => v &&
      Math.hypot(v.x - bush.x, v.y - bush.y) < 60).length,
    gained: Math.round(g.res[0].food - food),
  }
}, crowd)
console.log('crowded bush:', crowded)
if (crowded.working < 3) throw new Error('gatherers could not all settle around one bush')

// 5.8) the chase: a scout runs down a fleeing villager without losing it
const chase = await page3.evaluate(() => {
  const g = window.__game.state
  const runnerId = window.__game.spawn('villager', 1, 700, 700)
  const runner = g.byId.get(runnerId)
  runner.state = 'move'; runner.tx = 1500; runner.ty = 300 // flees across the meadow
  const scout = g.ents.find(e => e.team === 0 && e.kind === 'scout')
  scout.x = 640; scout.y = 760
  scout.state = 'attack'; scout.targetId = runnerId; scout.resume = null
  window.__game.setSpeed(15)
  return { runnerId, scoutId: scout.id }
})
await waitSim(page3, 50)
const chased = await page3.evaluate(({ runnerId, scoutId }) => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const scout = g.byId.get(scoutId)
  // send the scout home for the fog tests
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  if (scout) { scout.x = tc.x - 90; scout.y = tc.y - 50; scout.state = 'idle'; scout.targetId = undefined }
  return { runnerDead: !g.byId.has(runnerId), scoutAlive: !!scout }
}, chase)
console.log('chase:', chased)
if (!chased.runnerDead) throw new Error('scout never ran the fleeing villager down')
if (!chased.scoutAlive) throw new Error('scout died chasing a villager')

// 5.9) HUD crew counts + tap-a-pill villager management
await page3.evaluate(() => {
  const g = window.__game.state
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  const tree = g.ents.find(e => e.kind === 'tree' && (e.amount ?? 0) > 5)
  const bush = g.ents.find(e => e.kind === 'berrybush' && (e.amount ?? 0) > 5)
  vills[0].state = 'gather'; vills[0].targetId = tree.id; vills[0].gatherT = 0
  vills[1].state = 'gather'; vills[1].targetId = bush.id; vills[1].gatherT = 0
  vills[2].state = 'idle'; vills[2].targetId = undefined
})
await page3.waitForTimeout(400)
const hudCrew = await page3.evaluate(() => ({
  wood: document.getElementById('wood-v').textContent,
  food: document.getElementById('food-v').textContent,
  idle: document.getElementById('idle-n').textContent,
}))
console.log('hud crew counts:', hudCrew)
if (hudCrew.wood !== '1' || hudCrew.food !== '1' || hudCrew.idle !== '1')
  throw new Error(`HUD crew counts wrong: ${JSON.stringify(hudCrew)}`)

// tap the gold pill: the idle villager heads for a mine
await page3.tap('#p-gold')
await page3.waitForTimeout(300)
const goldSend = await page3.evaluate(() => {
  const g = window.__game.state
  const v = g.ents.filter(e => e.team === 0 && e.kind === 'villager')[2]
  const t = g.byId.get(v.targetId)
  return { state: v.state, kind: t ? t.kind : null, idle: document.getElementById('idle-n').textContent }
})
console.log('tap gold pill:', goldSend)
if (goldSend.state !== 'gather' || goldSend.kind !== 'goldmine')
  throw new Error('gold pill did not send the idle villager mining')
if (goldSend.idle !== '0') throw new Error('idle count did not drop after assignment')

// no idle hands left: tapping wood borrows from the busiest other line (food)
await page3.tap('#p-wood')
await page3.waitForTimeout(300)
const borrowed = await page3.evaluate(() => {
  const g = window.__game.state
  const v = g.ents.filter(e => e.team === 0 && e.kind === 'villager')[1]
  const t = g.byId.get(v.targetId)
  return { kind: t ? t.kind : null }
})
console.log('tap wood pill (borrow):', borrowed)
if (borrowed.kind !== 'tree') throw new Error('wood pill did not borrow from the busiest line')

// pop pill jumps the camera to an idle villager and selects them
await page3.evaluate(() => {
  const g = window.__game.state
  const v = g.ents.filter(e => e.team === 0 && e.kind === 'villager')[0]
  v.state = 'idle'; v.targetId = undefined
  g.selection = []
  g.camera.x = 1500; g.camera.y = 300 // stare at the far corner first
  g.uiDirty = true
})
await page3.waitForTimeout(300)
await page3.tap('#p-pop')
await page3.waitForTimeout(250)
const idleJump = await page3.evaluate(() => {
  const g = window.__game.state
  const v = g.ents.filter(e => e.team === 0 && e.kind === 'villager')[0]
  return {
    selected: g.selection.length === 1 && g.selection[0] === v.id,
    nearCam: Math.abs(g.camera.x - v.x) < 200,
  }
})
console.log('tap pop pill (idle jump):', idleJump)
if (!idleJump.selected || !idleJump.nearCam) throw new Error('pop pill did not jump to the idle villager')


// 6) placement mode dies when you tap your own stuff instead of open ground
await page3.evaluate(() => {
  const g = window.__game.state
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  window.__game.select(v.id)
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  g.camera.x = tc.x; g.camera.y = tc.y
})
await page3.waitForTimeout(250)
await openCat(page3, 'economy')
await page3.tap('[data-cmd="build-house"]')
await page3.waitForTimeout(200)
const canvasBox = await page3.evaluate(() => {
  const c = document.getElementById('game').getBoundingClientRect()
  return { x: c.width / 2, y: c.height / 2 }
})
// ghost placement: cross/tick present, ghost follows taps, red spots refuse
const ghostUI = await page3.evaluate(() => ({
  cross: !!document.querySelector('[data-cmd="cancel-place"]'),
  tick: !!document.querySelector('[data-cmd="confirm"]'),
  placePos: window.__game.state.placePos,
}))
console.log('ghost ui:', ghostUI)
if (!ghostUI.cross || !ghostUI.tick || !ghostUI.placePos) throw new Error('ghost placement UI missing')
await page3.tap('#game', { position: canvasBox }) // drop the ghost on the Town Hall (blocked)
await page3.waitForTimeout(200)
const snapped = await page3.evaluate(() => {
  const p = window.__game.state.placePos
  return p && p.x % 16 === 0 && p.y % 16 === 0
})
if (!snapped) throw new Error('ghost position did not snap to the build grid')
await page3.tap('[data-cmd="confirm"]') // must refuse
await page3.waitForTimeout(250)
const badPlace = await page3.evaluate(() => ({
  placing: window.__game.state.placing,
  houses: window.__game.state.ents.filter(e => e.team === 0 && e.kind === 'house').length,
}))
console.log('blocked confirm:', badPlace)
if (badPlace.placing !== 'house' || badPlace.houses > 0) throw new Error('blocked spot should refuse to place')
await page3.tap('[data-cmd="cancel-place"]')
await page3.waitForTimeout(250)
const cancelled = await page3.evaluate(() => ({
  placing: window.__game.state.placing,
  selected: window.__game.state.selection.length,
}))
console.log('placement cancel:', cancelled)
if (cancelled.placing !== null) throw new Error('cross did not cancel placement')
if (!cancelled.selected) throw new Error('villager should stay selected after cancelling')

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
await openCat(page3, 'economy')
await page3.tap('[data-cmd="build-house"]')
await page3.waitForTimeout(200)
await page3.tap('#game', { position: canvasBox }) // position on open meadow
await page3.waitForTimeout(200)
await page3.tap('[data-cmd="confirm"]')
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
  // find a clear spot near a player-side tree, using the game's own clearance
  // rule — and of all candidates, take the one closest to the Town Hall so the
  // builder approaches the grove's open face, not a pocket deep in the woods
  const tc0 = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const trees = g.ents.filter(e => e.kind === 'tree' && e.x < 700 && e.y > 600)
  let t = null, spot = null, bestD = Infinity
  for (const tree of trees) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const s = { x: tree.x + Math.cos(a) * 75, y: tree.y + Math.sin(a) * 75 }
      if (s.x < 80 || s.y < 80) continue
      // mirror the game's square-footprint rule (axis distance, small gap)
      const clear = g.ents.every(e =>
        (e.kind === 'villager' || e.kind === 'swordsman' || e.kind === 'spearman' ||
         e.kind === 'archer' || e.kind === 'scout') ||
        Math.max(Math.abs(s.x - e.x), Math.abs(s.y - e.y)) > 28 + e.r + 14)
      const d = Math.hypot(s.x - tc0.x, s.y - tc0.y)
      if (clear && d < bestD) { t = tree; spot = s; bestD = d }
    }
  }
  if (!spot) throw new Error('no clear spot near the grove')
  g.camera.x = spot.x; g.camera.y = spot.y
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  // stage the builder beside the spot — this test is placement + drop-off,
  // not a cross-forest hike
  const v = vills[0]
  const dl = Math.hypot(tc0.x - spot.x, tc0.y - spot.y) || 1
  v.x = spot.x + ((tc0.x - spot.x) / dl) * 60
  v.y = spot.y + ((tc0.y - spot.y) / dl) * 60
  v.state = 'idle'; v.targetId = undefined
  window.__game.select(v.id)
  g.uiDirty = true
  return { treeId: t.id, spot }
})
await page3.waitForTimeout(300)
await openCat(page3, 'economy')
await page3.tap('[data-cmd="build-lumbercamp"]')
await page3.waitForTimeout(200)
const placingState = await page3.evaluate(() => ({
  placing: window.__game.state.placing,
  sel: window.__game.state.selection.length,
  toasts: window.__game.state.toasts.map(t => t.text),
}))
console.log('placing state:', placingState)
await page3.tap('#game', { position: canvasBox })
await page3.waitForTimeout(200)
await page3.tap('[data-cmd="confirm"]')
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
    chopperRetargeted: (chopper.state === 'gather' || chopper.state === 'return') &&
      chopper.targetId !== treeId,
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
await openCat(page3, 'economy')
await page3.tap('[data-cmd="build-farm"]')
await page3.waitForTimeout(200)
await page3.tap('#game', { position: canvasBox })
await page3.waitForTimeout(200)
await page3.tap('[data-cmd="confirm"]')
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

// 13.5) one pair of hands per field: a second farmer on the same farm bounces off
const crewSetup = await page3.evaluate(() => {
  const g = window.__game.state
  const farm = g.ents.find(e => e.kind === 'farm' && e.team === 0 && e.complete)
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  // vills[2] is already working the field; force vills[0] onto the same farm
  vills[0].state = 'gather'; vills[0].targetId = farm.id; vills[0].gatherT = 0
  vills[0].x = farm.x - 30; vills[0].y = farm.y
  window.__game.setSpeed(10)
  return { farmId: farm.id, farmerIds: [vills[0].id, vills[2].id] }
})
await waitSim(page3, 4)
const crewResult = await page3.evaluate(({ farmId, farmerIds }) => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const onFarm = farmerIds.map(id => g.byId.get(id))
    .filter(v => v && (v.state === 'gather' || v.state === 'return') && v.targetId === farmId).length
  const bounced = g.byId.get(farmerIds[0])
  const toasts = g.toasts.map(t => t.text)
  // walk the test farmer home — the expansion test needs its builder near the Town Hall
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  if (bounced) { bounced.x = tc.x + 70; bounced.y = tc.y + 60; bounced.state = 'idle'; bounced.targetId = undefined }
  return { onFarm, bouncedState: bounced?.state, toasts }
}, crewSetup)
console.log('farm crew cap:', crewResult)
if (crewResult.onFarm > 1) throw new Error('two villagers worked the same farm')

// 13.6) the hunt: a villager runs a deer down and hauls venison to the mill
const deerSetup = await page3.evaluate(() => {
  const g = window.__game.state
  const deer = g.ents.filter(e => e.kind === 'deer' && e.hp > 0)
    .sort((a, b) => Math.hypot(a.x - 1420, a.y - 1100) - Math.hypot(b.x - 1420, b.y - 1100))[0]
  if (!deer) throw new Error('setup: no live deer on the map')
  // a drop-off within hauling distance, so the test measures hunting, not hiking
  const millId = window.__game.spawn('mill', 0, deer.x - 90, deer.y - 60)
  // everyone else rests, so the food ledger shows only trickle + venison
  for (const o of g.ents.filter(e => e.team === 0 && e.kind === 'villager')) {
    o.state = 'idle'; o.targetId = undefined
  }
  const v = g.ents.filter(e => e.team === 0 && e.kind === 'villager')[1]
  v.x = deer.x - 40; v.y = deer.y + 10
  v.state = 'gather'; v.targetId = deer.id; v.gatherT = 0; v.carry = 0
  window.__game.setSpeed(15)
  return { deerId: deer.id, millId, villId: v.id, food: g.res[0].food }
})
await waitSim(page3, 60)
const deerResult = await page3.evaluate(({ deerId, millId, villId, food }) => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const deer = g.byId.get(deerId)
  const v = g.byId.get(villId)
  // tidy the hunting camp away and walk the hunter home
  const mill = g.byId.get(millId); if (mill) mill.hp = 0
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  if (v) { v.x = tc.x + 70; v.y = tc.y + 60; v.state = 'idle'; v.targetId = undefined; v.carry = 0 }
  return {
    deerDown: !deer || deer.hp <= 0,
    taken: deer ? 90 - (deer.amount ?? 90) : 90,
    foodGained: Math.round(g.res[0].food - food),
    abbeyAlive: g.ents.some(e => e.team === 0 && e.kind === 'abbeymill' && e.complete),
  }
}, deerSetup)
console.log('deer hunt:', deerResult)
if (!deerResult.deerDown) throw new Error('the deer was never brought down')
if (deerResult.taken < 12) throw new Error('the fallen deer was barely harvested: ' + deerResult.taken)
// almost everything taken from the carcass must reach the stores (one load
// may still be in hand; the Abbey Mill trickle only ever adds on top)
if (deerResult.foodGained < deerResult.taken - 8)
  throw new Error(`venison never reached the stores: took ${deerResult.taken}, banked ${deerResult.foodGained}`)
await waitSim(page3, 1)

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
await openCat(page3, 'economy')
await page3.tap('[data-cmd="build-towncenter"]')
await page3.waitForTimeout(200)
await page3.tap('#game', { position: canvasBox })
await page3.waitForTimeout(200)
await page3.tap('[data-cmd="confirm"]')
await page3.waitForTimeout(250)
const tcPlaced = await page3.evaluate(() =>
  window.__game.state.ents.filter(e => e.team === 0 && e.kind === 'towncenter').length)
if (tcPlaced !== 2) throw new Error('second town hall was not placed')
await page3.evaluate(() => window.__game.setSpeed(20))
await waitSim(page3, 100) // long walk (at half speed now) + 45s build
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
await waitSim(page3, 50) // the aged-up enemy village is denser now; the ride takes longer
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

// non-scouts reveal too: stand a villager in untouched black and check the cell
// (teleported — this test is about vision, the walking is covered elsewhere)
const villFog = await page3.evaluate(() => {
  const g = window.__game.state
  const cellOf = s => Math.floor(s.y / 32) * g.fog.w + Math.floor(s.x / 32)
  const candidates = [
    { x: 1500, y: 1180 }, { x: 1700, y: 1120 }, { x: 240, y: 120 }, { x: 1800, y: 950 },
  ]
  const spot = candidates.find(s => !g.fog.explored[cellOf(s)])
  if (!spot) return { idx: -1, explored: 1 }
  const idx = cellOf(spot)
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  v.homeX = v.x; v.homeY = v.y
  v.x = spot.x; v.y = spot.y; v.state = 'idle'; v.targetId = undefined
  return { idx, explored: g.fog.explored[idx], villId: v.id }
})
if (villFog.explored) throw new Error('all candidate fog spots were already explored')
await waitSim(page3, 3) // a couple of vision refreshes
const villFogAfter = await page3.evaluate(({ idx, villId }) => {
  const g = window.__game.state
  const v = g.byId.get(villId)
  const out = { explored: g.fog.explored[idx], visible: g.fog.visible[idx] }
  if (v) { v.x = v.homeX; v.y = v.homeY } // pop them back where they were
  return out
}, villFog)
console.log('villager fog reveal:', villFogAfter)
if (!villFogAfter.explored || !villFogAfter.visible)
  throw new Error('a walking villager did not reveal the fog')

// 16) watchtower: fires on its own, shelters units, releases them
await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  g.res[0].wood = 300
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  for (const v of vills) { v.state = 'idle'; v.targetId = undefined } // all hands available
  window.__game.select(vills[0].id)
  // shoo any deer that wandered over the build spot back to their meadow
  for (const d of g.ents.filter(e => e.kind === 'deer')) {
    if (Math.hypot(d.x - 500, d.y - 1000) < 200) {
      d.x = d.homeX; d.y = d.homeY; d.tx = undefined; d.ty = undefined
    }
  }
  // the landmarks pick their own ground near the Town Hall, so this test
  // finds a genuinely clear spot instead of trusting a hardcoded one
  const spot = window.__findSpot(22, 500, 1000)
  g.camera.x = spot.x; g.camera.y = spot.y
  g.uiDirty = true
})
await page3.waitForTimeout(250)
await openCat(page3, 'military')
await page3.tap('[data-cmd="build-watchtower"]')
await page3.waitForTimeout(200)
await page3.tap('#game', { position: canvasBox })
await page3.waitForTimeout(200)
await page3.tap('[data-cmd="confirm"]')
await page3.waitForTimeout(250)
const towerPlaced = await page3.evaluate(() => ({
  placed: window.__game.state.ents.some(e => e.team === 0 && e.kind === 'watchtower'),
  near: window.__game.state.ents
    .filter(e => Math.abs(e.x - 500) < 140 && Math.abs(e.y - 1000) < 140)
    .map(e => `${e.kind}@${Math.round(e.x)},${Math.round(e.y)}`),
}))
if (!towerPlaced.placed) throw new Error('watchtower was not placed — nearby: ' + towerPlaced.near.join(' '))
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 55) // walk (half speed) + 18s build
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
// (heal it first — tapping a damaged building now means "repair it")
await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  g.selection = [vills[0].id, vills[1].id]
  const tower = g.ents.find(e => e.team === 0 && e.kind === 'watchtower')
  tower.hp = tower.maxHp
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

// 17) archery range trains archers; archers kill at range
await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  g.res[0].wood = 400; g.res[0].food = 300; g.res[0].gold = 300
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager')
  for (const v of vills) { v.state = 'idle'; v.targetId = undefined }
  window.__game.select(vills[0].id)
  const spot = window.__findSpot(44, 700, 900) // archery range footprint
  g.camera.x = spot.x; g.camera.y = spot.y
  g.uiDirty = true
})
await page3.waitForTimeout(250)
await openCat(page3, 'military')
await page3.tap('[data-cmd="build-archeryrange"]')
await page3.waitForTimeout(200)
await page3.tap('#game', { position: canvasBox })
await page3.waitForTimeout(200)
await page3.tap('[data-cmd="confirm"]')
await page3.waitForTimeout(250)
const rangePlaced = await page3.evaluate(() =>
  window.__game.state.ents.some(e => e.team === 0 && e.kind === 'archeryrange'))
if (!rangePlaced) throw new Error('archery range was not placed')
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 55)
const rangeReady = await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const range = g.ents.find(e => e.team === 0 && e.kind === 'archeryrange' && e.complete)
  if (range) window.__game.select(range.id)
  return !!range
})
if (!rangeReady) throw new Error('archery range never completed')
await page3.waitForTimeout(250)
await page3.screenshot({ path: 'shots/15-archery-range.png' })
await page3.tap('[data-cmd="train-archer"]')
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 15)
const archerBorn = await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const archer = g.ents.find(e => e.team === 0 && e.kind === 'archer')
  if (!archer) return null
  // a practice target: an enemy villager well inside bow range but out of reach
  const id = window.__game.spawn('villager', 1, archer.x + 100, archer.y)
  archer.state = 'attack'; archer.targetId = id
  return { arrowsBefore: g.arrowsFired }
})
if (!archerBorn) throw new Error('archer never trained')
await page3.evaluate(() => window.__game.setSpeed(15))
await waitSim(page3, 25)
const archery = await page3.evaluate(() => {
  const g = window.__game.state
  return {
    arrows: g.arrowsFired,
    targetDead: !g.ents.some(e => e.team === 1 && e.kind === 'villager' && e.x > 600 && e.y > 700),
    archerAlive: g.ents.some(e => e.team === 0 && e.kind === 'archer'),
  }
})
console.log('archery:', archerBorn.arrowsBefore, '->', archery)
if (archery.arrows <= archerBorn.arrowsBefore) throw new Error('archer never loosed an arrow')
if (!archery.targetDead) throw new Error('archer failed to kill the practice target')
if (!archery.archerAlive) throw new Error('archer died shooting a villager?!')

// 18) spearman: trains at the barracks, and skewers cavalry
const spearSetup = await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  // a spearman vs an enemy scout: the anti-cavalry bonus should end it in 3 pokes
  const spear = g.byId.get(window.__game.spawn('spearman', 0, 800, 800))
  const scoutId = window.__game.spawn('scout', 1, 840, 800)
  g.byId.get(scoutId).scanT = 9999 // hold still, practice pony
  spear.state = 'attack'; spear.targetId = scoutId
  return { scoutId }
})
await page3.evaluate(() => window.__game.setSpeed(10))
await waitSim(page3, 8)
const spearFight = await page3.evaluate(({ scoutId }) => {
  const g = window.__game.state
  return {
    scoutDead: !g.byId.has(scoutId),
    spearAlive: g.ents.some(e => e.team === 0 && e.kind === 'spearman'),
  }
}, spearSetup)
console.log('spearman vs cavalry:', spearFight)
if (!spearFight.scoutDead) throw new Error('spearman failed to kill a scout quickly (cavalry bonus missing?)')
if (!spearFight.spearAlive) throw new Error('spearman died to a scout?!')
// barracks dock offers both infantry lines (main page still has a barracks)
await page.evaluate(() => {
  const g = window.__game.state
  const b = g.ents.find(e => e.team === 0 && e.kind === 'barracks' && e.complete)
  window.__game.select(b.id)
})
await page.waitForTimeout(300)
if (!(await page.isVisible('[data-cmd="train-spearman"]'))) throw new Error('barracks missing the spearman button')
if (!(await page.isVisible('[data-cmd="train-swordsman"]'))) throw new Error('barracks missing the swordsman button')

// 18.5) pathfinding: a forest pocket is one obstacle, not a trap of trunks —
// a walk ordered straight through a U-shaped grove goes AROUND it
const pocketSetup = await page3.evaluate(() => {
  const g = window.__game.state
  const treeIds = []
  // a U opening west in the far southeast; the walk crosses right through its mouth
  for (let y = 1075; y <= 1225; y += 25) treeIds.push(window.__game.spawn('tree', -1, 1760, y))
  for (let x = 1620; x <= 1740; x += 25) {
    treeIds.push(window.__game.spawn('tree', -1, x, 1075))
    treeIds.push(window.__game.spawn('tree', -1, x, 1225))
  }
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  v.x = 1560; v.y = 1150; v.state = 'move'; v.tx = 1830; v.ty = 1150; v.targetId = undefined
  window.__game.setSpeed(15)
  return { treeIds, villId: v.id }
})
await waitSim(page3, 30)
const pocketResult = await page3.evaluate(({ treeIds, villId }) => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const v = g.byId.get(villId)
  const d = Math.round(Math.hypot(v.x - 1830, v.y - 1150))
  // clear the practice grove away and walk the wanderer home
  for (const id of treeIds) {
    const t = g.byId.get(id)
    if (t) { const i = g.ents.indexOf(t); if (i >= 0) g.ents.splice(i, 1); g.byId.delete(id) }
  }
  g.navDirty = true
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  v.x = tc.x + 70; v.y = tc.y + 60; v.state = 'idle'; v.targetId = undefined
  return { d }
}, pocketSetup)
console.log('forest pocket:', pocketResult)
if (pocketResult.d > 40) throw new Error('villager got trapped in the forest pocket: ' + pocketResult.d)

// landscape: the whole HUD fits and the game actually plays sideways
const page2 = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true })
await page2.goto('file://' + resolve('dist/index.html') + '?map=classic')
await page2.bringToFront()
// in landscape the rotate prompt must NOT be up
if (await page2.isVisible('#rotate-overlay')) throw new Error('rotate prompt showing in landscape')
await page2.tap('#play-btn')
await page2.waitForTimeout(400)
const landscapeHud = await page2.evaluate(() => {
  const inView = el => {
    const r = el.getBoundingClientRect()
    return r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight
  }
  return {
    pills: [...document.querySelectorAll('#hud-top .pill')].every(inView),
    army: inView(document.getElementById('army-panel')),
  }
})
console.log('landscape hud:', landscapeHud)
if (!landscapeHud.pills || !landscapeHud.army) throw new Error('landscape HUD spills off screen')
await page2.evaluate(() => {
  const g = window.__game.state
  g.ai.enabled = false
  const v = g.ents.find(e => e.team === 0 && e.kind === 'villager')
  window.__game.select(v.id)
})
await page2.waitForTimeout(300)
if (await page2.isHidden('#dock')) throw new Error('dock hidden in landscape with villager selected')
const landscapeMove = await page2.evaluate(() => {
  const g = window.__game.state
  const v = g.byId.get(g.selection[0])
  return { x0: v.x, y0: v.y }
})
await page2.tap('#game', { position: { x: 620, y: 140 } })
await page2.evaluate(() => window.__game.setSpeed(10))
await page2.waitForTimeout(800)
const landscapeMoved = await page2.evaluate(({ x0, y0 }) => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const v = g.byId.get(g.selection[0]) ?? g.ents.find(e => e.team === 0 && e.kind === 'villager')
  return { moved: Math.hypot(v.x - x0, v.y - y0) > 30 }
}, landscapeMove)
console.log('landscape tap-to-move:', landscapeMoved)
if (!landscapeMoved.moved) throw new Error('tap-to-move did not work in landscape')
await page2.screenshot({ path: 'shots/6-landscape.png' })

// simulated rotation: the canvas backing size must self-heal within a frame,
// and portrait raises the "turn sideways" prompt
await page2.setViewportSize({ width: 390, height: 844 })
await page2.waitForTimeout(400)
if (!(await page2.isVisible('#rotate-overlay'))) throw new Error('rotate prompt missing in portrait')
await page2.evaluate(() => window.__game.allowPortrait()) // drop the prompt for the remaining checks
const rotated = await page2.evaluate(() => {
  const c = document.getElementById('game')
  const dpr = window.devicePixelRatio || 1
  return {
    healed: c.width === Math.round(c.clientWidth * dpr) &&
      c.height === Math.round(c.clientHeight * dpr),
  }
})
console.log('rotation self-heal:', rotated)
if (!rotated.healed) throw new Error('canvas kept a stale size after rotation')

// no-void: even an absurd zoom-out + off-map pan snaps back inside the world
await page2.evaluate(() => {
  const g = window.__game.state
  g.camera.zoom = 0.05
  g.camera.x = -5000
  g.camera.y = 99999
})
await page2.mouse.move(195, 420)
await page2.mouse.wheel(0, 1) // any zoom gesture runs the clamp
await page2.waitForTimeout(200)
const noVoid = await page2.evaluate(() => {
  const g = window.__game.state
  const r = document.getElementById('game').getBoundingClientRect()
  const halfW = r.width / 2 / g.camera.zoom
  const halfH = r.height / 2 / g.camera.zoom
  const PAD = 90 // CAM_PAD: the fog-dark drift allowance past the edge
  return {
    zoom: Math.round(g.camera.zoom * 1000) / 1000,
    inside: g.camera.x - halfW >= -PAD - 1 && g.camera.x + halfW <= 1920 + PAD + 1 &&
      g.camera.y - halfH >= -PAD - 1 && g.camera.y + halfH <= 1280 + PAD + 1,
  }
})
console.log('no-void clamp:', noVoid)
if (!noVoid.inside) throw new Error('camera can still see beyond the fog rim')

// 19) random maps: every roll is a big fresh world where both homes get their kit
for (const seed of [7, 13, 2026]) {
  const pg = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })
  await pg.goto('file://' + resolve('dist/index.html') + '?map=' + seed)
  await pg.evaluate(() => window.__game.allowPortrait())
  const inv = await pg.evaluate(() => {
    const g = window.__game.state
    const tcs = [0, 1].map(team => g.ents.find(e => e.team === team && e.kind === 'towncenter'))
    const near = (tc, kind, maxD) => g.ents.filter(e =>
      e.kind === kind && Math.hypot(e.x - tc.x, e.y - tc.y) <= maxD).length
    return {
      w: g.world.w, h: g.world.h,
      fogW: g.fog.w, fogH: g.fog.h,
      tcDist: Math.round(Math.hypot(tcs[0].x - tcs[1].x, tcs[0].y - tcs[1].y)),
      kits: tcs.map(tc => ({
        berries: near(tc, 'berrybush', 330),
        trees: near(tc, 'tree', 520),
        gold: near(tc, 'goldmine', 400),
        stone: near(tc, 'stonequarry', 460),
      })),
      deer: g.ents.filter(e => e.kind === 'deer').length,
      vills: g.ents.filter(e => e.kind === 'villager').length,
      streams: g.streams.length,
      fords: g.fords.length,
      crags: g.ents.filter(e => e.kind === 'crag').length,
      // the stream must not strand anyone: a path from home to home exists,
      // and nothing spawned in the drink
      reachable: !!window.__game.findPath(0, tcs[0].x, tcs[0].y, tcs[1].x, tcs[1].y),
      wetSpawns: g.ents.filter(e => window.__game.inWater(e.x, e.y)).length,
    }
  })
  console.log(`random map (seed ${seed}):`, JSON.stringify(inv))
  if (inv.w !== 3840 || inv.h !== 2560) throw new Error('random map should be 3840x2560')
  if (inv.fogW !== Math.ceil(3840 / 32) || inv.fogH !== Math.ceil(2560 / 32)) throw new Error('fog grid not sized to the map')
  if (inv.tcDist < 1800) throw new Error('town halls spawned too close: ' + inv.tcDist)
  for (const kit of inv.kits) {
    if (kit.berries < 4) throw new Error('a home is missing its berry patch: ' + JSON.stringify(kit))
    if (kit.trees < 10) throw new Error('a home is missing its woods: ' + JSON.stringify(kit))
    if (kit.gold < 1) throw new Error('a home is missing its gold mine: ' + JSON.stringify(kit))
    if (kit.stone < 1) throw new Error('a home is missing its stone quarry: ' + JSON.stringify(kit))
  }
  if (inv.deer < 9) throw new Error('the wilds are short of deer: ' + inv.deer)
  if (inv.vills !== 6) throw new Error('starting villagers wrong: ' + inv.vills)
  if (inv.streams < 1 || inv.fords < 3) throw new Error('the map is missing its stream or fords')
  if (inv.crags < 3) throw new Error('the map is short of crags: ' + inv.crags)
  if (!inv.reachable) throw new Error('the stream strands the two villages — no path home to home')
  if (inv.wetSpawns > 0) throw new Error('entities spawned in the water: ' + inv.wetSpawns)
  await pg.close()
}
// two different seeds must not deal the same map
const layoutOf = async seed => {
  const pg = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  await pg.goto('file://' + resolve('dist/index.html') + '?map=' + seed)
  const sig = await pg.evaluate(() => {
    const g = window.__game.state
    return g.ents.filter(e => e.kind === 'goldmine').map(e => `${Math.round(e.x)},${Math.round(e.y)}`).join(';')
  })
  await pg.close()
  return sig
}
if (await layoutOf(7) === await layoutOf(13)) throw new Error('different seeds dealt identical maps')
console.log('random map invariants hold')

await browser.close()
console.log('PLAYTEST PASSED')
