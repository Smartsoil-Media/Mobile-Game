// Touch-first input: tap to select/command, drag to pan, pinch to zoom.
import { Game, Ent, Buildable, BUILDINGS, WORLD_W, WORLD_H, dist, isUnit, isBuilding, isResource } from './data'
import { entAt, spawn, canAfford, pay, toast } from './world'

export interface PointerState {
  pointers: Map<number, { x: number; y: number }>
  downX: number
  downY: number
  downT: number
  panning: boolean
  pinchDist: number
}

export function screenToWorld(g: Game, canvas: HTMLCanvasElement, sx: number, sy: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const vx = sx - rect.left - rect.width / 2
  const vy = sy - rect.top - rect.height / 2
  return { x: g.camera.x + vx / g.camera.zoom, y: g.camera.y + vy / g.camera.zoom }
}

export function clampCamera(g: Game, canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect()
  const halfW = rect.width / 2 / g.camera.zoom
  const halfH = rect.height / 2 / g.camera.zoom
  const pad = 120
  g.camera.x = Math.max(halfW - pad, Math.min(WORLD_W - halfW + pad, g.camera.x))
  g.camera.y = Math.max(halfH - pad, Math.min(WORLD_H - halfH + pad, g.camera.y))
  // if the viewport is bigger than the map, just center
  if (halfW * 2 > WORLD_W + pad * 2) g.camera.x = WORLD_W / 2
  if (halfH * 2 > WORLD_H + pad * 2) g.camera.y = WORLD_H / 2
}

function selectedEnts(g: Game): Ent[] {
  return g.selection.map(id => g.byId.get(id)).filter((e): e is Ent => !!e)
}

// ---- Commands ----

export function commandGather(g: Game, villagers: Ent[], res: Ent): void {
  for (const v of villagers) {
    v.state = 'gather'
    v.targetId = res.id
    v.gatherT = 0
  }
}

export function commandMove(g: Game, units: Ent[], x: number, y: number): void {
  const n = units.length
  units.forEach((u, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2
    const spread = n > 1 ? 16 + 6 * Math.sqrt(n) : 0
    u.state = isUnit(u) ? 'move' : u.state
    u.tx = x + Math.cos(a) * spread * (i > 0 ? 1 : 0)
    u.ty = y + Math.sin(a) * spread * (i > 0 ? 1 : 0)
    u.targetId = undefined
    u.resume = null
  })
}

export function commandAttack(g: Game, units: Ent[], target: Ent): void {
  for (const u of units) {
    u.state = 'attack'
    u.targetId = target.id
    u.resume = null
  }
}

export function commandBuild(g: Game, villagers: Ent[], site: Ent): void {
  for (const v of villagers) {
    v.state = 'build'
    v.targetId = site.id
  }
}

export function tryPlaceBuilding(g: Game, kind: Buildable, x: number, y: number): boolean {
  const b = BUILDINGS[kind]
  if (!canAfford(g, 0, b.cost)) { toast(g, `Not enough resources for a ${b.name}.`); return false }
  if (x < 70 || x > WORLD_W - 70 || y < 70 || y > WORLD_H - 70) { toast(g, 'Too close to the meadow edge.'); return false }
  for (const e of g.ents) {
    if (dist(x, y, e.x, e.y) < b.r + e.r + (isUnit(e) ? 0 : 12)) {
      if (!isUnit(e)) { toast(g, "Can't build there — too crowded."); return false }
    }
  }
  const villagers = selectedEnts(g).filter(e => e.kind === 'villager' && e.team === 0)
  if (!villagers.length) { toast(g, 'Select a villager first.'); return false }
  pay(g, 0, b.cost)
  const site = spawn(g, kind, 0, x, y, false)
  commandBuild(g, villagers, site)
  g.placing = null
  g.uiDirty = true
  return true
}

// ---- Tap resolution ----

const DOUBLE_TAP_MS = 350
const GROUP_RADIUS = 170
let lastTapT = 0
let lastTapEnt = -1

