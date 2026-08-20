// Headless playtest: loads the built game at a phone viewport, drives the
// core loop through the window.__game hooks, and saves screenshots to shots/.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

mkdirSync('shots', { recursive: true })
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

// start the game; hold enemy raids back so the smoke test can verify the
// economy/training flow deterministically (raids are checked separately below)
await page.tap('#play-btn')
await page.evaluate(() => { window.__game.state.wave.at = 99999 })
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
    hint: g.hint,
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
if (!(await page.isVisible('button.cmd:has-text("Build House")'))) throw new Error('build buttons missing for villager')
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
await page.tap('button.cmd:has-text("Build Barracks")')
await page.waitForTimeout(200)
const placeTap = await page.evaluate(() => {
  const g = window.__game.state
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  g.camera.x = tc.x; g.camera.y = tc.y
  const c = document.getElementById('game').getBoundingClientRect()
  return { x: c.width / 2 + 130 * g.camera.zoom, y: c.height / 2 - 120 * g.camera.zoom }
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
  return { sel: g.selection.length, offCenter: Math.hypot(g.camera.x - cx, g.camera.y - cy) }
})
console.log('army select:', armySel)
if (armySel.sel < s3.playerSoldiers) throw new Error('army button did not select all soldiers')
if (armySel.offCenter > 250) throw new Error('army button did not recenter the camera')

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

// 4) fresh page: verify enemy raids spawn and march
const page3 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })
await page3.goto('file://' + resolve('dist/index.html'))
await page3.tap('#play-btn')
await page3.evaluate(() => { window.__game.state.wave.at = 2; window.__game.setSpeed(10) })
await page3.waitForTimeout(1500)
const raid = await page3.evaluate(() => {
  const g = window.__game.state
  return {
    raiders: g.ents.filter(e => e.team === 1 && e.kind === 'swordsman' && (e.state === 'attackmove' || e.state === 'attack')).length,
    waveCount: g.wave.count,
  }
})
console.log('raid check:', raid)
if (raid.waveCount < 1 || raid.raiders < 1) throw new Error('enemy raid did not spawn')

// 5) bell + garrison: villagers shelter in the TC and it shoots the raiders down
await page3.evaluate(() => {
  const g = window.__game.state
  window.__game.setSpeed(1)
  const tc = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  window.__game.select(tc.id)
})
await page3.waitForTimeout(300)
await page3.tap('button.cmd:has-text("Ring the Bell")')
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
await page3.tap('button.cmd:has-text("Open the Doors")')
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
await page3.tap('button.cmd:has-text("Build House")')
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
await page3.tap('button.cmd:has-text("Build House")')
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

// landscape sanity shot
const page2 = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true })
await page2.goto('file://' + resolve('dist/index.html'))
await page2.tap('#play-btn')
await page2.waitForTimeout(400)
await page2.screenshot({ path: 'shots/6-landscape.png' })

await browser.close()
console.log('PLAYTEST PASSED')
