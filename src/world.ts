// World creation and shared queries/helpers.
import {
  Game, Ent, Kind, Cost, ResKind, UNITS, BUILDINGS, RESOURCES, DROPOFFS,
  NO_TECHS, GATHER_TECH, GATHER_TECH_MULT, FOX_SPEED_MULT, FOX_LOS_BONUS,
  FORGED_DMG, FLETCH_DMG, IRONMAIL_HP, MELEE_KINDS, INFANTRY_KINDS,
  NEUTRAL, POP_MAX, FOG_CELL, PLACE_SNAP, WORLD_W, WORLD_H,
  dist, isUnit, isBuilding, isResource,
} from './data'

const RES_KINDS: ResKind[] = ['wood', 'food', 'gold', 'stone']

// Deterministic little RNG so the map is the same every run (tweakable later).
function mulberry(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function spawn(g: Game, kind: Kind, team: number, x: number, y: number, complete = true): Ent {
  const e: Ent = {
    id: g.nextId++, kind, team, x, y, r: 12, hp: 1, maxHp: 1,
    seed: Math.floor(Math.random() * 1e9),
  }
  if (isUnit(e)) {
    const s = UNITS[kind]
    e.r = s.r; e.hp = e.maxHp = s.hp
    if (INFANTRY_KINDS.includes(kind) && g.techs[team]?.ironmail) {
      e.hp = e.maxHp = s.hp + IRONMAIL_HP // mailed from the forge
    }
    e.state = 'idle'; e.cd = 0; e.gatherT = 0; e.scanT = Math.random() * 0.3
    e.carry = 0; e.face = team === 0 ? 1 : -1; e.phase = Math.random() * Math.PI * 2
    e.resume = null
  } else if (isBuilding(e)) {
    const s = BUILDINGS[kind]
    e.r = s.r
    e.complete = complete
    e.progress = complete ? 1 : 0
    e.maxHp = s.hp
    e.hp = complete ? s.hp : Math.max(1, s.hp * 0.1)
    e.queue = []
  } else {
    const s = RESOURCES[kind]
    e.r = s.r; e.amount = s.amount; e.hp = e.maxHp = 1
  }
  g.ents.push(e)
  g.byId.set(e.id, e)
  return e
}

export function createGame(): Game {
  const g: Game = {
    ents: [], byId: new Map(), nextId: 1, t: 0, speed: 1,
    res: [
      { wood: 100, food: 50, gold: 0, stone: 0 },
      { wood: 100, food: 50, gold: 0, stone: 0 }, // the enemy plays fair now
    ],
    camera: { x: 0, y: 0, zoom: 0.85 }, // starts close and cosy; pinch out for the wide view
    selection: [], placing: null, placePos: null, placeEnd: null, over: null, overT: 0,
    particles: [],
    projectiles: [],
    arrowsFired: 0,
    fog: (() => {
      const w = Math.ceil(WORLD_W / FOG_CELL)
      const h = Math.ceil(WORLD_H / FOG_CELL)
      return { w, h, explored: new Uint8Array(w * h), visible: new Uint8Array(w * h) }
    })(),
    visionT: 0,
    ai: { enabled: true, thinkT: 2, attackSize: 4, attacking: false },
    age: [1, 1],
    ageRes: [null, null],
    patron: [null, null],
    techs: [{ ...NO_TECHS }, { ...NO_TECHS }],
    toasts: [], started: false, uiDirty: true,
  }

  const rnd = mulberry(20260819)
  const placed: { x: number; y: number; r: number }[] = []
  const clear = (x: number, y: number, r: number) =>
    x > 60 && x < WORLD_W - 60 && y > 60 && y < WORLD_H - 60 &&
    placed.every(p => dist(x, y, p.x, p.y) > r + p.r + 14)
  const mark = (x: number, y: number, r: number) => placed.push({ x, y, r })

  // Bases
  const pTC = { x: 380, y: 950 }
  const eTC = { x: 1560, y: 320 }
  mark(pTC.x, pTC.y, 90); mark(eTC.x, eTC.y, 90)
  spawn(g, 'towncenter', 0, pTC.x, pTC.y)
  spawn(g, 'towncenter', 1, eTC.x, eTC.y)

  // Gold mines: one near each base, one contested in the middle
  for (const m of [{ x: 640, y: 1100 }, { x: 1300, y: 170 }, { x: 950, y: 620 }]) {
    spawn(g, 'goldmine', NEUTRAL, m.x, m.y); mark(m.x, m.y, 44)
  }

  // Stone quarries: one near each base plus a contested one
  for (const q of [{ x: 160, y: 1130 }, { x: 1780, y: 400 }, { x: 1060, y: 860 }]) {
    spawn(g, 'stonequarry', NEUTRAL, q.x, q.y); mark(q.x, q.y, 40)
  }

  // Berry patches: forageable food near each base and in the wilds
  const patches = [
    { x: 540, y: 870, n: 5 }, { x: 1420, y: 430, n: 5 },
    { x: 900, y: 1060, n: 4 }, { x: 620, y: 420, n: 4 },
  ]
  for (const patch of patches) {
    for (let i = 0; i < patch.n; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const a = rnd() * Math.PI * 2
        const d = rnd() * 70
        const x = patch.x + Math.cos(a) * d
        const y = patch.y + Math.sin(a) * d * 0.8
        if (clear(x, y, 16)) { spawn(g, 'berrybush', NEUTRAL, x, y); mark(x, y, 16); break }
      }
    }
  }

  // Forests: dense bands that act as natural barriers — units can't slip
  // between packed trunks, so the gaps between woods become the lanes of
  // the map (and prime ground for a palisade). Chopping carves paths.
  const groves = [
    // the player's home woods, west
    { x: 190, y: 720, n: 18, spread: 150 },
    { x: 300, y: 330, n: 12, spread: 120 },
    { x: 560, y: 700, n: 10, spread: 110 },
    // the enemy's home woods, east
    { x: 1730, y: 560, n: 18, spread: 150 },
    { x: 1560, y: 760, n: 14, spread: 130 },
    { x: 1380, y: 460, n: 10, spread: 110 },
    // north-central band — the gap east of it is the north lane
    { x: 760, y: 240, n: 16, spread: 150 },
    { x: 1010, y: 170, n: 12, spread: 120 },
    // south-central band — the gap west of it is the south lane
    { x: 1160, y: 980, n: 16, spread: 150 },
    { x: 940, y: 1130, n: 12, spread: 120 },
    // a scattered clump in the southwest wilds
    { x: 660, y: 1050, n: 6, spread: 90 },
  ]
  for (const grove of groves) {
    for (let i = 0; i < grove.n; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const a = rnd() * Math.PI * 2
        const d = rnd() * grove.spread
        const x = grove.x + Math.cos(a) * d
        const y = grove.y + Math.sin(a) * d * 0.8
        if (clear(x, y, 10)) { spawn(g, 'tree', NEUTRAL, x, y); mark(x, y, 10); break }
      }
    }
  }

  // Starting units
  spawn(g, 'villager', 0, pTC.x + 90, pTC.y + 40)
  spawn(g, 'villager', 0, pTC.x + 70, pTC.y - 60)
  spawn(g, 'villager', 0, pTC.x - 20, pTC.y + 90)
  spawn(g, 'scout', 0, pTC.x - 90, pTC.y - 50)
  // The enemy village starts with exactly the same hand
  spawn(g, 'villager', 1, eTC.x - 80, eTC.y - 60)
  spawn(g, 'villager', 1, eTC.x + 60, eTC.y + 80)
  spawn(g, 'villager', 1, eTC.x + 20, eTC.y - 90)
  spawn(g, 'scout', 1, eTC.x + 90, eTC.y + 40)

  g.camera.x = pTC.x + 80
  g.camera.y = pTC.y - 120
  updateVision(g) // the home meadow is visible before the first tick
  return g
}

