// The enemy village: an AI that plays by the same rules as the player.
// It gathers, builds, banks resources for its landmark age-ups, reads the
// player's army composition and trains counters, and attacks in growing pushes.
import {
  Game, Ent, Cost, ResKind, ChampId, TechId, LandmarkKind, UNITS, BUILDINGS, CHAMPS, TECHS, LANDMARKS,
  SOURCE_OF, POP_MAX, NO_COST, LEVY_SPEAR_COST, LEVY_SPEAR_TIME,
  SCHOOL_KNIGHT_COST, SCHOOL_KNIGHT_TIME,
  dist, isUnit, isBuilding,
} from './data'
import { spawn, nearest, pop, canAfford, canPlaceAt, pay, gatherResOf, farmTaken, unitAgeReq } from './world'

// how sharply the rival village plays, by chosen difficulty
const thinkFor = (g: Game) => (g.aiLevel === 'hard' ? 0.55 : g.aiLevel === 'easy' ? 1.15 : 0.8)
const attackCapFor = (g: Game) => (g.aiLevel === 'hard' ? 18 : g.aiLevel === 'easy' ? 8 : 14)
// a lean opening, then a deeper economy once the Feudal landmark stands
// (the pop cap of 50 leaves room for it)
const villagerGoalFor = (g: Game, age: number) => {
  const shift = g.aiLevel === 'hard' ? 2 : g.aiLevel === 'easy' ? -2 : 0
  return (age >= 2 ? 14 : 10) + shift
}
const farmCapFor = (age: number) => (age >= 2 ? 6 : 3)
// gatherer quotas, in priority order
const QUOTAS: [ResKind, number][] = [['food', 3], ['wood', 3], ['gold', 2]]

function nearestSource(g: Game, tc: Ent, r: ResKind): Ent | null {
  const kind = SOURCE_OF[r]
  const raw = nearest(g, tc.x, tc.y, o => o.kind === kind && (o.amount ?? 0) > 0, 800)
  if (raw || r !== 'food') return raw
  // berries gone: a free farm, or failing that a deer to run down
  return nearest(g, tc.x, tc.y, o => o.kind === 'farm' && o.team === 1 && !!o.complete &&
    !farmTaken(g, o), 800) ??
    nearest(g, tc.x, tc.y, o => o.kind === 'deer' && (o.amount ?? 0) > 0, 800)
}

function queuedUnits(g: Game): number {
  let n = 0
  for (const e of g.ents) if (e.team === 1 && e.queue) n += e.queue.length
  return n
}

type AIPlaceable = 'house' | 'barracks' | 'farm' | 'mill' | 'stable' | 'archeryrange' | 'church' | 'siegeworkshop' | LandmarkKind

