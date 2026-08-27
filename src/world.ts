// World creation and shared queries/helpers.
import {
  Game, Ent, Kind, Cost, Pt, ResKind, ChampId, TechId, UNITS, BUILDINGS, RESOURCES, DROPOFFS,
  CHAMPS, NO_CHAMPS, NO_TECHS, DEER_HP, CROC_HP,
  NEUTRAL, POP_MAX, FOG_CELL, PLACE_SNAP, WORLD_W, WORLD_H, LION_BANNER,
  dist, isUnit, isBuilding, isResource, mustBanner, BANNER_MAX, Formation, rnd, rndInt, dcos, dsin, q,
} from './data'
import { inWater } from './nav'

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
    // even the cosmetic seed is rolled off the shared stream: it rides on the
    // entity, so a checksum that covers entities has to be able to trust it
    seed: rndInt(g, 1e9),
  }
  if (kind === 'crag') {
    // bare rock: pure terrain, sized by whoever raises it
    e.r = 40; e.hp = e.maxHp = 1
  } else if (kind === 'relic') {
    // a holy relic on its wayside plinth — only a monk may lift it
    e.r = 10; e.hp = e.maxHp = 1
  } else if (isUnit(e)) {
    const s = UNITS[kind]
    e.r = s.r; e.hp = e.maxHp = s.hp
    const champ = champOf(kind)
    if (champ && g.champs[team]?.[champ]) {
      e.hp = e.maxHp = s.hp + CHAMPS[champ].hp // born a champion
    }
    if (mustBanner(e)) e.banner = LION_BANNER // each side has its own Lion
    e.state = 'idle'; e.cd = 0; e.gatherT = 0; e.scanT = rnd(g) * 0.3
    e.carry = 0; e.face = team === 0 ? 1 : -1; e.phase = rnd(g) * Math.PI * 2
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
    if (kind === 'deer' || kind === 'croc') {
      // wildlife starts alive; brought down, it lingers as a quiet bundle
      e.hp = e.maxHp = kind === 'croc' ? CROC_HP : DEER_HP
      e.homeX = x; e.homeY = y
      e.scanT = rnd(g) * 3
      e.cd = 0
      e.face = rnd(g) < 0.5 ? -1 : 1
      e.phase = rnd(g) * Math.PI * 2
    }
  }
  g.ents.push(e)
  g.byId.set(e.id, e)
  if (kind === 'tree' || kind === 'crag' || isBuilding(e)) g.navDirty = true // terrain changed
  return e
}

// Build a game world. With no options this is the handcrafted classic meadow;
// pass a seed and the map is rolled fresh — four times the land, homes in
// opposite corners, and every village guaranteed its nearby berries, woods,
// gold and stone ("closish", never identical).
// Deal a whole new world into the game object everything else already holds a
// reference to. The menu picks a map after the bootstrap has run, so the world
// has to be replaced in place rather than handed back.
export function resetGame(g: Game, opts?: { seed?: number }): void {
  Object.assign(g, createGame(opts))
}