// ---- Fog of war ----

export function fogIndex(g: Game, x: number, y: number): number {
  const cx = Math.max(0, Math.min(g.fog.w - 1, Math.floor(x / FOG_CELL)))
  const cy = Math.max(0, Math.min(g.fog.h - 1, Math.floor(y / FOG_CELL)))
  return cy * g.fog.w + cx
}

// ---- tech effects ----

// how fast a team's villagers pull from a source of this resource
export function gatherMult(g: Game, team: number, res: ResKind): number {
  return g.techs[team]?.[GATHER_TECH[res]] ? GATHER_TECH_MULT : 1
}

// which resource this villager is currently working (gathering or hauling)
export function gatherResOf(g: Game, v: Ent): ResKind | null {
  if (v.state !== 'gather' && v.state !== 'return') return null
  const t = v.targetId !== undefined ? g.byId.get(v.targetId) : undefined
  if (!t) return v.carryRes ?? null
  if (t.kind === 'farm') return 'food'
  if (isResource(t)) return RESOURCES[t.kind].gives
  return null
}

// blacksmith bonus damage for a unit kind
export function dmgBonusFor(g: Game, team: number, kind: Kind): number {
  const t = g.techs[team]
  if (!t) return 0
  if (kind === 'archer') return t.fletching ? FLETCH_DMG : 0
  if (MELEE_KINDS.includes(kind)) return t.forgedblades ? FORGED_DMG : 0
  return 0
}

