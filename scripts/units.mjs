// A contact sheet of every unit, both civs, idle / attacking / championed —
// drawn through the same sprite calls the game uses, at 2.6x so the kit is
// readable. `npm run units` writes shots/units.png. Art work is much easier to
// judge on one sheet than by hunting for a knight in a screenshot.
import { chromium } from 'playwright'
import { resolve } from 'path'
// same escape hatch as the playtest: a pinned browser when one is provided
const b = await chromium.launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {})
const p = await b.newPage({ viewport: { width: 1180, height: 620 }, deviceScaleFactor: 2 })
await p.goto('file://' + resolve('dist/index.html') + '?map=classic')
await p.waitForFunction(() => !!window.__game)
await p.evaluate(() => { window.__game.allowPortrait(); window.__game.start() })
await p.waitForTimeout(400)

// A contact sheet: every unit, both civs, idle and mid-swing, drawn straight
// onto a scratch canvas through the same sprite calls the game uses.
const png = await p.evaluate(async () => {
  const S = window.__game.sprites
  const KINDS = ['villager', 'spearman', 'swordsman', 'archer', 'scout', 'knight', 'monk']
  const CIVS = ['english', 'french']
  const CELL = 132, ROW = 190
  const c = document.createElement('canvas')
  c.width = (KINDS.length + 1) * CELL * 2
  c.height = (CIVS.length * 3) * ROW * 2
  const x = c.getContext('2d')
  x.scale(2, 2)
  x.fillStyle = '#7B9A5E'
  x.fillRect(0, 0, c.width, c.height)
  x.font = '600 13px system-ui'
  x.fillStyle = '#2C3A22'
  KINDS.forEach((k, i) => x.fillText(k, (i + 1) * CELL + 8, 22))
  let row = 0
  for (const civ of CIVS) {
    for (const mode of ['idle', 'attack', 'champ']) {
      const y0 = ROW * row + 46
      x.fillStyle = '#2C3A22'
      x.fillText(`${civ} · ${mode}`, 8, y0 + 60)
      KINDS.forEach((k, i) => {
        const e = {
          id: 1, kind: k, team: 0, x: 0, y: 0, r: 11, hp: 50, maxHp: 50, seed: 3,
          face: 1, phase: 0, stepped: mode === 'walk', heading: 0,
          state: mode === 'attack' ? 'attack' : 'idle', cd: mode === 'attack' ? 2.0 : 0,
        }
        x.save()
        x.translate((i + 1) * CELL + CELL / 2, y0 + 118)
        x.scale(2.6, 2.6)
        switch (k) {
          case 'villager': S.drawVillager(x, e, 0.4, civ); break
          case 'spearman': S.drawSpearman(x, e, 0.4, mode === 'champ', civ); break
          case 'swordsman': S.drawSwordsman(x, e, 0.4, mode === 'champ', civ); break
          case 'archer': S.drawArcher(x, e, 0.4, mode === 'champ', civ); break
          case 'scout': S.drawScout(x, e, 0.4, civ); break
          case 'knight': S.drawKnight(x, e, 0.4, mode === 'champ', civ); break
          case 'monk': S.drawMonk(x, e, 0.4, false); break
        }
        x.restore()
      })
      row++
    }
  }
  return c.toDataURL('image/png')
})
const fs = await import('fs')
fs.writeFileSync(process.argv[2] ?? 'shots/units.png', Buffer.from(png.split(',')[1], 'base64'))
await b.close()
