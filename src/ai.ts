// The enemy village: a simple AI that plays by the same rules as the player.
// It gathers with villagers, trains from real resources, builds houses,
// a barracks and farms, and attacks in growing pushes.
import {
  Game, Ent, ResKind, TechId, PatronId, UNITS, BUILDINGS, TECHS, PATRONS,
  SOURCE_OF, POP_MAX, AGE2_COST, AGE2_TIME,
  dist, isUnit, isBuilding,
} from './data'
import { spawn, nearest, pop, canAfford, canPlaceAt, pay } from './world'

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

function tryPlace(g: Game, kind: 'house' | 'barracks' | 'farm' | 'mill', tc: Ent): Ent | null {
  const b = BUILDINGS[kind]
  if (!canAfford(g, 1, b.cost)) return null
  for (let tries = 0; tries < 40; tries++) {
    const a = Math.random() * Math.PI * 2
    const d = tc.r + b.foot + 30 + Math.random() * 130
    const x = tc.x + Math.cos(a) * d
    const y = tc.y + Math.sin(a) * d
    if (!canPlaceAt(g, kind, x, y)) continue
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
  const soldiers = g.ents.filter(e =>
    e.team === 1 && (e.kind === 'swordsman' || e.kind === 'spearman'))
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
    const mill = g.ents.some(e => e.team === 1 && e.kind === 'mill')
    const farms = g.ents.filter(e => e.team === 1 && e.kind === 'farm').length
    const foodDry = !nearest(g, tc.x, tc.y, o => o.kind === 'berrybush' && (o.amount ?? 0) > 0, 700)
    if (p.cap - p.used - queuedUnits(g) < 2 && p.cap < POP_MAX) {
      tryPlace(g, 'house', tc)
    } else if (!barracks && vills.length >= 4) {
      tryPlace(g, 'barracks', tc)
    } else if (foodDry && farms < 3) {
      tryPlace(g, 'farm', tc)
    } else if (g.age[1] >= 2 && !mill && g.res[1].wood > 150) {
      tryPlace(g, 'mill', tc) // a feudal village wants its mill
    }
  }

  // -- the march of progress: research the Feudal Age when established --
  const rax = g.ents.find(e => e.team === 1 && e.kind === 'barracks' && e.complete)
  if (g.age[1] === 1 && !g.ageRes[1] && rax && vills.length >= 6 &&
    g.res[1].food >= AGE2_COST.food + UNITS.villager.cost.food) {
    pay(g, 1, AGE2_COST)
    const patrons = Object.keys(PATRONS) as PatronId[]
    g.patron[1] = patrons[Math.floor(Math.random() * patrons.length)] // the spirits call whom they will
    g.ageRes[1] = { t: AGE2_TIME, total: AGE2_TIME }
  }

  // -- in Feudal, pick up the techs the patron didn't grant, when flush --
  if (g.age[1] >= 2 && g.res[1].food > 350) {
    for (const id of Object.keys(TECHS) as TechId[]) {
      if (g.techs[1][id]) continue
      const spec = TECHS[id]
      const host = g.ents.find(e =>
        e.team === 1 && e.kind === spec.at && e.complete && !e.research)
      if (!host || !canAfford(g, 1, spec.cost)) continue
      pay(g, 1, spec.cost)
      host.research = { id, t: spec.time, total: spec.time }
      break // one indulgence per think
    }
  }

  // -- training --
  const room = p.used + queuedUnits(g) < p.cap
  if ((tc.queue?.length ?? 0) === 0 && vills.length < VILLAGER_GOAL && room &&
    canAfford(g, 1, UNITS.villager.cost)) {
    pay(g, 1, UNITS.villager.cost)
    tc.queue!.push({ kind: 'villager', t: UNITS.villager.time, total: UNITS.villager.time })
  }
  // with a grown village and a standing guard, food goes to the age-up instead of more spears
  const savingForAge = g.age[1] === 1 && !g.ageRes[1] && vills.length >= 6 && soldiers.length >= 4
  if (rax && !savingForAge && (rax.queue?.length ?? 0) < 2 && p.used + queuedUnits(g) < p.cap) {
    // Dark Age fields spearmen; Feudal mixes in swordsmen when gold allows
    const kind = (g.age[1] >= 2 && g.res[1].gold >= UNITS.swordsman.cost.gold &&
      Math.random() < 0.6) ? 'swordsman' : 'spearman'
    if (canAfford(g, 1, UNITS[kind].cost)) {
      pay(g, 1, UNITS[kind].cost)
      rax.queue!.push({ kind, t: UNITS[kind].time, total: UNITS[kind].time })
    }
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
