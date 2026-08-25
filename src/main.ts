// Bootstrap: canvas sizing, fixed-timestep loop, glue, test hooks.
import { Game, Kind, Buildable } from './data'
import { createGame, spawn, canPlaceAt, placementCells } from './world'
import { findPath, inWater } from './nav'
import { update } from './sim'
import { render } from './render'
import { attachInput, clampCamera, selectArmy, snapPlace } from './input'
import { initUI, syncUI } from './ui'

const canvas = document.getElementById('game') as HTMLCanvasElement
// ?map=classic pins the handcrafted meadow (the test suite lives there);
// ?map=<number> replays a specific roll; otherwise every game is a fresh map
const mapParam = new URLSearchParams(location.search).get('map')
const g: Game = mapParam === 'classic'
  ? createGame()
  : createGame({ seed: mapParam ? (Number(mapParam) >>> 0) || 1 : (Date.now() >>> 0) })

// installed-app duties: cache for offline play (real hosting only — never
// file:// test runs or the claude.ai artifact preview)
if ('serviceWorker' in navigator && location.hostname.endsWith('github.io')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline play is a bonus, not a must */ })
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(canvas.clientWidth * dpr)
  canvas.height = Math.round(canvas.clientHeight * dpr)
  clampCamera(g, canvas)
}
window.addEventListener('resize', resize)
window.addEventListener('orientationchange', resize)

attachInput(g, canvas)
initUI(g)
resize()

const STEP = 1 / 30
let acc = 0
let last = performance.now()

function frame(now: number): void {
  // iOS reports rotated dimensions late — self-heal any stale canvas size
  const dpr = window.devicePixelRatio || 1
  if (canvas.width !== Math.round(canvas.clientWidth * dpr) ||
    canvas.height !== Math.round(canvas.clientHeight * dpr)) resize()
  const wall = Math.min(0.25, (now - last) / 1000)
  last = now
  // the "turn sideways" screen also pauses the meadow — no raids while rotated
  const rotateHold = canvas.clientHeight > canvas.clientWidth &&
    !document.body.classList.contains('allow-portrait')
  if (g.started && !rotateHold) {
    acc += wall * g.speed
    let steps = 0
    while (acc >= STEP && steps < 240) { update(g, STEP); acc -= STEP; steps++ }
  }
  render(g, canvas, now / 1000)
  syncUI(g)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// Hooks for headless playtesting (and curious tinkerers).
;(window as any).__game = {
  state: g,
  setSpeed(n: number) { g.speed = n },
  start() { g.started = true; document.getElementById('start-overlay')!.classList.add('hidden') },
  selectArmy() { selectArmy(g, canvas) },
  select(id: number) { g.selection = [id]; g.uiDirty = true },
  spawn(kind: Kind, team: number, x: number, y: number) { return spawn(g, kind, team, x, y).id },
  allowPortrait() { document.body.classList.add('allow-portrait') }, // headless tests run portrait
  findPath(team: number, x0: number, y0: number, x1: number, y1: number) { return findPath(g, team, x0, y0, x1, y1) },
  inWater(x: number, y: number) { return inWater(g, x, y) },
  canPlaceAt(kind: Kind, x: number, y: number) { return canPlaceAt(g, kind, x, y) },
  snapFor(kind: Buildable, x: number, y: number) { return snapPlace(x, y, kind) },
  placementCells(kind: Kind, x: number, y: number, r: number) { return placementCells(g, kind, x, y, r) },
}