// walking speed for a unit, with the Fox's blessing where it applies
export function unitSpeed(g: Game, e: Ent): number {
  const base = UNITS[e.kind].speed
  if ((e.kind === 'villager' || e.kind === 'scout') && g.techs[e.team]?.foxpaths) {
    return base * FOX_SPEED_MULT
  }
  return base
}

export function updateVision(g: Game): void {
  const { w, h, explored, visible } = g.fog
  visible.fill(0)
  const foxEyes = g.techs[0]?.foxpaths
  for (const e of g.ents) {
    if (e.team !== 0 || e.hidden) continue
    let los = 0
    if (isUnit(e)) {
      los = UNITS[e.kind].los
      if (foxEyes && (e.kind === 'villager' || e.kind === 'scout')) los += FOX_LOS_BONUS
    }
    else if (isBuilding(e)) los = e.complete ? BUILDINGS[e.kind].los : 100
    else continue
    const los2 = los * los
    const x0 = Math.max(0, Math.floor((e.x - los) / FOG_CELL))
    const x1 = Math.min(w - 1, Math.floor((e.x + los) / FOG_CELL))
    const y0 = Math.max(0, Math.floor((e.y - los) / FOG_CELL))
    const y1 = Math.min(h - 1, Math.floor((e.y + los) / FOG_CELL))
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const dx = cx * FOG_CELL + FOG_CELL / 2 - e.x
        const dy = cy * FOG_CELL + FOG_CELL / 2 - e.y
        if (dx * dx + dy * dy <= los2) visible[cy * w + cx] = 1
      }
    }
  }
  for (let i = 0; i < explored.length; i++) if (visible[i]) explored[i] = 1
}

// Enemy units exist for the player only in live vision; enemy buildings once seen.
export function isVisibleToPlayer(g: Game, e: Ent): boolean {
  if (e.team !== 1) return true
  const i = fogIndex(g, e.x, e.y)
  return isUnit(e) ? g.fog.visible[i] === 1 : g.fog.explored[i] === 1
}

// ---- Queries ----

export function pop(g: Game, team: number): { used: number; cap: number } {
  let used = 0, cap = 0
  for (const e of g.ents) {
    if (e.team !== team) continue
    if (isUnit(e)) used++
    else if (isBuilding(e) && e.complete) cap += BUILDINGS[e.kind].pop
    if (isBuilding(e) && e.queue) for (const q of e.queue) if (q.t < q.total) { } // queue doesn't reserve pop in v1
  }
  return { used, cap: Math.min(cap, POP_MAX) }
}

export function canAfford(g: Game, team: number, cost: Cost): boolean {
  const r = g.res[team]
  return RES_KINDS.every(k => r[k] >= cost[k])
}

export function pay(g: Game, team: number, cost: Cost): void {
  const r = g.res[team]
  for (const k of RES_KINDS) r[k] -= cost[k]
}

export function nearest(g: Game, x: number, y: number, pred: (e: Ent) => boolean, maxDist = Infinity): Ent | null {
  let best: Ent | null = null, bd = maxDist
  for (const e of g.ents) {
    if (!pred(e)) continue
    const d = dist(x, y, e.x, e.y) - e.r
    if (d < bd) { bd = d; best = e }
  }
  return best
}

export function nearestDropoff(g: Game, e: Ent): Ent | null {
  const accepted = DROPOFFS[e.carryRes ?? 'wood']
  return nearest(g, e.x, e.y, o =>
    accepted.includes(o.kind) && o.team === e.team && !!o.complete)
}

export function nearestEnemyUnit(g: Game, e: Ent, range: number): Ent | null {
  return nearest(g, e.x, e.y, o => isUnit(o) && !o.hidden && o.team >= 0 && o.team !== e.team, range)
}

export function nearestEnemyThing(g: Game, e: Ent, range: number): Ent | null {
  return nearest(g, e.x, e.y, o => (isUnit(o) || isBuilding(o)) && !o.hidden && o.team >= 0 && o.team !== e.team, range)
}

export function entAt(g: Game, x: number, y: number): Ent | null {
  // generous touch hit-test: nearest entity whose radius (+ slack) covers the tap
  let best: Ent | null = null, bd = Infinity
  for (const e of g.ents) {
    if (e.hidden) continue
    if (e.team === 1 && !isVisibleToPlayer(g, e)) continue // can't tap into the fog
    const slack = isUnit(e) ? 14 : 8
    const d = dist(x, y, e.x, e.y)
    if (d < e.r + slack && d < bd) { bd = d; best = e }
  }
  return best
}

