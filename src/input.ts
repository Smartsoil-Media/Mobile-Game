// Touch-first input: tap to select/command, drag to pan, pinch to zoom.
import { Game, Ent, Buildable, ResKind, LandmarkKind, BUILDINGS, LANDMARKS, BANNERS, BANNER_MAX, KINGS_BANNER, SOURCE_OF, AGE_NAMES, PLACE_SNAP, snapTiles, CAM_PAD, WORLD_W, WORLD_H, dist, isUnit, isBuilding, isResource, canBanner, mustBanner, cue} from './data'
import { entAt, spawn, nearest, canAfford, canPlaceAt, clearSpent, gateSnap, wallsUnderGate, pay, toast, gatherResOf, wallLinePoints, farmTaken } from './world'

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
  if (!rect.width || !rect.height) return
  // never zoom out past "the world (plus its fog rim) fills the screen"
  const minZoom = Math.max(
    rect.width / (g.world.w + CAM_PAD * 2),
    rect.height / (g.world.h + CAM_PAD * 2))
  g.camera.zoom = Math.max(minZoom, Math.min(1.6, g.camera.zoom))
  const halfW = rect.width / 2 / g.camera.zoom
  const halfH = rect.height / 2 / g.camera.zoom
  // the camera may drift a little past the edge — out there it's all fog-dark
  g.camera.x = Math.max(halfW - CAM_PAD, Math.min(g.world.w - halfW + CAM_PAD, g.camera.x))
  g.camera.y = Math.max(halfH - CAM_PAD, Math.min(g.world.h - halfH + CAM_PAD, g.camera.y))
}

function selectedEnts(g: Game): Ent[] {
  return g.selection.map(id => g.byId.get(id)).filter((e): e is Ent => !!e)
}

// snap a building's centre so its tile footprint sits square on the grid
export function snapPlace(x: number, y: number, kind?: Buildable | null): { x: number; y: number } {
  return snapTiles(x, y, kind ? BUILDINGS[kind].tiles : 2)
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
  if ((b.age ?? 1) > g.age[0]) { toast(g, `Reach the ${AGE_NAMES[b.age ?? 1]} first!`); return false }
  const lm = LANDMARKS[kind as LandmarkKind]
  if (lm) {
    if (lm.civ !== g.civs[0]) { toast(g, 'That landmark belongs to another banner.'); return false }
    if (g.age[0] >= lm.toAge) { toast(g, `The ${AGE_NAMES[lm.toAge]} is already yours.`); return false }
    if (lm.toAge !== g.age[0] + 1) { toast(g, `Reach the ${AGE_NAMES[lm.toAge - 1]} first!`); return false }
    if (g.ents.some(e => e.team === 0 && LANDMARKS[e.kind as LandmarkKind]?.toAge === lm.toAge)) {
      toast(g, 'A landmark is already rising.')
      return false
    }
  }
  if (kind === 'wall') return tryPlaceWall(g)
  if (!canAfford(g, 0, b.cost)) { toast(g, `Not enough resources for a ${b.name}.`); return false }
  if (!canPlaceAt(g, kind, x, y)) { toast(g, "Can't build there — the ground is blocked."); return false }
  let villagers = selectedEnts(g).filter(e => e.kind === 'villager' && e.team === 0)
  if (!villagers.length && lm) {
    // landmarks are begun from the Town Hall — round up the nearest spare hands
    villagers = g.ents
      .filter(e => e.team === 0 && e.kind === 'villager' && !e.hidden && e.state !== 'build')
      .sort((a, b2) => dist(a.x, a.y, x, y) - dist(b2.x, b2.y, x, y))
      .slice(0, 2)
  }
  if (!villagers.length) { toast(g, 'Select a villager first.'); return false }
  pay(g, 0, b.cost)
  clearSpent(g, kind, x, y) // sweep away the stumps and rubble underneath
  const site = spawn(g, kind, 0, x, y, false)
  if (kind === 'gate') {
    site.angle = g.placeAngle
    // the gate is set INTO the fence: the posts it swallows come down, and
    // their timber goes back in the pile
    for (const post of wallsUnderGate(g, x, y)) {
      g.res[0].wood += BUILDINGS.wall.cost.wood
      const i = g.ents.indexOf(post)
      if (i >= 0) g.ents.splice(i, 1)
      g.byId.delete(post.id)
    }
    g.navDirty = true
  }
  commandBuild(g, villagers, site)
  cue(g, 'place', x, y)
  g.placing = null
  g.placePos = null
  g.placeEnd = null
  g.uiDirty = true
  return true
}

