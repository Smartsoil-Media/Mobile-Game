// Touch-first input: tap to select/command, drag to pan, pinch to zoom.
import { Game, Ent, Buildable, ResKind, LandmarkKind, BUILDINGS, LANDMARKS, BANNERS, BANNER_MAX, LION_BANNER, SOURCE_OF, AGE_NAMES, PLACE_SNAP, snapTiles, CAM_PAD, TILT, WORLD_W, WORLD_H, dist, isUnit, isBuilding, isResource, canBanner, mustBanner, cue, Formation, FORMATION_SPACING, len,} from './data'
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
  // undo the view's vertical squash so a tap lands where the eye thinks it did
  return { x: g.camera.x + vx / g.camera.zoom, y: g.camera.y + vy / (g.camera.zoom * TILT) }
}

export function clampCamera(g: Game, canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  // never zoom out past "the world (plus its fog rim) fills the screen"
  const minZoom = Math.max(
    rect.width / (g.world.w + CAM_PAD * 2),
    rect.height / ((g.world.h + CAM_PAD * 2) * TILT))
  g.camera.zoom = Math.max(minZoom, Math.min(1.6, g.camera.zoom))
  const halfW = rect.width / 2 / g.camera.zoom
  const halfH = rect.height / 2 / (g.camera.zoom * TILT)
  // The camera may drift a little past the edge — out there it's all fog-dark.
  // A screenful now swallows far more ground north-to-south than east-to-west,
  // because the tilt squashes the world's Y. If the view ever grows taller than
  // the map the clamp would invert, so fall back to centring rather than
  // letting the camera snap to a nonsense edge.
  const span = (lo: number, hi: number, v: number, mid: number) =>
    lo > hi ? mid : Math.max(lo, Math.min(hi, v))
  g.camera.x = span(halfW - CAM_PAD, g.world.w - halfW + CAM_PAD, g.camera.x, g.world.w / 2)
  g.camera.y = span(halfH - CAM_PAD, g.world.h - halfH + CAM_PAD, g.camera.y, g.world.h / 2)
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

// Which formation a company marches in. Soldiers carry their banner with them,
// so the order follows whichever banner most of the selection rides under, and
// falls back to the one whose roster is on screen.
export function formationOf(g: Game, units: Ent[]): Formation {
  const tally = new Map<number, number>()
  let team = g.me
  for (const u of units) {
    if (u.banner === undefined) continue
    team = u.team
    tally.set(u.banner, (tally.get(u.banner) ?? 0) + 1)
  }
  let best = g.activeBanner, most = 0
  for (const [b, n] of tally) if (n > most) { most = n; best = b }
  return g.formation[team]?.[best] ?? 'bunch'
}

// Where each soldier should stand once they arrive. Everything is laid out
// facing the way the company is marching, so a line is drawn ACROSS the advance
// rather than along it.
const LINE_MAX = 12 // a rank wider than this is more of a wall than a company

function formationSlots(n: number, x: number, y: number, ux: number, uy: number,
                        kind: Formation): { x: number; y: number }[] {
  const S = FORMATION_SPACING
  // px,py is "across the advance"; ux,uy is "along it"
  const px = -uy, py = ux
  const out: { x: number; y: number }[] = []
  if (kind === 'line') {
    // one rank across, folding into a second once it would be absurdly wide
    const perRank = Math.min(n, LINE_MAX)
    const ranks = Math.ceil(n / perRank)
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / perRank)
      const inRank = Math.min(perRank, n - r * perRank)
      const k = i % perRank - (inRank - 1) / 2
      out.push({ x: x + px * k * S - ux * r * S, y: y + py * k * S - uy * r * S })
    }
    return out
  }
  // a bunch: as square a block as the numbers allow, centred on the target
  const cols = Math.max(1, Math.round(Math.sqrt(n)))
  const rows = Math.ceil(n / cols)
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols)
    const inRow = Math.min(cols, n - r * cols)
    const kx = c - (inRow - 1) / 2
    const ky = r - (rows - 1) / 2
    out.push({ x: x + px * kx * S - ux * ky * S, y: y + py * kx * S - uy * ky * S })
  }
  return out
}

