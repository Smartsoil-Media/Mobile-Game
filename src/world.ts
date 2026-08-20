// World creation and shared queries/helpers.
import {
  Game, Ent, Kind, Cost, UNITS, BUILDINGS, RESOURCES,
  NEUTRAL, POP_MAX, FIRST_WAVE_AT, GARRISON_CAP, WORLD_W, WORLD_H,
  dist, isUnit, isBuilding, isResource,
} from './data'

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
    res: [{ wood: 100, gold: 0 }, { wood: 9999, gold: 9999 }],
    camera: { x: 0, y: 0, zoom: 0.62 },
    selection: [], placing: null, over: null, overT: 0,
    particles: [],
    projectiles: [],
    arrowsFired: 0,
    wave: { at: FIRST_WAVE_AT, size: 2, count: 0, warned: false },
    toasts: [], hint: '', hintStage: 0, started: false, uiDirty: true,
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
  const eBarracks = spawn(g, 'barracks', 1, eTC.x - 150, eTC.y + 120)
  mark(eBarracks.x, eBarracks.y, 60)

  // Gold mines: one near each base, one contested in the middle
  for (const m of [{ x: 640, y: 1100 }, { x: 1300, y: 170 }, { x: 950, y: 620 }]) {
    spawn(g, 'goldmine', NEUTRAL, m.x, m.y); mark(m.x, m.y, 44)
  }

  // Tree groves: near each base plus scattered woods
  const groves = [
    { x: 190, y: 760, n: 9, spread: 130 },   // player woods
    { x: 560, y: 700, n: 5, spread: 100 },
    { x: 1700, y: 540, n: 9, spread: 130 },  // enemy woods
    { x: 1250, y: 420, n: 4, spread: 90 },
    { x: 800, y: 260, n: 6, spread: 120 },   // wilds
    { x: 1150, y: 950, n: 6, spread: 120 },
    { x: 420, y: 330, n: 5, spread: 110 },
  ]
  for (const grove of groves) {
    for (let i = 0; i < grove.n; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const a = rnd() * Math.PI * 2
        const d = rnd() * grove.spread
        const x = grove.x + Math.cos(a) * d
        const y = grove.y + Math.sin(a) * d * 0.8
        if (clear(x, y, 18)) { spawn(g, 'tree', NEUTRAL, x, y); mark(x, y, 18); break }
      }
    }
  }

  // Starting units
  spawn(g, 'villager', 0, pTC.x + 90, pTC.y + 40)
  spawn(g, 'villager', 0, pTC.x + 70, pTC.y - 60)
  spawn(g, 'villager', 0, pTC.x - 20, pTC.y + 90)
  // Enemy flavor villagers + guards
  spawn(g, 'villager', 1, eTC.x - 80, eTC.y - 60)
  spawn(g, 'villager', 1, eTC.x + 60, eTC.y + 80)
  spawn(g, 'swordsman', 1, eTC.x - 40, eTC.y + 200)
  spawn(g, 'swordsman', 1, eTC.x + 40, eTC.y + 190)
  spawn(g, 'swordsman', 1, eTC.x + 110, eTC.y + 120)

  g.camera.x = pTC.x + 80
  g.camera.y = pTC.y - 120
  return g
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
  return r.wood >= cost.wood && r.gold >= cost.gold
}

export function pay(g: Game, team: number, cost: Cost): void {
  g.res[team].wood -= cost.wood
  g.res[team].gold -= cost.gold
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
  return nearest(g, e.x, e.y, o => o.kind === 'towncenter' && o.team === e.team && !!o.complete)
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
    v.state = 'garrison'
    v.targetId = tc.id
    called++
  }
  if (called) toast(g, 'The bell rings! Villagers run for safety.')
  else toast(g, 'No villagers outside to call in.')
  g.uiDirty = true
}

export function openDoors(g: Game, tc: Ent): void {
  let released = 0
  for (const v of g.ents) {
    if (v.team !== tc.team || v.kind !== 'villager') continue
    if (v.hidden) {
      v.hidden = false
      const a = Math.random() * Math.PI * 2
      v.x = tc.x + Math.cos(a) * (tc.r + 18)
      v.y = tc.y + Math.abs(Math.sin(a)) * (tc.r * 0.7) + 14
      v.state = 'idle'
      v.targetId = undefined
      released++
    } else if (v.state === 'garrison') {
      v.state = 'idle'
      v.targetId = undefined
    }
  }
  tc.garrison = 0
  if (released) toast(g, 'The doors open — back to work!')
  g.uiDirty = true
}

export function toast(g: Game, text: string): void {
  const last = g.toasts[g.toasts.length - 1]
  if (last && last.text === text && g.t - last.t < 2.5) return
  g.toasts.push({ text, t: g.t })
  if (g.toasts.length > 3) g.toasts.shift()
  g.uiDirty = true
}
