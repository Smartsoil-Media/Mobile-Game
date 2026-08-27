// Bootstrap: canvas sizing, fixed-timestep loop, glue, test hooks.
import { Game, Kind, Buildable, Ent, BUILDINGS } from './data'
import { createGame, spawn, canPlaceAt, placementCells, gateSnap, wallsUnderGate } from './world'
import { findPath, inWater } from './nav'
import { update } from './sim'
import { render } from './render'
import { attachInput, clampCamera, selectArmy, snapPlace, commandMove, beginMuster, plantMuster } from './input'
import { initUI, syncUI } from './ui'
import { unlockAudio, listenFrom, drainSfx, sfx, setMuted, setVolume, audioReady, muted, heardSfx, clearHeard, sfxProbe } from './audio'

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

// Browsers only hand out a live AudioContext from inside a real gesture, so the
// meadow stays silent until the first touch anywhere on the page.
document.addEventListener('pointerdown', unlockAudio, { capture: true })
// One soft tap for every button in the HUD, wired once rather than at each one.
document.addEventListener('click', ev => {
  const t = ev.target as HTMLElement | null
  if (t?.closest('button, .pill, .chip, .card-pick')) sfx('tap')
}, { capture: true })

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
  // sound follows the eye: the mixer needs to know what the camera can see
  listenFrom(g.camera.x, g.camera.y,
    canvas.clientWidth / g.camera.zoom, canvas.clientHeight / g.camera.zoom)
  drainSfx(g)
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
  BUILDINGS, // read-only stats, so a test can ask how big a thing actually is
  commandMove(units: Ent[], x: number, y: number) { commandMove(g, units, x, y) },
  beginMuster(banner: number) { beginMuster(g, banner) },
  plantMuster(banner: number, x: number, y: number) { plantMuster(g, banner, x, y) },
  snapFor(kind: Buildable, x: number, y: number) { return snapPlace(x, y, kind) },
  gateSnap(x: number, y: number) { return gateSnap(g, x, y) },
  wallsUnderGate(x: number, y: number) { return wallsUnderGate(g, x, y) },
  placementCells(kind: Kind, x: number, y: number, r: number) { return placementCells(g, kind, x, y, r) },
  // audio hooks for headless runs (no speaker attached, so we check the queue)
  sfxQueue() { return g.sfxQueue.map(c => c.name) },
  clearSfx() { g.sfxQueue.length = 0 },
  audio() { return { ready: audioReady(), muted } },
  heard() { return heardSfx() },
  clearHeard() { clearHeard() },
  sfxProbe() { return sfxProbe() },
  unlockAudio() { unlockAudio() },
  setMuted(on: boolean) { setMuted(on) },
  setVolume(v: number) { setVolume(v) },
}
