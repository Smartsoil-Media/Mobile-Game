// The enemy village: a simple AI that plays by the same rules as the player.
// It gathers with villagers, trains from real resources, builds houses,
// a barracks and farms, and attacks in growing pushes.
import {
  Game, Ent, ResKind, UNITS, BUILDINGS, SOURCE_OF, POP_MAX, WORLD_W, WORLD_H,
  dist, isUnit, isBuilding,
} from './data'
import { spawn, nearest, pop, canAfford, pay } from './world'

const THINK_EVERY = 0.8
const VILLAGER_GOAL = 9
// gatherer quotas, in priority order
const QUOTAS: [ResKind, number][] = [['food', 3], ['wood', 3], ['gold', 2]]

function gatherRes(g: Game, v: Ent): ResKind | null {
  if (v.state !== 'gather' && v.state !== 'return') return null
  const t = v.targetId !== undefined ? g.byId.get(v.targetId) : undefined
  if (!t) return v.carryRes ?? null
  if (t.kind === 'farm') return 'food'
  if (t.kind === 'tree') return 'wood'
  if (t.kind === 'goldmine') return 'gold'
  if (t.kind === 'berrybush') return 'food'
  if (t.kind === 'stonequarry') return 'stone'
  return null
}

function nearestSource(g: Game, tc: Ent, r: ResKind): Ent | null {
  const kind = SOURCE_OF[r]
  const raw = nearest(g, tc.x, tc.y, o => o.kind === kind && (o.amount ?? 0) > 0, 800)
  if (raw || r !== 'food') return raw
  return nearest(g, tc.x, tc.y, o => o.kind === 'farm' && o.team === 1 && !!o.complete, 800)
}

function queuedUnits(g: Game): number {
  let n = 0
  for (const e of g.ents) if (e.team === 1 && e.queue) n += e.queue.length
  return n
}

function tryPlace(g: Game, kind: 'house' | 'barracks' | 'farm', tc: Ent): Ent | null {
  const b = BUILDINGS[kind]
  if (!canAfford(g, 1, b.cost)) return null
  for (let tries = 0; tries < 40; tries++) {
    const a = Math.random() * Math.PI * 2
    const d = tc.r + b.r + 24 + Math.random() * 130
    const x = tc.x + Math.cos(a) * d
    const y = tc.y + Math.sin(a) * d
    if (x < 80 || x > WORLD_W - 80 || y < 80 || y > WORLD_H - 80) continue
    let ok = true
    for (const e of g.ents) {
      if (isUnit(e)) continue
      if (dist(x, y, e.x, e.y) < b.r + e.r + 14) { ok = false; break }
    }
    if (!ok) continue
    pay(g, 1, b.cost)
    return spawn(g, kind, 1, x, y, false)
  }
  return null
}

export function updateEnemyAI(g: Game, dt: number): void {
  if (!g.ai.enabled) return
  g.ai.thinkT -= dt
  if (g.ai.thinkT > 0) return
  g.ai.thinkT = THINK_EVERY

  const tc = g.ents.find(e => e.team === 1 && e.kind === 'towncenter' && e.complete)
  if (!tc) return
  const vills = g.ents.filter(e => e.team === 1 && e.kind === 'villager' && !e.hidden)
  const soldiers = g.ents.filter(e => e.team === 1 && e.kind === 'swordsman')
  const p = pop(g, 1)

  // -- economy: keep villagers on quota, spare hands on wood --
  const counts: Record<ResKind, number> = { wood: 0, food: 0, gold: 0, stone: 0 }
  for (const v of vills) {
    const r = gatherRes(g, v)
    if (r) counts[r]++
  }
  for (const v of vills) {
    if (v.state !== 'idle') continue
    let assigned = false
    for (const [r, quota] of QUOTAS) {
      if (counts[r] >= quota) continue
      const src = nearestSource(g, tc, r)
      if (!src) continue
      v.state = 'gather'; v.targetId = src.id; v.gatherT = 0
      counts[r]++
      assigned = true
      break
    }
    if (!assigned) {
      const src = nearestSource(g, tc, 'wood') ?? nearestSource(g, tc, 'food')
      if (src) { v.state = 'gather'; v.targetId = src.id; v.gatherT = 0 }
    }
  }

  // -- construction: one project at a time --
  const sites = g.ents.filter(e => e.team === 1 && isBuilding(e) && !e.complete)
  if (sites.length) {
    if (!vills.some(v => v.state === 'build')) {
      const builder = nearest(g, sites[0].x, sites[0].y,
        o => o.team === 1 && o.kind === 'villager' && !o.hidden && o.state !== 'build')
      if (builder) { builder.state = 'build'; builder.targetId = sites[0].id }
    }
  } else {
    const barracks = g.ents.some(e => e.team === 1 && e.kind === 'barracks')
    const farms = g.ents.filter(e => e.team === 1 && e.kind === 'farm').length
    const foodDry = !nearest(g, tc.x, tc.y, o => o.kind === 'berrybush' && (o.amount ?? 0) > 0, 700)
    if (p.cap - p.used - queuedUnits(g) < 2 && p.cap < POP_MAX) {
      tryPlace(g, 'house', tc)
    } else if (!barracks && vills.length >= 4) {
      tryPlace(g, 'barracks', tc)
    } else if (foodDry && farms < 3) {
      tryPlace(g, 'farm', tc)
    }
  }

  // -- training --
  const room = p.used + queuedUnits(g) < p.cap
  if ((tc.queue?.length ?? 0) === 0 && vills.length < VILLAGER_GOAL && room &&
    canAfford(g, 1, UNITS.villager.cost)) {
    pay(g, 1, UNITS.villager.cost)
    tc.queue!.push({ kind: 'villager', t: UNITS.villager.time, total: UNITS.villager.time })
  }
  const rax = g.ents.find(e => e.team === 1 && e.kind === 'barracks' && e.complete)
  if (rax && (rax.queue?.length ?? 0) < 2 &&
    p.used + queuedUnits(g) < p.cap && canAfford(g, 1, UNITS.swordsman.cost)) {
    pay(g, 1, UNITS.swordsman.cost)
    rax.queue!.push({ kind: 'swordsman', t: UNITS.swordsman.time, total: UNITS.swordsman.time })
  }

  // -- war: defend the home meadow, push when the army is mustered --
  const idleSoldiers = soldiers.filter(s => s.state === 'idle')
  const intruder = nearest(g, tc.x, tc.y,
    o => o.team === 0 && (isUnit(o) || isBuilding(o)) && !o.hidden, 340)
  if (intruder) {
    for (const s of idleSoldiers) { s.state = 'attack'; s.targetId = intruder.id; s.resume = null }
    return
  }
  const fighting = soldiers.some(s => s.state === 'attack' || s.state === 'attackmove')
  if (g.ai.attacking && !fighting) {
    g.ai.attacking = false
    g.ai.attackSize = Math.min(10, g.ai.attackSize + 2) // bolder every push
  }
  if (!g.ai.attacking && idleSoldiers.length >= g.ai.attackSize) {
    const target = g.ents.find(e => e.team === 0 && e.kind === 'towncenter') ??
      g.ents.find(e => e.team === 0 && isBuilding(e)) ??
      g.ents.find(e => e.team === 0)
    if (target) {
      for (const s of idleSoldiers) {
        s.state = 'attackmove'
        s.tx = target.x + (Math.random() - 0.5) * 80
        s.ty = target.y + (Math.random() - 0.5) * 80
        s.resume = null
      }
      g.ai.attacking = true
    }
  }
}