export function handleTap(g: Game, canvas: HTMLCanvasElement, sx: number, sy: number): void {
  if (g.over) return
  const { x, y } = screenToWorld(g, canvas, sx, sy)

  const hit = entAt(g, x, y)

  if (g.placing) {
    // placement only lands on open ground — tapping one of your own things
    // means you changed your mind, so drop placement and handle the tap normally
    if (!hit || hit.team !== 0) {
      tryPlaceBuilding(g, g.placing, x, y)
      return
    }
    g.placing = null
    g.uiDirty = true
  }

  // double-tap on one of your units: select all its kind nearby
  const now = performance.now()
  const isDouble = !!hit && hit.id === lastTapEnt && now - lastTapT < DOUBLE_TAP_MS
  lastTapT = now
  lastTapEnt = hit ? hit.id : -1
  if (isDouble && hit && hit.team === 0 && isUnit(hit)) {
    const crew = g.ents.filter(e =>
      e.team === 0 && e.kind === hit.kind && !e.hidden &&
      dist(e.x, e.y, hit.x, hit.y) < GROUP_RADIUS)
    g.selection = crew.map(e => e.id)
    g.uiDirty = true
    return
  }

  const sel = selectedEnts(g)
  const myUnits = sel.filter(e => isUnit(e) && e.team === 0)

  // villagers tap an unfinished building: lend a hand instead of selecting it
  if (hit && hit.team === 0 && isBuilding(hit) && hit.complete === false) {
    const villagers = myUnits.filter(e => e.kind === 'villager')
    if (villagers.length) {
      commandBuild(g, villagers, hit)
      return
    }
  }

  // villagers tap one of your farms: work the field
  if (hit && hit.team === 0 && hit.kind === 'farm' && hit.complete) {
    const villagers = myUnits.filter(e => e.kind === 'villager')
    if (villagers.length) {
      commandGather(g, villagers, hit)
      return
    }
  }

  if (hit && hit.team === 0) {
    // tapping your own stuff toggles: already selected → deselect
    const i = g.selection.indexOf(hit.id)
    if (i >= 0) g.selection.splice(i, 1)
    else g.selection = [hit.id]
    g.uiDirty = true
    return
  }

  if (myUnits.length) {
    const villagers = myUnits.filter(e => e.kind === 'villager')
    const soldiers = myUnits.filter(e => e.kind === 'swordsman')
    if (hit && hit.team === 1) {
      commandAttack(g, myUnits, hit)
      return
    }
    if (hit && isResource(hit)) {
      if (villagers.length) commandGather(g, villagers, hit)
      if (soldiers.length) commandMove(g, soldiers, x, y)
      return
    }
    commandMove(g, myUnits, x, y)
    return
  }

  // nothing useful selected: tap on enemy/resource just clears selection
  if (g.selection.length) { g.selection = []; g.uiDirty = true }
}

export function selectArmy(g: Game, canvas?: HTMLCanvasElement): void {
  // every fighting unit you own (scouts stay out of the battle line)
  const army = g.ents.filter(e =>
    e.team === 0 && isUnit(e) && e.kind !== 'villager' && e.kind !== 'scout' && !e.hidden)
  if (!army.length) { toast(g, 'No soldiers yet — build a Barracks and train some!'); return }
  g.placing = null // selection is changing hands; drop any pending placement
  g.selection = army.map(e => e.id)
  // bring the camera to the troops so the button visibly does something
  g.camera.x = army.reduce((s, e) => s + e.x, 0) / army.length
  g.camera.y = army.reduce((s, e) => s + e.y, 0) / army.length
  if (canvas) clampCamera(g, canvas)
  g.uiDirty = true
}

// ---- Pointer plumbing ----

export function attachInput(g: Game, canvas: HTMLCanvasElement): void {
  const ps: PointerState = { pointers: new Map(), downX: 0, downY: 0, downT: 0, panning: false, pinchDist: 0 }

  canvas.addEventListener('pointerdown', ev => {
    canvas.setPointerCapture(ev.pointerId)
    ps.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    if (ps.pointers.size === 1) {
      ps.downX = ev.clientX; ps.downY = ev.clientY; ps.downT = performance.now()
      ps.panning = false
    } else if (ps.pointers.size === 2) {
      const [a, b] = [...ps.pointers.values()]
      ps.pinchDist = Math.hypot(b.x - a.x, b.y - a.y)
      ps.panning = true // two fingers never tap
    }
  })

  canvas.addEventListener('pointermove', ev => {
    const p = ps.pointers.get(ev.pointerId)
    if (!p) return
    const prevX = p.x, prevY = p.y
    p.x = ev.clientX; p.y = ev.clientY

    if (ps.pointers.size === 2) {
      const [a, b] = [...ps.pointers.values()]
      const d = Math.hypot(b.x - a.x, b.y - a.y)
      if (ps.pinchDist > 0) {
        const factor = d / ps.pinchDist
        g.camera.zoom = Math.max(0.4, Math.min(1.6, g.camera.zoom * factor))
      }
      ps.pinchDist = d
      clampCamera(g, canvas)
      return
    }

    if (!ps.panning && Math.hypot(ev.clientX - ps.downX, ev.clientY - ps.downY) > 12) {
      ps.panning = true
    }
    if (ps.panning) {
      g.camera.x -= (p.x - prevX) / g.camera.zoom
      g.camera.y -= (p.y - prevY) / g.camera.zoom
      clampCamera(g, canvas)
    }
  })

  const finish = (ev: PointerEvent) => {
    const wasPanning = ps.panning
    const quick = performance.now() - ps.downT < 500
    ps.pointers.delete(ev.pointerId)
    if (ps.pointers.size === 0) {
      if (!wasPanning && quick) handleTap(g, canvas, ev.clientX, ev.clientY)
      ps.panning = false
      ps.pinchDist = 0
    }
  }
  canvas.addEventListener('pointerup', finish)
  canvas.addEventListener('pointercancel', ev => { ps.pointers.delete(ev.pointerId) })

  canvas.addEventListener('wheel', ev => {
    ev.preventDefault()
    const factor = ev.deltaY < 0 ? 1.1 : 0.9
    g.camera.zoom = Math.max(0.4, Math.min(1.6, g.camera.zoom * factor))
    clampCamera(g, canvas)
  }, { passive: false })
}