export function createGame(opts?: { seed?: number }): Game {
  const random = opts?.seed !== undefined
  const W = random ? WORLD_W * 2 : WORLD_W
  const H = random ? WORLD_H * 2 : WORLD_H
  const g: Game = {
    ents: [], byId: new Map(), nextId: 1, t: 0, speed: 1,
    res: [
      { wood: 100, food: 50, gold: 0, stone: 0 },
      { wood: 100, food: 50, gold: 0, stone: 0 }, // the enemy plays fair now
    ],
    // The tilted view swallows far more ground north-to-south than a top-down
    // one, so the old 0.85 fitted the whole map on a phone and left the camera
    // nothing to pan over. Sitting closer restores that headroom and gives the
    // rebuilt architecture room to actually read. Pinch out for the wide view.
    camera: { x: 0, y: 0, zoom: 1.3 },
    selection: [], placing: null, placePos: null, placeEnd: null, over: null, overT: 0,
    particles: [],
    projectiles: [],
    arrowsFired: 0,
    fog: [0, 1].map(() => {
      const w = Math.ceil(W / FOG_CELL)
      const h = Math.ceil(H / FOG_CELL)
      return { w, h, explored: new Uint8Array(w * h), visible: new Uint8Array(w * h) }
    }),
    visionT: 0,
    ai: { enabled: true, thinkT: 2, attackSize: 4, attacking: false },
    age: [1, 1],
    civs: ['english', 'french'], // the menu re-deals these before the first tick
    aiLevel: 'normal',
    champs: [{ ...NO_CHAMPS }, { ...NO_CHAMPS }],
    techs: [{ ...NO_TECHS }, { ...NO_TECHS }],
    world: { w: W, h: H },
    nav: null, navDirty: true, navWater: null,
    mapSeed: random ? ((opts!.seed! | 0) || 1) : 0,
    streams: [], fords: [],
    placeAngle: 0, toasts: [], pings: [], taps: [],
    // The simulation's stream, seeded off the map so a rematch on the same
    // ground still plays out differently — and so both players start level.
    rng: (random ? ((opts!.seed! | 0) || 1) : 20260819) ^ 0x5BF03635,
    me: 0,
    banners: [1, 1],
    formation: [0, 1].map(() => Array.from({ length: BANNER_MAX }, () => 'bunch' as Formation)),
    muster: [0, 1].map(() => Array.from({ length: BANNER_MAX }, () => null as Pt | null)),
    mustering: null,
    activeBanner: 0, infoMode: false, infoId: null, started: false, uiDirty: true, sfxQueue: [],
  }

  const rnd = mulberry(random ? ((opts!.seed! | 0) || 1) : 20260819)
  const placed: { x: number; y: number; r: number }[] = []
  const clear = (x: number, y: number, r: number) =>
    x > 60 && x < W - 60 && y > 60 && y < H - 60 &&
    !inWater(g, x, y, r + 10, true) && // nothing spawns in the water or on a ford
    placed.every(p => dist(x, y, p.x, p.y) > r + p.r + 14)
  const mark = (x: number, y: number, r: number) => placed.push({ x, y, r })

  // scatter n of a kind around a center; each settles on the first clear spot
  const patchAt = (cx: number, cy: number, kind: Kind, n: number, spread: number, r: number) => {
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const a = rnd() * Math.PI * 2
        const d = rnd() * spread
        const x = cx + Math.cos(a) * d
        const y = cy + Math.sin(a) * d * 0.8
        if (clear(x, y, r)) {
          spawn(g, kind, NEUTRAL, x, y)
          if (kind !== 'deer') mark(x, y, r)
          break
        }
      }
    }
  }

  let pTC = { x: 380, y: 950 }
  let eTC = { x: 1560, y: 320 }

  if (!random) {
    // ---- the classic meadow, exactly as always (the test suite lives here) ----
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
    for (const patch of [
      { x: 540, y: 870, n: 5 }, { x: 1420, y: 430, n: 5 },
      { x: 900, y: 1060, n: 4 }, { x: 620, y: 420, n: 4 },
    ]) patchAt(patch.x, patch.y, 'berrybush', patch.n, 70, 16)
    // Forests: dense bands that act as natural barriers — units can't slip
    // between packed trunks, so the gaps between woods become the lanes of
    // the map (and prime ground for a palisade). Chopping carves paths.
    for (const grove of [
      { x: 190, y: 720, n: 18, spread: 150 },
      { x: 300, y: 330, n: 12, spread: 120 },
      { x: 560, y: 700, n: 10, spread: 110 },
      { x: 1730, y: 560, n: 18, spread: 150 },
      { x: 1560, y: 760, n: 14, spread: 130 },
      { x: 1380, y: 460, n: 10, spread: 110 },
      { x: 760, y: 240, n: 16, spread: 150 },
      { x: 1010, y: 170, n: 12, spread: 120 },
      { x: 1160, y: 980, n: 16, spread: 150 },
      { x: 940, y: 1130, n: 12, spread: 120 },
      { x: 660, y: 1050, n: 6, spread: 90 },
    ]) patchAt(grove.x, grove.y, 'tree', grove.n, grove.spread, 10)
    // Deer herds: shy little families grazing the open pockets of the wilds
    for (const herd of [
      { x: 800, y: 300, n: 3 }, { x: 620, y: 180, n: 3 }, { x: 1420, y: 1100, n: 3 },
    ]) patchAt(herd.x, herd.y, 'deer', herd.n, 55, 12)
    // Holy relics rest on wayside plinths in the contested middle — fixed
    // spots, spawned last so the classic map's dice fall exactly as always
    for (const rl of [{ x: 860, y: 460 }, { x: 1140, y: 760 }, { x: 700, y: 950 }]) {
      spawn(g, 'relic', NEUTRAL, rl.x, rl.y); mark(rl.x, rl.y, 14)
    }
  } else {
    // ---- a fresh meadow: homes in opposite corners, kit guaranteed closish ----
    const jig = () => (rnd() - 0.5) * 0.06
    const m = 0.16 // how deep into the corner each village sits
    const diag = rnd() < 0.5 // which diagonal this match is fought across
    pTC = { x: (m + jig()) * W, y: ((diag ? 1 - m : m) + jig()) * H }
    eTC = { x: (1 - m + jig()) * W, y: ((diag ? m : 1 - m) + jig()) * H }
    mark(pTC.x, pTC.y, 90); mark(eTC.x, eTC.y, 90)
    spawn(g, 'towncenter', 0, pTC.x, pTC.y)
    spawn(g, 'towncenter', 1, eTC.x, eTC.y)

    // a stream winds down the middle of the land, crossable at three fords —
    // the villages sit far to either side, so the water shapes the war
    const streamW = 44 + rnd() * 14
    const baseX = (0.44 + rnd() * 0.12) * W
    const meander = (0.05 + rnd() * 0.04) * W
    const phase = rnd() * Math.PI * 2
    const wobble = 1.7 + rnd() * 1.2
    const pts: { x: number; y: number }[] = []
    const N = 30
    for (let i = 0; i <= N; i++) {
      const t = i / N
      pts.push({
        x: baseX + Math.sin(t * Math.PI * wobble + phase) * meander,
        y: t * H,
      })
    }
    g.streams.push({ pts, w: streamW })
    for (const ft of [0.2 + rnd() * 0.1, 0.47 + rnd() * 0.08, 0.74 + rnd() * 0.1]) {
      const i = Math.round(ft * N)
      g.fords.push({ x: pts[i].x, y: pts[i].y, r: 62 })
    }

    // crocodiles lurk along the water — two guard crossings, two roam the banks
    const streamPt = (t: number) => pts[Math.max(0, Math.min(N, Math.round(t * N)))]
    const crocSpots = [
      g.fords[0], g.fords[2],
      streamPt(0.32 + rnd() * 0.08), streamPt(0.58 + rnd() * 0.1),
    ]
    for (const c of crocSpots) {
      const a = rnd() * Math.PI * 2
      spawn(g, 'croc', NEUTRAL, c.x + Math.cos(a) * 24, c.y + Math.sin(a) * 18)
    }

    // rocky crags: impassable outcrops that break the meadow into ground
    // worth fighting over (and hide a knight or two behind)
    for (let i = 0; i < 7; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const x = 260 + rnd() * (W - 520)
        const y = 240 + rnd() * (H - 480)
        const r = 34 + rnd() * 22
        if (dist(x, y, pTC.x, pTC.y) < 520 || dist(x, y, eTC.x, eTC.y) < 520) continue
        if (!clear(x, y, r)) continue
        const crag = spawn(g, 'crag', NEUTRAL, x, y)
        crag.r = r
        mark(x, y, r)
        // a little sister rock beside the big one, when it fits
        if (rnd() < 0.6) {
          const a = rnd() * Math.PI * 2
          const s2r = 16 + rnd() * 8
          const sx = x + Math.cos(a) * (r + s2r + 20)
          const sy = y + Math.sin(a) * (r + s2r + 20) * 0.8
          if (clear(sx, sy, s2r)) {
            const s2 = spawn(g, 'crag', NEUTRAL, sx, sy)
            s2.r = s2r
            mark(sx, sy, s2r)
          }
        }
        break
      }
    }

    // a clear spot on a ring around a point — for each home's guaranteed kit
    const ring = (cx: number, cy: number, minD: number, maxD: number, r: number) => {
      for (let tries = 0; tries < 80; tries++) {
        const a = rnd() * Math.PI * 2
        const d = minD + rnd() * (maxD - minD)
        const x = cx + Math.cos(a) * d
        const y = cy + Math.sin(a) * d * 0.9
        if (clear(x, y, r)) return { x, y }
      }
      return null
    }
    for (const tc of [pTC, eTC]) {
      // berries, gold and stone claim their ground first — the woods are
      // generous and can settle around them
      const berries = ring(tc.x, tc.y, 150, 220, 20)
      if (berries) patchAt(berries.x, berries.y, 'berrybush', 6, 90, 16)
      const gold = ring(tc.x, tc.y, 240, 340, 44)
      if (gold) { spawn(g, 'goldmine', NEUTRAL, gold.x, gold.y); mark(gold.x, gold.y, 44) }
      const stone = ring(tc.x, tc.y, 260, 400, 40)
      if (stone) { spawn(g, 'stonequarry', NEUTRAL, stone.x, stone.y); mark(stone.x, stone.y, 40) }
      const wood1 = ring(tc.x, tc.y, 210, 330, 30)
      if (wood1) patchAt(wood1.x, wood1.y, 'tree', 12, 120, 10)
      const wood2 = ring(tc.x, tc.y, 240, 380, 30)
      if (wood2) patchAt(wood2.x, wood2.y, 'tree', 9, 100, 10)
    }

    // and the wilds: contested riches and rambling woods across the wider land
    const anySpot = (margin: number, r: number) => {
      for (let tries = 0; tries < 80; tries++) {
        const x = margin + rnd() * (W - margin * 2)
        const y = margin + rnd() * (H - margin * 2)
        if (clear(x, y, r)) return { x, y }
      }
      return null
    }
    for (let i = 0; i < 7; i++) {
      const s = anySpot(260, 44)
      if (s) { spawn(g, 'goldmine', NEUTRAL, s.x, s.y); mark(s.x, s.y, 44) }
    }
    for (let i = 0; i < 7; i++) {
      const s = anySpot(260, 40)
      if (s) { spawn(g, 'stonequarry', NEUTRAL, s.x, s.y); mark(s.x, s.y, 40) }
    }
    for (let i = 0; i < 9; i++) {
      const s = anySpot(220, 20)
      if (s) patchAt(s.x, s.y, 'berrybush', 4, 70, 16)
    }
    for (let i = 0; i < 34; i++) {
      const s = anySpot(180, 30)
      if (s) patchAt(s.x, s.y, 'tree', 9 + Math.floor(rnd() * 10), 100 + rnd() * 70, 10)
    }
    for (let i = 0; i < 7; i++) {
      const s = anySpot(300, 14)
      if (s) patchAt(s.x, s.y, 'deer', 3, 55, 12)
    }
    // holy relics rest in the wilds, well away from either home — worth a
    // monk's pilgrimage once the Castle Age dawns
    for (let i = 0; i < 5; i++) {
      for (let tries = 0; tries < 60; tries++) {
        const x = 300 + rnd() * (W - 600)
        const y = 260 + rnd() * (H - 520)
        if (dist(x, y, pTC.x, pTC.y) < 600 || dist(x, y, eTC.x, eTC.y) < 600) continue
        if (!clear(x, y, 16)) continue
        spawn(g, 'relic', NEUTRAL, x, y)
        mark(x, y, 16)
        break
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

// how fast this team's villagers work a resource, with techs folded in
export function gatherRate(g: Game, team: number, res: ResKind): number {
  const t = g.techs[team]
  if (!t) return 1
  if (res === 'wood' && t.steelaxes) return 1.2
  if (res === 'food' && t.wheelbarrow) return 1.2
  if ((res === 'gold' || res === 'stone') && t.minerspicks) return 1.2
  return 1
}

// ---- Fog of war ----

// The grid is the same shape for both teams, so one index serves either fog.
export function fogIndex(g: Game, x: number, y: number): number {
  const f = g.fog[0]
  const cx = Math.max(0, Math.min(f.w - 1, Math.floor(x / FOG_CELL)))
  const cy = Math.max(0, Math.min(f.h - 1, Math.floor(y / FOG_CELL)))
  return cy * f.w + cx
}

// ---- champion effects ----

// which champion line (if any) a unit kind belongs to
export function champOf(kind: Kind): ChampId | null {
  for (const id of Object.keys(CHAMPS) as ChampId[]) {
    if (CHAMPS[id].kinds.includes(kind)) return id
  }
  return null
}

// bonus damage a team's unit kind carries from its champion upgrade
export function champDmg(g: Game, team: number, kind: Kind): number {
  const id = champOf(kind)
  return id && g.champs[team]?.[id] ? CHAMPS[id].dmg : 0
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

// is anyone (besides `except`) already working this farm? One pair of hands
// per field keeps farms honest.
export function farmTaken(g: Game, farm: Ent, except?: Ent | Ent[]): boolean {
  const skip = Array.isArray(except) ? except : except ? [except] : []
  return g.ents.some(w => w.kind === 'villager' && w.team === farm.team && !skip.includes(w) &&
    (w.state === 'gather' || w.state === 'return') && w.targetId === farm.id)
}

// walking speed for a unit (a hook for future civ or upgrade effects)
export function unitSpeed(g: Game, e: Ent): number {
  return UNITS[e.kind].speed
}

// which age a team needs before training this unit — civs bend the rules:
// French chivalry puts knights in the saddle a whole age early
export function unitAgeReq(g: Game, team: number, kind: Kind): number {
  const base = UNITS[kind]?.age ?? 1
  if (kind === 'knight' && g.civs[team] === 'french') return Math.min(base, 2)
  return base
}

// Both villages keep their own book of what they have seen. In a solo game the
// rival's copy is never looked at; in a 1v1 it is the other player's whole view,
// and it has to be kept honestly or the two screens disagree about the dark.
export function updateVision(g: Game): void {
  for (let team = 0; team < g.fog.length; team++) updateTeamVision(g, team)
}

function updateTeamVision(g: Game, team: number): void {
  const { w, h, explored, visible } = g.fog[team]
  visible.fill(0)
  for (const e of g.ents) {
    if (e.team !== team || e.hidden) continue
    let los = 0
    if (isUnit(e)) los = UNITS[e.kind].los
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

// The other village's units exist for you only in live vision; its buildings
// once you have seen them. "The other village" is whoever you are not.
export function isVisibleToPlayer(g: Game, e: Ent): boolean {
  if (e.team === g.me || e.team === NEUTRAL) return true
  const f = g.fog[g.me]
  const i = fogIndex(g, e.x, e.y)
  return isUnit(e) ? f.visible[i] === 1 : f.explored[i] === 1
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
    if (e.kind === 'crag') continue // terrain, not a thing to select
    if (e.team !== g.me && e.team !== NEUTRAL && !isVisibleToPlayer(g, e)) continue // can't tap into the fog
    if ((e.kind === 'deer' || e.kind === 'croc') && g.fog[g.me].visible[fogIndex(g, e.x, e.y)] !== 1) continue // wildlife slips out of sight
    if (e.kind === 'relic' && (e.heldBy !== undefined || e.shrineId !== undefined ||
      g.fog[g.me].explored[fogIndex(g, e.x, e.y)] !== 1)) continue // a relic must be found, and free, to tap
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
      const a = rnd(g) * Math.PI * 2
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
// A worked-out resource is just litter on the grass: a stump, a picked bush,
// a heap of rubble, a carcass. None of it should keep you from building there.
export function isSpent(e: Ent): boolean {
  if (e.kind === 'tree' || e.kind === 'berrybush' || e.kind === 'goldmine' || e.kind === 'stonequarry') {
    return (e.amount ?? 0) <= 0
  }
  if (e.kind === 'deer' || e.kind === 'croc') return e.hp <= 0
  return false
}

// clear the litter under a new building's footprint, so nothing pokes through
export function clearSpent(g: Game, kind: Kind, x: number, y: number): void {
  const f = BUILDINGS[kind].foot
  for (const e of [...g.ents]) {
    if (!isSpent(e)) continue
    const px = Math.max(x - f, Math.min(x + f, e.x))
    const py = Math.max(y - f, Math.min(y + f, e.y))
    if (dist(px, py, e.x, e.y) >= e.r + 4) continue
    const i = g.ents.indexOf(e)
    if (i >= 0) g.ents.splice(i, 1)
    g.byId.delete(e.id)
  }
}

export function canPlaceAt(g: Game, kind: Kind, x: number, y: number, ents: Ent[] = g.ents): boolean {
  const f = BUILDINGS[kind].foot
  if (x - f < 40 || x + f > g.world.w - 40 || y - f < 40 || y + f > g.world.h - 40) return false
  if (inWater(g, x, y, f + 6, true)) return false // no building in the water — or damming a ford
  const isPal = kind === 'wall' || kind === 'gate'
  for (const e of ents) {
    if (isUnit(e)) continue
    if (isSpent(e)) continue // stumps, picked bushes, rubble and carcasses yield the ground
    if (isBuilding(e)) {
      // a gate is set INTO a fence: it may sit right on top of the posts it is
      // about to swallow (see wallsUnderGate), whatever slant the run is at
      if (kind === 'gate' && e.kind === 'wall') continue
      const of = BUILDINGS[e.kind].foot
      // tile-aligned footprints may touch exactly; palisade pieces still overlap
      // so a dragged line reads as one solid fence
      const gap = isPal && (e.kind === 'wall' || e.kind === 'gate') ? -6 : 0
      if (Math.abs(x - e.x) < f + of + gap && Math.abs(y - e.y) < f + of + gap) return false
    } else {
      // a carried or enshrined relic travels with its keeper — no ground claim
      if (e.kind === 'relic' && (e.heldBy !== undefined || e.shrineId !== undefined)) continue
      // square vs round resource: nearest point on the square to the circle
      const px = Math.max(x - f, Math.min(x + f, e.x))
      const py = Math.max(y - f, Math.min(y + f, e.y))
      if (dist(px, py, e.x, e.y) < e.r + 10) return false
    }
  }
  return true
}

// The cells around a spot, each flagged buildable — this is what the build
// grid shades in. The entity list is filtered down to the neighbourhood once
// rather than per cell, so a 13x13 block costs almost nothing.
export function placementCells(
  g: Game, kind: Kind, cx: number, cy: number, radius: number,
): { x: number; y: number; ok: boolean }[] {
  const f = BUILDINGS[kind].foot
  const reach = radius * PLACE_SNAP + f + 90
  const near = g.ents.filter(e =>
    !isUnit(e) && Math.abs(e.x - cx) < reach && Math.abs(e.y - cy) < reach)
  const out: { x: number; y: number; ok: boolean }[] = []
  for (let iy = -radius; iy <= radius; iy++) {
    for (let ix = -radius; ix <= radius; ix++) {
      const x = cx + ix * PLACE_SNAP
      const y = cy + iy * PLACE_SNAP
      out.push({ x, y, ok: canPlaceAt(g, kind, x, y, near) })
    }
  }
  return out
}

// A gate belongs IN a fence, whatever slant the fence runs at. Fitting a line
// through every post nearby goes wrong the moment two fences meet: at a corner
// or a T it averages the two arms into a diagonal that matches neither, and two
// parallel runs pull it into the gap between them. So instead we follow ONE
// run: take the post nearest the thumb, read the direction to its nearest
// neighbour (posts sit ~one tile apart along a run, so that IS the run's
// heading), then keep only the posts lying along that same line. The gate is
// placed where the thumb points along the run, clamped to the run's own ends so
// it can never drift off into open grass.
export const GATE_SNAP_REACH = 70
const RUN_SPREAD = 13 // how far off the line a post may sit and still count
export function gateSnap(g: Game, x: number, y: number): { x: number; y: number; angle: number } | null {
  const posts = g.ents.filter(e => e.kind === 'wall' && e.team === 0)
  let near: Ent | null = null
  for (const p of posts) {
    if (dist(p.x, p.y, x, y) > GATE_SNAP_REACH) continue
    if (!near || dist(p.x, p.y, x, y) < dist(near.x, near.y, x, y)) near = p
  }
  if (!near) return null
  // the run's heading: straight at the closest post beside it
  let mate: Ent | null = null
  for (const p of posts) {
    if (p === near) continue
    if (dist(p.x, p.y, near.x, near.y) > 40) continue
    if (!mate || dist(p.x, p.y, near.x, near.y) < dist(mate.x, mate.y, near.x, near.y)) mate = p
  }
  if (!mate) return null // a lone post is no fence
  const len = dist(near.x, near.y, mate.x, mate.y) || 1
  const ux = (mate.x - near.x) / len, uy = (mate.y - near.y) / len
  // everything on THIS line — a crossing arm or a parallel fence sits too far off it
  let lo = 0, hi = 0
  for (const p of posts) {
    if (dist(p.x, p.y, near.x, near.y) > GATE_SNAP_REACH) continue
    const dx = p.x - near.x, dy = p.y - near.y
    if (Math.abs(dx * -uy + dy * ux) > RUN_SPREAD) continue
    const t = dx * ux + dy * uy
    lo = Math.min(lo, t); hi = Math.max(hi, t)
  }
  // where the thumb points along the run, but never off the end of it
  const want = (x - near.x) * ux + (y - near.y) * uy
  const t = Math.max(lo, Math.min(hi, want))
  // a gate is symmetric, so keep the heading in a half-turn: -90..90 reads
  // the same on screen and keeps the stored value predictable
  let angle = Math.atan2(uy, ux)
  if (angle > Math.PI / 2) angle -= Math.PI
  if (angle <= -Math.PI / 2) angle += Math.PI
  return { x: near.x + ux * t, y: near.y + uy * t, angle }
}

// the posts a gate would swallow as it is set into the fence
export function wallsUnderGate(g: Game, x: number, y: number): Ent[] {
  return g.ents.filter(e => e.kind === 'wall' && e.team === 0 && dist(e.x, e.y, x, y) < 22)
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