function tryPlace(g: Game, kind: AIPlaceable, tc: Ent): Ent | null {
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

// which landmark the village is saving toward, if any: its own civ's eco or
// military road into Feudal (the map seed decides its temperament), always
// the eco hall into Castle — the AI quarries no stone, so the fortress
// landmarks stay the player's.
function nextLandmark(g: Game, tc: Ent): LandmarkKind | null {
  const french = g.civs[1] === 'french'
  if (g.age[1] === 1) {
    // the French lean hard into the cavalry road — that's rather the point
    if (french) return tc.seed % 3 === 0 ? 'chamberofcommerce' : 'cavalryschool'
    return tc.seed % 2 === 0 ? 'abbeymill' : 'kingsbarracks'
  }
  if (g.age[1] === 2) return french ? 'royalvineyard' : 'guildhall'
  return null
}

export function updateEnemyAI(g: Game, dt: number): void {
  if (!g.ai.enabled) return
  g.ai.thinkT -= dt
  if (g.ai.thinkT > 0) return
  g.ai.thinkT = thinkFor(g)

  const tc = g.ents.find(e => e.team === 1 && e.kind === 'towncenter' && e.complete)
  if (!tc) return
  const vills = g.ents.filter(e => e.team === 1 && e.kind === 'villager' && !e.hidden)
  const soldiers = g.ents.filter(e =>
    e.team === 1 && (e.kind === 'swordsman' || e.kind === 'spearman' || e.kind === 'archer' || e.kind === 'knight' ||
      e.kind === 'mangonel' || e.kind === 'trebuchet'))
  const p = pop(g, 1)
  const rax = g.ents.find(e =>
    e.team === 1 && (e.kind === 'barracks' || e.kind === 'kingsbarracks') && e.complete)
  const range = g.ents.find(e => e.team === 1 && e.kind === 'archeryrange' && e.complete)
  const stable = g.ents.find(e =>
    e.team === 1 && (e.kind === 'stable' || e.kind === 'cavalryschool') && e.complete)
  const intruder = nearest(g, tc.x, tc.y,
    o => o.team === 0 && (isUnit(o) || isBuilding(o)) && !o.hidden, 340)

  // once the village stands, the next landmark's price is banked — training
  // spends only what's left over. Raids suspend the thrift: survival first.
  const goal = nextLandmark(g, tc)
  const rising = g.ents.some(e =>
    e.team === 1 && !e.complete && !!LANDMARKS[e.kind as LandmarkKind])
  const reserving = !!goal && !rising && !!rax && vills.length >= 6 && !intruder
  const reserve: Cost = reserving ? BUILDINGS[goal!].cost : NO_COST
  const canSpend = (cost: Cost) =>
    canAfford(g, 1, cost) &&
    g.res[1].food - reserve.food >= cost.food &&
    g.res[1].wood - reserve.wood >= cost.wood &&
    g.res[1].gold - reserve.gold >= cost.gold

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
      // spare hands chase whatever the landmark bank is short of, else wood
      const short = reserving ?
        (g.res[1].food < reserve.food ? 'food' as ResKind :
          g.res[1].wood < reserve.wood ? 'wood' as ResKind :
          g.res[1].gold < reserve.gold ? 'gold' as ResKind : null) : null
      const src = (short && nearestSource(g, tc, short)) ??
        nearestSource(g, tc, 'wood') ?? nearestSource(g, tc, 'food')
      if (src) { v.state = 'gather'; v.targetId = src.id; v.gatherT = 0 }
    }
  }
  // one gentle retask per think: pile onto whatever the landmark still wants,
  // drift back to the normal spread afterwards
  const bankShort: ResKind | null = !reserving ? null :
    g.res[1].food < reserve.food ? 'food' :
    g.res[1].wood < reserve.wood ? 'wood' :
    g.res[1].gold < reserve.gold ? 'gold' : null
  const retask = (v: Ent | undefined, r: ResKind) => {
    const src = v && nearestSource(g, tc, r)
    if (v && src) { v.state = 'gather'; v.targetId = src.id; v.gatherT = 0 }
  }
  if (bankShort && counts[bankShort] < 7) {
    retask(vills.find(v => { const r = gatherResOf(g, v); return !!r && r !== bankShort }), bankShort)
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
    const barracks = g.ents.some(e => e.team === 1 && (e.kind === 'barracks' || e.kind === 'kingsbarracks'))
    const mill = g.ents.some(e => e.team === 1 && (e.kind === 'mill' || e.kind === 'abbeymill'))
    const farms = g.ents.filter(e => e.team === 1 && e.kind === 'farm').length
    const foodDry = !nearest(g, tc.x, tc.y, o => o.kind === 'berrybush' && (o.amount ?? 0) > 0, 700)
    if (p.cap - p.used - queuedUnits(g) < 2 && p.cap < POP_MAX) {
      tryPlace(g, 'house', tc)
    } else if (!barracks && vills.length >= 4) {
      tryPlace(g, 'barracks', tc)
    } else if (goal && reserving && canAfford(g, 1, BUILDINGS[goal].cost)) {
      tryPlace(g, goal, tc) // the landmark rises; its walls carry the new age
    } else if (foodDry && farms < farmCapFor(g.age[1])) {
      // more fields for the one-farmer rule — farms FEED the landmark bank,
      // and the cap bounds the timber they can ever drain
      tryPlace(g, 'farm', tc)
    } else if (g.age[1] >= 2 && !mill && g.res[1].wood > 150) {
      tryPlace(g, 'mill', tc) // a feudal village wants its mill
    } else if (g.civs[1] === 'french' && g.age[1] >= 2 && g.res[1].wood > 150 &&
      !g.ents.some(e => e.team === 1 && (e.kind === 'stable' || e.kind === 'cavalryschool'))) {
      tryPlace(g, 'stable', tc) // a French village without horses is no French village
    } else if (g.age[1] >= 2 && g.res[1].wood > 220 &&
      !g.ents.some(e => e.team === 1 && e.kind === 'archeryrange')) {
      tryPlace(g, 'archeryrange', tc) // archers, for when spears crowd the meadow
    } else if (g.age[1] >= 2 && g.res[1].wood > 250 &&
      !g.ents.some(e => e.team === 1 && (e.kind === 'stable' || e.kind === 'cavalryschool'))) {
      tryPlace(g, 'stable', tc) // a stable, so a fallen scout can be replaced
    } else if (g.age[1] >= 3 && g.res[1].wood > 260 && g.res[1].gold > 120 &&
      g.ents.some(e => e.kind === 'relic' && e.heldBy === undefined && e.shrineId === undefined) &&
      !g.ents.some(e => e.team === 1 && (e.kind === 'church' || e.kind === 'ministry'))) {
      tryPlace(g, 'church', tc) // a church, while relics still rest unclaimed
    } else if (g.age[1] >= 3 && g.res[1].wood > 330 &&
      !g.ents.some(e => e.team === 1 && e.kind === 'siegeworkshop')) {
      tryPlace(g, 'siegeworkshop', tc) // engines, for cracking walls and keeps
    }
  }

  // -- in Feudal and beyond, pick up the economy techs when flush --
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

  // -- in the Castle Age, swear in champions when the coffers run deep --
  if (g.age[1] >= 3 && g.res[1].food > 500 && g.res[1].gold > 250) {
    for (const id of Object.keys(CHAMPS) as ChampId[]) {
      if (g.champs[1][id]) continue
      const spec = CHAMPS[id]
      const host = g.ents.find(e =>
        e.team === 1 && spec.at.includes(e.kind) && e.complete && !e.research)
      if (!host || !canAfford(g, 1, spec.cost)) continue
      pay(g, 1, spec.cost)
      host.research = { id, t: spec.time, total: spec.time }
      break // one indulgence per think
    }
  }

  // -- the faith road: ordain a monk, and race for any relic left unclaimed --
  const church = g.ents.find(e => e.team === 1 && (e.kind === 'church' || e.kind === 'ministry') && e.complete)
  if (church) {
    const monks = g.ents.filter(e => e.team === 1 && e.kind === 'monk')
    const freeRelics = g.ents.filter(e =>
      e.kind === 'relic' && e.heldBy === undefined && e.shrineId === undefined)
    if ((church.queue?.length ?? 0) === 0 && monks.length < Math.min(2, freeRelics.length) &&
      p.used + queuedUnits(g) < p.cap && canSpend(UNITS.monk.cost)) {
      pay(g, 1, UNITS.monk.cost)
      church.queue!.push({ kind: 'monk', t: UNITS.monk.time, total: UNITS.monk.time })
    }
    for (const m of monks) {
      if (m.relicId !== undefined) {
        if (m.state !== 'enshrine') { m.state = 'enshrine'; m.targetId = church.id }
      } else if (m.state === 'idle' && freeRelics.length) {
        let best = freeRelics[0]
        for (const rl of freeRelics) {
          if (dist(m.x, m.y, rl.x, rl.y) < dist(m.x, m.y, best.x, best.y)) best = rl
        }
        m.state = 'fetchrelic'
        m.targetId = best.id
      }
    }
  }

  // -- training --
  // villagers ARE the economy: their training ignores the landmark bank
  // (the goal caps them, so the detour is small and pays for itself)
  if ((tc.queue?.length ?? 0) === 0 && vills.length < villagerGoalFor(g, g.age[1]) &&
    p.used + queuedUnits(g) < p.cap && canAfford(g, 1, UNITS.villager.cost)) {
    pay(g, 1, UNITS.villager.cost)
    tc.queue!.push({ kind: 'villager', t: UNITS.villager.time, total: UNITS.villager.time })
  }
  // the engines of war: a mangonel for the field, then a trebuchet for the walls
  const workshop = g.ents.find(e => e.team === 1 && e.kind === 'siegeworkshop' && e.complete)
  if (workshop && (workshop.queue?.length ?? 0) === 0) {
    const engines = soldiers.filter(s => s.kind === 'mangonel' || s.kind === 'trebuchet')
    const next = engines.some(s => s.kind === 'mangonel') ? 'trebuchet' as const : 'mangonel' as const
    if (engines.length < 2 && p.used + queuedUnits(g) < p.cap && canSpend(UNITS[next].cost)) {
      pay(g, 1, UNITS[next].cost)
      workshop.queue!.push({ kind: next, t: UNITS[next].time, total: UNITS[next].time })
    }
  }
  // a village without eyes rides again: replace a fallen scout from the stable
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
  type TrainKind = 'spearman' | 'swordsman' | 'archer' | 'knight'
  const levy = rax?.kind === 'kingsbarracks'
  const spearCost = levy ? LEVY_SPEAR_COST : UNITS.spearman.cost
  const french = g.civs[1] === 'french'
  const knightAge = unitAgeReq(g, 1, 'knight')
  const stableKnightCost = stable?.kind === 'cavalryschool' ? SCHOOL_KNIGHT_COST : UNITS.knight.cost
  const pickTrainKind = (): TrainKind | null => {
    // the French save their coppers for cavalry: with a horse hall standing,
    // don't fritter the food away on spears while a knight is nearly afforded
    if (french && stable && g.age[1] >= knightAge && !canSpend(stableKnightCost) &&
      g.res[1].food < stableKnightCost.food + 40) {
      return null
    }
    const opts: { kind: TrainKind; w: number }[] = []
    if (rax && (rax.queue?.length ?? 0) < 2 && canSpend(spearCost)) {
      opts.push({ kind: 'spearman', w: 1 + 2 * foe.cav })
    }
    if (rax && (rax.queue?.length ?? 0) < 2 && g.age[1] >= 2 && canSpend(UNITS.swordsman.cost)) {
      opts.push({ kind: 'swordsman', w: 0.6 + 1.2 * (foe.archer + foe.sword) })
    }
    if (range && (range.queue?.length ?? 0) < 2 && g.age[1] >= 2 && canSpend(UNITS.archer.cost)) {
      opts.push({ kind: 'archer', w: 0.6 + 1.5 * foe.spear })
    }
    if (stable && (stable.queue?.length ?? 0) < 2 && g.age[1] >= knightAge &&
      canSpend(stableKnightCost)) {
      // the French answer most questions with cavalry
      opts.push({ kind: 'knight', w: (french ? 2.4 : 0.8) + 1.2 * foe.archer })
    }
    if (!opts.length) return null
    let roll = Math.random() * opts.reduce((s, o) => s + o.w, 0)
    for (const o of opts) { roll -= o.w; if (roll <= 0) return o.kind }
    return opts[opts.length - 1].kind
  }
  for (let i = 0; i < 2; i++) { // up to two recruits per think, across the halls
    if (p.used + queuedUnits(g) >= p.cap) break
    const kind = pickTrainKind()
    if (!kind) break
    const host = kind === 'archer' ? range! : kind === 'knight' ? stable! : rax!
    const isLevy = kind === 'spearman' && host.kind === 'kingsbarracks'
    const isSchool = kind === 'knight' && host.kind === 'cavalryschool'
    pay(g, 1, isLevy ? LEVY_SPEAR_COST : isSchool ? SCHOOL_KNIGHT_COST : UNITS[kind].cost)
    const time = isLevy ? LEVY_SPEAR_TIME : isSchool ? SCHOOL_KNIGHT_TIME : UNITS[kind].time
    host.queue!.push({ kind, t: time, total: time })
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
    g.ai.attackSize = Math.min(attackCapFor(g), g.ai.attackSize + 2) // bolder every push
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
