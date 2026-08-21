// The enemy village: an AI that plays by the same rules as the player.
// It gathers, builds, banks food for the age-up, reads the player's army
// composition and trains counters, and attacks in growing pushes.
import {
  Game, Ent, Cost, ResKind, TechId, PatronId, UNITS, BUILDINGS, TECHS, PATRONS,
  SOURCE_OF, POP_MAX, AGE2_COST, AGE2_TIME,
  dist, isUnit, isBuilding,
} from './data'
import { spawn, nearest, pop, canAfford, canPlaceAt, pay, gatherResOf } from './world'

const THINK_EVERY = 0.8
const VILLAGER_GOAL = 9
// gatherer quotas, in priority order
const QUOTAS: [ResKind, number][] = [['food', 3], ['wood', 3], ['gold', 2]]

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

function tryPlace(g: Game, kind: 'house' | 'barracks' | 'farm' | 'mill' | 'blacksmith' | 'stable' | 'archeryrange', tc: Ent): Ent | null {
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
    e.team === 1 && (e.kind === 'swordsman' || e.kind === 'spearman' || e.kind === 'archer'))
  const p = pop(g, 1)
  const rax = g.ents.find(e => e.team === 1 && e.kind === 'barracks' && e.complete)
  const range = g.ents.find(e => e.team === 1 && e.kind === 'archeryrange' && e.complete)
  const intruder = nearest(g, tc.x, tc.y,
    o => o.team === 0 && (isUnit(o) || isBuilding(o)) && !o.hidden, 340)

  // once the village stands, food is banked for the age-up — training spends
  // only what's left over. Raids suspend the thrift: survival first.
  const reserving = g.age[1] === 1 && !g.ageRes[1] && !!rax && vills.length >= 6 && !intruder
  const foodReserve = reserving ? AGE2_COST.food : 0 // the trigger below fires the moment it's banked
  const canSpend = (cost: Cost) =>
    canAfford(g, 1, cost) && g.res[1].food - foodReserve >= cost.food

  // -- economy: keep villagers on quota, spare hands on wood --
  const counts: Record<ResKind, number> = { wood: 0, food: 0, gold: 0, stone: 0 }
  for (const v of vills) {
    const r = gatherResOf(g, v)
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
  // one gentle retask per think: pile onto food while banking the age-up,
  // drift back to the normal spread afterwards
  const wantFood = reserving ? 5 : 3
  const retask = (v: Ent | undefined, r: ResKind) => {
    const src = v && nearestSource(g, tc, r)
    if (v && src) { v.state = 'gather'; v.targetId = src.id; v.gatherT = 0 }
  }
  if (counts.food < wantFood) {
    retask(vills.find(v => { const r = gatherResOf(g, v); return r === 'gold' || r === 'wood' }), 'food')
  } else if (!reserving && counts.food > 3) {
    retask(vills.find(v => gatherResOf(g, v) === 'food'), counts.wood < 3 ? 'wood' : 'gold')
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
    } else if (g.age[1] >= 2 && g.res[1].wood > 220 &&
      !g.ents.some(e => e.team === 1 && e.kind === 'archeryrange')) {
      tryPlace(g, 'archeryrange', tc) // archers, for when spears crowd the meadow
    } else if (g.age[1] >= 2 && g.res[1].wood > 250 &&
      !g.ents.some(e => e.team === 1 && e.kind === 'blacksmith')) {
      tryPlace(g, 'blacksmith', tc) // and then a forge for its soldiers
    } else if (g.age[1] >= 2 && g.res[1].wood > 250 &&
      !g.ents.some(e => e.team === 1 && e.kind === 'stable')) {
      tryPlace(g, 'stable', tc) // a stable, so a fallen scout can be replaced
    }
  }

  // -- the march of progress: research the Feudal Age the moment it's banked --
  if (g.age[1] === 1 && !g.ageRes[1] && rax && vills.length >= 6 &&
    g.res[1].food >= AGE2_COST.food) {
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
  if ((tc.queue?.length ?? 0) === 0 && vills.length < VILLAGER_GOAL &&
    p.used + queuedUnits(g) < p.cap && canSpend(UNITS.villager.cost)) {
    pay(g, 1, UNITS.villager.cost)
    tc.queue!.push({ kind: 'villager', t: UNITS.villager.time, total: UNITS.villager.time })
  }
  // a village without eyes rides again: replace a fallen scout from the stable
  const stable = g.ents.find(e => e.team === 1 && e.kind === 'stable' && e.complete)
  if (stable && (stable.queue?.length ?? 0) === 0 &&
    !g.ents.some(e => e.team === 1 && e.kind === 'scout') &&
    p.used + queuedUnits(g) < p.cap && canSpend(UNITS.scout.cost)) {
    pay(g, 1, UNITS.scout.cost)
    stable.queue!.push({ kind: 'scout', t: UNITS.scout.time, total: UNITS.scout.time })
  }

  // read the player's army and lean into the counters
  const foe = { spear: 0, sword: 0, archer: 0, cav: 0 }
  for (const e of g.ents) {
    if (e.team !== 0) continue
    if (e.kind === 'spearman') foe.spear++
    else if (e.kind === 'swordsman') foe.sword++
    else if (e.kind === 'archer') foe.archer++
    else if (e.kind === 'scout' || e.kind === 'knight') foe.cav++
  }
  const pickTrainKind = (): 'spearman' | 'swordsman' | 'archer' | null => {
    const opts: { kind: 'spearman' | 'swordsman' | 'archer'; w: number }[] = []
    if (rax && (rax.queue?.length ?? 0) < 2 && canSpend(UNITS.spearman.cost)) {
      opts.push({ kind: 'spearman', w: 1 + 2 * foe.cav })
    }
    if (rax && (rax.queue?.length ?? 0) < 2 && g.age[1] >= 2 && canSpend(UNITS.swordsman.cost)) {
      opts.push({ kind: 'swordsman', w: 0.6 + 1.2 * (foe.archer + foe.sword) })
    }
    if (range && (range.queue?.length ?? 0) < 2 && g.age[1] >= 2 && canSpend(UNITS.archer.cost)) {
      opts.push({ kind: 'archer', w: 0.6 + 1.5 * foe.spear })
    }
    if (!opts.length) return null
    let roll = Math.random() * opts.reduce((s, o) => s + o.w, 0)
    for (const o of opts) { roll -= o.w; if (roll <= 0) return o.kind }
    return opts[opts.length - 1].kind
  }
  for (let i = 0; i < 2; i++) { // up to two recruits per think, across both halls
    if (p.used + queuedUnits(g) >= p.cap) break
    const kind = pickTrainKind()
    if (!kind) break
    const host = kind === 'archer' ? range! : rax!
    pay(g, 1, UNITS[kind].cost)
    host.queue!.push({ kind, t: UNITS[kind].time, total: UNITS[kind].time })
  }

  // -- war: defend the home meadow, push when the army is mustered --
  const idleSoldiers = soldiers.filter(s => s.state === 'idle')
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