export function commandMove(g: Game, units: Ent[], x: number, y: number): void {
  const n = units.length
  if (n === 1) {
    const u = units[0]
    u.state = isUnit(u) ? 'move' : u.state
    u.tx = x; u.ty = y
    u.targetId = undefined
    u.resume = null
    return
  }
  // face the way the company is actually going, from where it stands now
  let cx = 0, cy = 0
  for (const u of units) { cx += u.x; cy += u.y }
  cx /= n; cy /= n
  const dx = x - cx, dy = y - cy
  const d = len(dx, dy) || 1
  const ux = dx / d, uy = dy / d

  const slots = formationSlots(n, x, y, ux, uy, formationOf(g, units))
  // Hand out the slots nearest-first so the company keeps its shape on the way
  // over instead of crossing through itself. Numbers here are tiny, so the
  // obvious greedy pass is plenty.
  const left = units.slice()
  for (const slot of slots) {
    let bi = 0, bd = Infinity
    for (let i = 0; i < left.length; i++) {
      const dd = (left[i].x - slot.x) ** 2 + (left[i].y - slot.y) ** 2
      if (dd < bd) { bd = dd; bi = i }
    }
    const u = left.splice(bi, 1)[0]
    u.state = isUnit(u) ? 'move' : u.state
    u.tx = slot.x
    u.ty = slot.y
    u.targetId = undefined
    u.resume = null
  }
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
  if ((b.age ?? 1) > g.age[g.me]) { toast(g, `Reach the ${AGE_NAMES[b.age ?? 1]} first!`); return false }
  const lm = LANDMARKS[kind as LandmarkKind]
  if (lm) {
    if (lm.civ !== g.civs[g.me]) { toast(g, 'That landmark belongs to another banner.'); return false }
    if (g.age[g.me] >= lm.toAge) { toast(g, `The ${AGE_NAMES[lm.toAge]} is already yours.`); return false }
    if (lm.toAge !== g.age[g.me] + 1) { toast(g, `Reach the ${AGE_NAMES[lm.toAge - 1]} first!`); return false }
    if (g.ents.some(e => e.team === g.me && LANDMARKS[e.kind as LandmarkKind]?.toAge === lm.toAge)) {
      toast(g, 'A landmark is already rising.')
      return false
    }
  }
  if (kind === 'wall') return tryPlaceWall(g)
  if (!canAfford(g, g.me, b.cost)) { toast(g, `Not enough resources for a ${b.name}.`); return false }
  if (!canPlaceAt(g, kind, x, y)) { toast(g, "Can't build there — the ground is blocked."); return false }
  let villagers = selectedEnts(g).filter(e => e.kind === 'villager' && e.team === g.me)
  if (!villagers.length && lm) {
    // landmarks are begun from the Town Hall — round up the nearest spare hands
    villagers = g.ents
      .filter(e => e.team === g.me && e.kind === 'villager' && !e.hidden && e.state !== 'build')
      .sort((a, b2) => dist(a.x, a.y, x, y) - dist(b2.x, b2.y, x, y))
      .slice(0, 2)
  }
  if (!villagers.length) { toast(g, 'Select a villager first.'); return false }
  pay(g, g.me, b.cost)
  clearSpent(g, kind, x, y) // sweep away the stumps and rubble underneath
  const site = spawn(g, kind, 0, x, y, false)
  if (kind === 'gate') {
    site.angle = g.placeAngle
    // the gate is set INTO the fence: the posts it swallows come down, and
    // their timber goes back in the pile
    for (const post of wallsUnderGate(g, x, y)) {
      g.res[g.me].wood += BUILDINGS.wall.cost.wood
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
  const villagers = selectedEnts(g).filter(e => e.kind === 'villager' && e.team === g.me)
  if (!villagers.length) { toast(g, 'Select a villager first.'); return false }
  const pts = wallLinePoints(g).filter(p => p.ok)
  if (!pts.length) { toast(g, "Can't build there — the ground is blocked."); return false }
  let placed = 0
  let first: Ent | null = null
  for (const p of pts) {
    if (!canAfford(g, g.me, b.cost)) break
    if (!canPlaceAt(g, 'wall', p.x, p.y)) continue // earlier posts may crowd a later spot
    pay(g, g.me, b.cost)
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

  // planting a muster flag: one tap on the grass sets it and the mode is done
  if (g.mustering !== null) {
    plantMuster(g, g.mustering, x, y)
    return
  }

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
  if (isDouble && hit && hit.team === g.me && isUnit(hit)) {
    const crew = g.ents.filter(e =>
      e.team === g.me && e.kind === hit.kind && !e.hidden &&
      dist(e.x, e.y, hit.x, hit.y) < GROUP_RADIUS)
    g.selection = crew.map(e => e.id)
    g.uiDirty = true
    return
  }

  const sel = selectedEnts(g)
  const myUnits = sel.filter(e => isUnit(e) && e.team === g.me)

  // villagers tap an unfinished building: lend a hand instead of selecting it
  if (hit && hit.team === g.me && isBuilding(hit) && hit.complete === false) {
    const villagers = myUnits.filter(e => e.kind === 'villager')
    if (villagers.length) {
      commandBuild(g, villagers, hit)
      return
    }
  }

  // villagers tap one of your farms: one works this field, the rest spread
  // to free farms nearby — every field wants exactly one pair of hands
  if (hit && hit.team === g.me && hit.kind === 'farm' && hit.complete) {
    const villagers = myUnits.filter(e => e.kind === 'villager')
    if (villagers.length) {
      const fields = [hit, ...g.ents
        .filter(o => o !== hit && o.kind === 'farm' && o.team === g.me && !!o.complete)
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
  if (hit && hit.team === g.me && isBuilding(hit) && hit.complete && hit.hp < hit.maxHp) {
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
  if (hit && hit.team === g.me && (hit.kind === 'church' || hit.kind === 'ministry') && hit.complete) {
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
  if (hit && hit.team === g.me && (hit.kind === 'watchtower' || hit.kind === 'whitekeep' || hit.kind === 'redpalace') && hit.complete && myUnits.length) {
    for (const u of myUnits) {
      u.state = 'garrison'
      u.targetId = hit.id
    }
    return
  }

  if (hit && hit.team === g.me) {
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
    const farm = nearest(g, v.x, v.y, o => o.kind === 'farm' && o.team === g.me && !!o.complete && !farmTaken(g, o, v))
    if (farm && (!raw || dist(v.x, v.y, farm.x, farm.y) < dist(v.x, v.y, raw.x, raw.y))) return farm
  }
  return raw
}

// HUD pill tap: put one more villager on this resource — idle hands first,
// then borrow from whichever other line has the most workers
export function sendVillagerToResource(g: Game, res: ResKind): void {
  const vills = g.ents.filter(e => e.team === g.me && e.kind === 'villager' && !e.hidden)
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
    e.team === g.me && e.kind === 'villager' && !e.hidden && e.state === 'idle')
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
  const troop = g.ents.filter(e => e.team === g.me && e.kind === kind && !e.hidden &&
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
    e.team === g.me && isUnit(e) && !e.hidden && e.banner === banner && e.relicId === undefined)
  g.placing = null // selection is changing hands; drop any pending placement
  g.placePos = null
  g.placeEnd = null
  g.selection = host.map(e => e.id)
  g.uiDirty = true
  if (!host.length) {
    toast(g, banner === LION_BANNER && g.banners[g.me] === 1
      ? 'No soldiers yet — build a Barracks and train some!'
      : `${BANNERS[banner].name} has no one under it yet.`)
  }
}

// the army shield: muster the whole of whichever banner is currently active
export function selectArmy(g: Game, canvas?: HTMLCanvasElement): void {
  selectBanner(g, g.activeBanner, canvas)
}

// swear a selection to a banner (or, for monks alone, release them from one)
function assignBanner(g: Game, units: Ent[], banner: number | null): void {
  let n = 0
  for (const u of units) {
    if (!canBanner(u) || u.team !== g.me) continue
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

// ---- muster points: where a company gathers once it is raised ----
// A flag on the grass, one per banner. Recruits walk to it the moment they
// step out of the hall, so a company forms up where you want it rather than
// milling about the door.
export function beginMuster(g: Game, banner: number): void {
  g.mustering = banner
  g.placing = null
  g.placePos = null
  g.placeEnd = null
  toast(g, `Tap the ground where ${BANNERS[banner].name} should muster.`)
  g.uiDirty = true
}

export function cancelMuster(g: Game): void {
  g.mustering = null
  g.uiDirty = true
}

export function plantMuster(g: Game, banner: number, x: number, y: number, team = g.me): void {
  const w = g.world
  g.muster[team][banner] = {
    x: Math.max(20, Math.min(w.w - 20, x)),
    y: Math.max(20, Math.min(w.h - 20, y)),
  }
  g.mustering = null
  cue(g, 'place', x, y)
  toast(g, `${BANNERS[banner].name} will muster here.`)
  g.uiDirty = true
}

export function clearMuster(g: Game, banner: number, team = g.me): void {
  g.muster[team][banner] = null
  g.mustering = null
  toast(g, `${BANNERS[banner].name} musters at its halls again.`)
  g.uiDirty = true
}

// raise the next banner in the roll and hand it whatever is selected
export function raiseBanner(g: Game, units: Ent[], team = g.me): void {
  if (g.banners[team] >= BANNER_MAX) { toast(g, 'Every banner is already flying.'); return }
  const banner = g.banners[team]++
  if (units.length) assignBanner(g, units, banner) // a hall may raise one with nobody yet
  g.activeBanner = banner
  toast(g, `${BANNERS[banner].name} rides out — the Lion no longer counts them.`)
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
      ps.pinchDist = len(b.x - a.x, b.y - a.y)
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
      const d = len(b.x - a.x, b.y - a.y)
      if (ps.pinchDist > 0) {
        const factor = d / ps.pinchDist
        g.camera.zoom = Math.max(0.4, Math.min(1.6, g.camera.zoom * factor))
      }
      ps.pinchDist = d
      clampCamera(g, canvas)
      return
    }

    if (!ps.panning && len(ev.clientX - ps.downX, ev.clientY - ps.downY) > 12) {
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