export function ringBell(g: Game, tc: Ent): void {
  let called = 0
  for (const v of g.ents) {
    if (v.team !== tc.team || v.kind !== 'villager' || v.hidden) continue
    // remember what they were doing so the doors can send them back to work
    if ((v.state === 'gather' || v.state === 'return' || v.state === 'build') && v.targetId !== undefined) {
      v.job = { state: v.state === 'build' ? 'build' : 'gather', targetId: v.targetId }
    } else {
      v.job = null
    }
    v.state = 'garrison'
    v.targetId = tc.id
    called++
  }
  if (!called) toast(g, 'No villagers outside to call in.')
  g.uiDirty = true
}

// step back out and pick the old job up again, if it still exists
export function resumeJob(g: Game, v: Ent): void {
  const job = v.job
  v.job = null
  v.state = 'idle'
  v.targetId = undefined
  if (!job) return
  const t = g.byId.get(job.targetId)
  if (!t) return
  const stillThere = job.state === 'build'
    ? isBuilding(t) && (!t.complete || t.hp < t.maxHp)
    : (t.kind === 'farm' ? !!t.complete && t.team === v.team : (t.amount ?? 0) > 0)
  if (stillThere) {
    v.state = job.state
    v.targetId = job.targetId
    v.gatherT = 0
  }
}

export function openDoors(g: Game, b: Ent): void {
  for (const v of g.ents) {
    if (v.team !== b.team || !isUnit(v)) continue
    if (v.hidden && v.insideId === b.id) {
      v.hidden = false
      v.insideId = undefined
      const a = Math.random() * Math.PI * 2
      v.x = b.x + Math.cos(a) * (b.r + 18)
      v.y = b.y + Math.abs(Math.sin(a)) * (b.r * 0.7) + 14
      resumeJob(g, v)
    } else if (v.state === 'garrison' && v.targetId === b.id) {
      resumeJob(g, v)
    }
  }
  b.garrison = 0
  g.uiDirty = true
}

// is this spot open ground for a building of this kind? Buildings occupy
// square footprints so villages can be packed in tidy rows.
export function canPlaceAt(g: Game, kind: Kind, x: number, y: number): boolean {
  const f = BUILDINGS[kind].foot
  if (x - f < 40 || x + f > WORLD_W - 40 || y - f < 40 || y + f > WORLD_H - 40) return false
  const isPal = kind === 'wall' || kind === 'gate'
  for (const e of g.ents) {
    if (isUnit(e)) continue
    if (isBuilding(e)) {
      // square vs square, snug 6px seam — but palisade pieces overlap freely
      // so a dragged line reads as one solid fence, diagonals included
      const of = BUILDINGS[e.kind].foot
      const gap = isPal && (e.kind === 'wall' || e.kind === 'gate') ? -6 : 6
      if (Math.abs(x - e.x) < f + of + gap && Math.abs(y - e.y) < f + of + gap) return false
    } else {
      // square vs round resource: nearest point on the square to the circle
      const px = Math.max(x - f, Math.min(x + f, e.x))
      const py = Math.max(y - f, Math.min(y + f, e.y))
      if (dist(px, py, e.x, e.y) < e.r + 10) return false
    }
  }
  return true
}

// the run of posts a dragged wall line would place, flagged buildable or not.
// Posts sit evenly along the true line (no per-post grid snap), so diagonal
// fences run straight instead of stair-stepping.
export function wallLinePoints(g: Game): { x: number; y: number; ok: boolean }[] {
  if (!g.placePos || !g.placeEnd) return []
  const a = g.placePos, b = g.placeEnd
  const steps = Math.max(1, Math.round(dist(a.x, a.y, b.x, b.y) / PLACE_SNAP))
  const pts: { x: number; y: number; ok: boolean }[] = []
  for (let i = 0; i <= steps; i++) {
    const x = a.x + (b.x - a.x) * (i / steps)
    const y = a.y + (b.y - a.y) * (i / steps)
    pts.push({ x, y, ok: canPlaceAt(g, 'wall', x, y) })
  }
  return pts
}

export function toast(g: Game, text: string): void {
  const last = g.toasts[g.toasts.length - 1]
  if (last && last.text === text && g.t - last.t < 2.5) return
  g.toasts.push({ text, t: g.t })
  if (g.toasts.length > 3) g.toasts.shift()
  g.uiDirty = true
}