// place the whole dragged line of palisade posts at once
function tryPlaceWall(g: Game): boolean {
  const b = BUILDINGS.wall
  const villagers = selectedEnts(g).filter(e => e.kind === 'villager' && e.team === 0)
  if (!villagers.length) { toast(g, 'Select a villager first.'); return false }
  const pts = wallLinePoints(g).filter(p => p.ok)
  if (!pts.length) { toast(g, "Can't build there — the ground is blocked."); return false }
  let placed = 0
  let first: Ent | null = null
  for (const p of pts) {
    if (!canAfford(g, 0, b.cost)) break
    if (!canPlaceAt(g, 'wall', p.x, p.y)) continue // earlier posts may crowd a later spot
    pay(g, 0, b.cost)
    clearSpent(g, 'wall', p.x, p.y)
    const site = spawn(g, 'wall', 0, p.x, p.y, false)
    if (!first) first = site
    placed++
  }
  if (!placed) { toast(g, 'Not enough wood for the fence.'); return false }
  if (placed < pts.length) toast(g, 'The wood ran out partway along the fence.')
  commandBuild(g, villagers, first!)
  cue(g, 'place', first!.x, first!.y)
  g.placing = null
  g.placePos = null
  g.placeEnd = null
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

  if (g.placing) {
    // while placing, taps just move the ghost (snapped); the tick/cross decide.
    // Wall lines: the tap moves whichever end of the fence is closer.
    if (g.placing === 'gate') {
      // a gate belongs in a fence: lie along the run, at whatever slant it takes
      const fit = gateSnap(g, x, y)
      if (fit) { g.placePos = { x: fit.x, y: fit.y }; g.placeAngle = fit.angle }
      else { g.placePos = snapPlace(x, y, 'gate'); g.placeAngle = 0 }
      return
    }
    const p = snapPlace(x, y, g.placing)
    if (g.placing === 'wall' && g.placePos && g.placeEnd) {
      const da = dist(x, y, g.placePos.x, g.placePos.y)
      const db = dist(x, y, g.placeEnd.x, g.placeEnd.y)
      if (da < db) g.placePos = p
      else g.placeEnd = p
    } else {
      g.placePos = p
    }
    return
  }

  const hit = entAt(g, x, y)

  // tap feedback: whatever you touched flashes; bare ground gets a small mark
  g.taps.push({
    x: hit ? hit.x : x, y: hit ? hit.y : y,
    r: hit ? hit.r : 0, ent: !!hit,
    at: performance.now() / 1000,
  })
  if (g.taps.length > 6) g.taps.shift()

  // info mode: taps read a thing out instead of commanding it — nothing is
  // selected, nothing is ordered, and bare ground closes the card
  if (g.infoMode) {
    g.infoId = hit ? hit.id : null
    g.uiDirty = true
    return
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

  // villagers tap one of your farms: one works this field, the rest spread
  // to free farms nearby — every field wants exactly one pair of hands
  if (hit && hit.team === 0 && hit.kind === 'farm' && hit.complete) {
    const villagers = myUnits.filter(e => e.kind === 'villager')
    if (villagers.length) {
      const fields = [hit, ...g.ents
        .filter(o => o !== hit && o.kind === 'farm' && o.team === 0 && !!o.complete)
        .sort((a, b) => dist(a.x, a.y, hit.x, hit.y) - dist(b.x, b.y, hit.x, hit.y))]
      let fi = 0
      for (let vi = 0; vi < villagers.length; vi++) {
        while (fi < fields.length && farmTaken(g, fields[fi], villagers)) fi++
        if (fi >= fields.length) {
          toast(g, 'Every field has its farmer — plant another farm.')
          commandMove(g, villagers.slice(vi), hit.x + 46, hit.y + 40)
          break
        }
        commandGather(g, [villagers[vi]], fields[fi])
        fi++
      }
      return
    }
  }

  // villagers tap a battered building: patch it up (soldiers still garrison towers)
  if (hit && hit.team === 0 && isBuilding(hit) && hit.complete && hit.hp < hit.maxHp) {
    const villagers = myUnits.filter(e => e.kind === 'villager')
    if (villagers.length) {
      commandBuild(g, villagers, hit)
      if (hit.kind === 'watchtower' || hit.kind === 'whitekeep' || hit.kind === 'redpalace') {
        for (const u of myUnits.filter(e => e.kind !== 'villager')) {
          u.state = 'garrison'
          u.targetId = hit.id
        }
      }
      return
    }
  }

  // a monk with a relic taps your church or ministry: enshrine it there
  if (hit && hit.team === 0 && (hit.kind === 'church' || hit.kind === 'ministry') && hit.complete) {
    const carriers = myUnits.filter(m => m.kind === 'monk' && m.relicId !== undefined)
    if (carriers.length) {
      for (const m of carriers) {
        m.state = 'enshrine'
        m.targetId = hit.id
      }
      return
    }
  }

  // units tap one of your watchtowers (or a fortress landmark): climb inside
  if (hit && hit.team === 0 && (hit.kind === 'watchtower' || hit.kind === 'whitekeep' || hit.kind === 'redpalace') && hit.complete && myUnits.length) {
    for (const u of myUnits) {
      u.state = 'garrison'
      u.targetId = hit.id
    }
    return
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
    const monks = myUnits.filter(e => e.kind === 'monk')
    const soldiers = myUnits.filter(e => e.kind !== 'villager' && e.kind !== 'monk')
    if (hit && hit.team === 1) {
      // monks carry no weapon — they walk along while the others fight
      commandAttack(g, myUnits.filter(e => e.kind !== 'monk'), hit)
      if (monks.length) commandMove(g, monks, x, y)
      return
    }
    // a wayside relic: only a monk may lift it
    if (hit && hit.kind === 'relic') {
      const freeHands = monks.filter(m => m.relicId === undefined)
      if (freeHands.length) {
        for (const m of freeHands) {
          m.state = 'fetchrelic'
          m.targetId = hit.id
        }
      } else {
        if (!monks.length) toast(g, 'Only a monk may carry a relic — train one at a Church.')
        commandMove(g, myUnits, x, y)
      }
      return
    }
    // a live crocodile: soldiers put it to the sword, villagers hunt it
    if (hit && hit.kind === 'croc' && hit.hp > 0) {
      if (soldiers.length) commandAttack(g, soldiers, hit)
      if (villagers.length) commandGather(g, villagers, hit)
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

function nearestSourceFor(g: Game, v: Ent, res: ResKind): Ent | null {
  const raw = nearest(g, v.x, v.y, o => o.kind === SOURCE_OF[res] && (o.amount ?? 0) > 0)
  if (res === 'food') {
    // only farms with no farmer — one pair of hands per field
    const farm = nearest(g, v.x, v.y, o => o.kind === 'farm' && o.team === 0 && !!o.complete && !farmTaken(g, o, v))
    if (farm && (!raw || dist(v.x, v.y, farm.x, farm.y) < dist(v.x, v.y, raw.x, raw.y))) return farm
  }
  return raw
}

// HUD pill tap: put one more villager on this resource — idle hands first,
// then borrow from whichever other line has the most workers
export function sendVillagerToResource(g: Game, res: ResKind): void {
  const vills = g.ents.filter(e => e.team === 0 && e.kind === 'villager' && !e.hidden)
  if (!vills.length) { toast(g, 'No villagers yet — train some at the Town Hall.'); return }
  let pick: Ent | null = null
  const idle = vills.filter(v => v.state === 'idle')
  if (idle.length) {
    // the idle villager with the shortest walk to the goods
    let best = Infinity
    for (const v of idle) {
      const src = nearestSourceFor(g, v, res)
      const d = src ? dist(v.x, v.y, src.x, src.y) : Infinity
      if (d < best) { best = d; pick = v }
    }
    if (!pick) pick = idle[0]
  } else {
    const groups: Partial<Record<ResKind, Ent[]>> = {}
    for (const v of vills) {
      const r = gatherResOf(g, v)
      if (r && r !== res) (groups[r] ??= []).push(v)
    }
    let busiest: ResKind | null = null
    for (const r of ['food', 'wood', 'gold', 'stone'] as ResKind[]) {
      if (groups[r]?.length && (!busiest || groups[r]!.length > groups[busiest]!.length)) busiest = r
    }
    if (busiest) pick = groups[busiest]![groups[busiest]!.length - 1]
  }
  if (!pick) { toast(g, 'Every villager is busy building or fighting.'); return }
  const src = nearestSourceFor(g, pick, res)
  if (!src) {
    const names: Record<ResKind, string> = { wood: 'trees', food: 'food', gold: 'gold', stone: 'stone' }
    toast(g, `No ${names[res]} left to gather.`)
    return
  }
  commandGather(g, [pick], src)
  g.uiDirty = true
}

// HUD pop-pill tap: jump to an idle villager (cycles through them)
let idleCycle = 0
export function cycleIdleVillager(g: Game, canvas?: HTMLCanvasElement): void {
  const idle = g.ents.filter(e =>
    e.team === 0 && e.kind === 'villager' && !e.hidden && e.state === 'idle')
  if (!idle.length) { toast(g, 'Nobody is idle — the village hums along.'); return }
  const v = idle[idleCycle++ % idle.length]
  g.placing = null
  g.placePos = null
  g.selection = [v.id]
  g.camera.x = v.x
  g.camera.y = v.y
  if (canvas) clampCamera(g, canvas)
  g.uiDirty = true
}

// army-panel chip: grab every soldier of one type and bring the camera along
// selection never yanks the camera — the minimap is the way to travel
export function selectUnitsOfKind(g: Game, kind: Ent['kind'], canvas?: HTMLCanvasElement, banner?: number): void {
  const troop = g.ents.filter(e => e.team === 0 && e.kind === kind && !e.hidden &&
    (banner === undefined || e.banner === banner))
  if (!troop.length) return
  g.placing = null
  g.placePos = null
  g.placeEnd = null
  g.selection = troop.map(e => e.id)
  g.uiDirty = true
}

// muster one banner: everyone sworn to it answers. A monk with a reliquary in
// his arms keeps his errand — the relic matters more than the parade.
export function selectBanner(g: Game, banner: number, canvas?: HTMLCanvasElement): void {
  g.activeBanner = banner
  const host = g.ents.filter(e =>
    e.team === 0 && isUnit(e) && !e.hidden && e.banner === banner && e.relicId === undefined)
  g.placing = null // selection is changing hands; drop any pending placement
  g.placePos = null
  g.placeEnd = null
  g.selection = host.map(e => e.id)
  g.uiDirty = true
  if (!host.length) {
    toast(g, banner === KINGS_BANNER && g.banners === 1
      ? 'No soldiers yet — build a Barracks and train some!'
      : `${BANNERS[banner].name} has no one under it yet.`)
  }
}

// the army shield: muster the whole of whichever banner is currently active
export function selectArmy(g: Game, canvas?: HTMLCanvasElement): void {
  selectBanner(g, g.activeBanner, canvas)
}

// swear a selection to a banner (or, for monks alone, release them from one)
export function assignBanner(g: Game, units: Ent[], banner: number | null): void {
  let n = 0
  for (const u of units) {
    if (!canBanner(u) || u.team !== 0) continue
    if (banner === null && mustBanner(u)) continue // a soldier always rides under something
    u.banner = banner === null ? undefined : banner
    n++
  }
  if (!n) { toast(g, 'Only soldiers, engines and monks ride under a banner.'); return }
  toast(g, banner === null
    ? `${n} released from the banner.`
    : `${n} now ride${n === 1 ? 's' : ''} under ${BANNERS[banner].name}.`)
  g.uiDirty = true
}

// raise the next banner in the roll and hand it whatever is selected
export function raiseBanner(g: Game, units: Ent[]): void {
  if (g.banners >= BANNER_MAX) { toast(g, 'Every banner is already flying.'); return }
  const banner = g.banners++
  if (units.length) assignBanner(g, units, banner) // a hall may raise one with nobody yet
  g.activeBanner = banner
  toast(g, `${BANNERS[banner].name} rides out — the King's Army no longer counts them.`)
  g.uiDirty = true
}

// ---- Pointer plumbing ----

export function attachInput(g: Game, canvas: HTMLCanvasElement): void {
  const ps: PointerState & { dragGhost?: boolean; dragEnd?: boolean } =
    { pointers: new Map(), downX: 0, downY: 0, downT: 0, panning: false, pinchDist: 0, dragGhost: false, dragEnd: false }

  canvas.addEventListener('pointerdown', ev => {
    canvas.setPointerCapture(ev.pointerId)
    ps.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    if (ps.pointers.size === 1) {
      ps.downX = ev.clientX; ps.downY = ev.clientY; ps.downT = performance.now()
      ps.panning = false
      // grabbing the placement ghost? then the finger moves it, not the camera
      ps.dragGhost = false
      ps.dragEnd = false
      if (g.placing && g.placePos) {
        const w = screenToWorld(g, canvas, ev.clientX, ev.clientY)
        if (g.placing === 'wall' && g.placeEnd) {
          // grab whichever fence end is under the finger
          const da = dist(w.x, w.y, g.placePos.x, g.placePos.y)
          const db = dist(w.x, w.y, g.placeEnd.x, g.placeEnd.y)
          if (Math.min(da, db) < 46) {
            ps.dragGhost = true
            ps.dragEnd = db <= da
          }
        } else {
          const b = BUILDINGS[g.placing]
          if (dist(w.x, w.y, g.placePos.x, g.placePos.y) < b.r * 1.5 + 14) ps.dragGhost = true
        }
      }
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
      if (ps.dragGhost && g.placing && g.placePos) {
        const w = screenToWorld(g, canvas, ev.clientX, ev.clientY)
        if (g.placing === 'wall' && ps.dragEnd) g.placeEnd = snapPlace(w.x, w.y)
        else g.placePos = snapPlace(w.x, w.y)
      } else {
        g.camera.x -= (p.x - prevX) / g.camera.zoom
        g.camera.y -= (p.y - prevY) / g.camera.zoom
        clampCamera(g, canvas)
      }
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
