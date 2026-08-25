// Fixed-timestep simulation: unit state machines, combat, economy, enemy AI.
import {
  Game, Ent, Particle, LandmarkKind, TechId, ChampId, ResKind, UNITS, BUILDINGS, RESOURCES, SOURCE_OF, DMG_BONUS,
  CHAMPS, TECHS, LANDMARKS, LANDMARK_TRICKLES, AGE_NAMES,
  KEEP_RANGE, KEEP_VOLLEY, KEEP_DMG, KEEP_BASE_ARROWS,
  DEER_STRIKE, DEER_AMBLE, DEER_FLEE,
  CROC_DMG, CROC_CD, CROC_AGGRO, CROC_LEASH, CROC_SPEED,
  RELIC_GOLD_RATE, RELIC_FOOD_RATE, MONK_HEAL_RATE, MONK_HEAL_RADIUS, MONK_HEAL_TICK,
  SANCTUARY_HEAL_RATE, SANCTUARY_HEAL_RADIUS,
  CARRY_CAP, GATHER_TICK, FARM_CYCLE, TC_RANGE, TC_VOLLEY, ARROW_DMG,
  TOWER_RANGE, TOWER_VOLLEY, TOWER_DMG, WORLD_W, WORLD_H,
  MANGONEL_SPLASH, MANGONEL_MIN_RANGE, MANGONEL_ARC, MANGONEL_BOULDER_SPEED,
  TREB_SETUP, TREB_SPLASH, TREB_ARC, TREB_BOULDER_SPEED,
  dist, isUnit, isBuilding, isResource, isSiege, mustBanner, cue,
} from './data'
import { spawn, nearest, nearestDropoff, nearestEnemyUnit, nearestEnemyThing, toast, updateVision, unitSpeed, champDmg, resumeJob, farmTaken, gatherRate } from './world'
import { lineClear, findPath, inWater, streamDist } from './nav'
import { updateEnemyAI } from './ai'

export function puff(g: Game, x: number, y: number, color: string, n = 4, kind: Particle['kind'] = 'puff'): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = kind === 'spark' ? 30 + Math.random() * 40 : 8 + Math.random() * 18
    g.particles.push({
      x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'puff' ? 14 : 6),
      life: 0, maxLife: kind === 'spark' ? 0.5 : 0.9 + Math.random() * 0.5,
      size: kind === 'spark' ? 2.5 : 5 + Math.random() * 4, color, kind,
    })
  }
}

function moveToward(g: Game, e: Ent, tx: number, ty: number, speed: number, dt: number): boolean {
  const dGoal = Math.hypot(tx - e.x, ty - e.y)
  if (dGoal < 3) return true
  const team = e.team === 1 ? 1 : 0

  // a forest is ONE obstacle, not a trap of trunks: when the next stretch of
  // the straight walk runs into standing terrain, follow the coarse grid path
  // around the whole patch; on open ground walk direct, exactly as ever
  let aimX = tx, aimY = ty
  e.repathT = Math.max(0, (e.repathT ?? 0) - dt)
  if (lineClear(g, team, e.x, e.y, tx, ty, 70, 480)) {
    e.path = null
    e.pathGoal = null
  } else {
    const goalMoved = !e.pathGoal || dist(e.pathGoal.x, e.pathGoal.y, tx, ty) > 40
    if ((!e.path || goalMoved) && e.repathT <= 0) {
      e.path = findPath(g, team, e.x, e.y, tx, ty)
      e.pathGoal = { x: tx, y: ty }
      e.repathT = 1.2
    }
    if (e.path && e.path.length) {
      // pop waypoints as they're reached, or once the next one is in plain view
      while (e.path.length &&
        (dist(e.x, e.y, e.path[0].x, e.path[0].y) < 18 ||
          (e.path.length > 1 && lineClear(g, team, e.x, e.y, e.path[1].x, e.path[1].y, 0)))) {
        e.path.shift()
      }
      if (e.path.length) { aimX = e.path[0].x; aimY = e.path[0].y }
    }
  }
  const direct = aimX === tx && aimY === ty

  const dx = aimX - e.x, dy = aimY - e.y
  const d = Math.hypot(dx, dy) || 1
  let dirX = dx / d, dirY = dy / d

  // steering: if the stretch just ahead runs into a building, slide along its
  // edge instead of pinning against it (small round resources need no steering —
  // the separation push already slides walkers around them naturally)
  const probe = Math.min(d, e.r + 18)
  const px = e.x + dirX * probe, py = e.y + dirY * probe
  // heading through our own gateway? then the fence beside it is a door frame
  let nearOwnGate = false
  for (const o of g.ents) {
    if (o.kind !== 'gate' || !o.complete || o.team !== e.team) continue
    if (dist(o.x, o.y, e.x, e.y) < o.r + 40) { nearOwnGate = true; break }
  }
  let block: Ent | null = null
  for (const o of g.ents) {
    if (o === e) continue
    // living trees and bare rock are terrain; stumps and everything else stay open
    const terrain = (o.kind === 'tree' && (o.amount ?? 0) > 0) || o.kind === 'crag'
    if (!terrain && !isBuilding(o)) continue
    if (o.kind === 'farm') continue // fields are crossed, not skirted
    if (o.kind === 'gate' && o.team === e.team) continue // our own gates swing open
    if (o.kind === 'wall' && o.team === e.team && nearOwnGate) continue // ...and so do their posts
    if ((o.kind === 'wall' || o.kind === 'gate') && !o.complete && (o.progress ?? 0) <= 0) continue // just pegs in the grass
    const clearance = e.r + o.r * 0.85
    if (dist(tx, ty, o.x, o.y) < e.r + o.r + 24) continue // that's where we're headed — walk right up
    if (dist(px, py, o.x, o.y) < clearance) { block = o; break }
  }
  if (block) {
    const ox = e.x - block.x, oy = e.y - block.y
    const ol = Math.hypot(ox, oy) || 1
    const nx = ox / ol, ny = oy / ol
    // pick a side once and stick with it until the way is clear
    if (!e.avoidSide) e.avoidSide = (dirX * -oy + dirY * ox) >= 0 ? 1 : -1
    const side = e.avoidSide
    // tangent around the obstacle, blended slightly outward so we don't hug the wall
    dirX = -ny * side + nx * 0.35
    dirY = nx * side + ny * 0.35
    const dl = Math.hypot(dirX, dirY) || 1
    dirX /= dl; dirY /= dl
  } else {
    e.avoidSide = undefined
  }

  const step = Math.min(speed * dt, d)
  e.x += dirX * step
  e.y += dirY * step
  e.stepped = true
  // turn smoothly rather than snapping — the lean tilt reads calm
  const want = Math.atan2(dirY, dirX)
  if (e.heading === undefined) e.heading = want
  else {
    let dh = want - e.heading
    while (dh > Math.PI) dh -= Math.PI * 2
    while (dh < -Math.PI) dh += Math.PI * 2
    e.heading += dh * Math.min(1, 10 * dt)
  }
  if (Math.abs(dx) > 4) e.face = dx > 0 ? 1 : -1
  return direct && d - step < 3
}

function inRange(a: Ent, b: Ent, range: number): boolean {
  return dist(a.x, a.y, b.x, b.y) <= a.r + b.r + range
}

// something of yours took a hit: raise a minimap alert (grouped, short-lived)
// What the tool makes of the thing it's working on.
const WORK_SOUND: Record<string, string> = {
  tree: 'chop', goldmine: 'mine', stonequarry: 'mine',
  berrybush: 'forage', deer: 'forage', croc: 'forage', farm: 'harvest',
}

function alertPing(g: Game, x: number, y: number): void {
  for (const p of g.pings) {
    if (g.t - p.t < 2.5 && dist(p.x, p.y, x, y) < 150) return // same skirmish
  }
  g.pings.push({ x, y, t: g.t })
  if (g.pings.length > 8) g.pings.shift()
  cue(g, 'bell') // the town bell, heard wherever you happen to be looking
}

function attackTarget(g: Game, e: Ent, dt: number): void {
  const s = UNITS[e.kind]
  const t = e.targetId !== undefined ? g.byId.get(e.targetId) : undefined
  if (t && (t.kind === 'croc' || t.kind === 'deer') && t.hp <= 0) {
    // the beast is down — a bundle for the villagers, not a foe
    if (e.resume) { e.state = 'attackmove'; e.tx = e.resume.x; e.ty = e.resume.y }
    else e.state = 'idle'
    e.targetId = undefined
    return
  }
  if (!t || t.hidden) {
    // target gone (or safely garrisoned): resume attack-move or go idle
    if (e.resume) { e.state = 'attackmove'; e.tx = e.resume.x; e.ty = e.resume.y }
    else e.state = 'idle'
    e.targetId = undefined
    return
  }
  if (!inRange(e, t, s.range)) {
    e.chaseT = 0.25 // once caught up, dig in a little past the range line
    e.setup = 0 // a trebuchet on the roll must plant its frame again
    moveToward(g, e, t.x, t.y, unitSpeed(g, e), dt)
    return
  }
  // siege engines lob boulders at a FIXED point — clumps beware, walkers dodge
  if (isSiege(e)) {
    if (Math.abs(t.x - e.x) > 6) e.face = t.x > e.x ? 1 : -1
    if (e.kind === 'mangonel' && inRange(e, t, MANGONEL_MIN_RANGE)) return // too close to drop a shot
    if (e.kind === 'trebuchet') {
      e.setup = (e.setup ?? 0) + dt
      if (e.setup < TREB_SETUP) return // still planting the frame
    }
    if ((e.cd ?? 0) <= 0) {
      e.cd = s.cd
      const mang = e.kind === 'mangonel'
      g.projectiles.push({
        x: e.x, y: e.y - 16, targetId: -1, tx: t.x, ty: t.y,
        speed: mang ? MANGONEL_BOULDER_SPEED : TREB_BOULDER_SPEED,
        dmg: s.dmg, team: e.team, kind: 'boulder',
        sx: e.x, sy: e.y - 16,
        arcH: mang ? MANGONEL_ARC : TREB_ARC,
        splash: mang ? MANGONEL_SPLASH : TREB_SPLASH,
      })
      puff(g, e.x, e.y - 18, '#C9B896', 3)
      cue(g, 'launch', e.x, e.y)
    }
    return
  }
  if ((e.chaseT ?? 0) > 0 && !inRange(e, t, Math.max(2, s.range - 10))) {
    // just re-entered range on a moving target: keep closing so a nudge
    // doesn't bounce us straight back out (the strikes continue meanwhile)
    e.chaseT = (e.chaseT ?? 0) - dt
    moveToward(g, e, t.x, t.y, unitSpeed(g, e), dt)
  }
  if (Math.abs(t.x - e.x) > 6) e.face = t.x > e.x ? 1 : -1
  if ((e.cd ?? 0) <= 0) {
    e.cd = s.cd
    const dmg = s.dmg + (DMG_BONUS[e.kind]?.[t.kind] ?? 0) // counters bite harder
      + champDmg(g, e.team, e.kind) // and champions hit like it
    if (e.kind === 'archer') {
      // loose an arrow instead of striking
      g.projectiles.push({
        x: e.x, y: e.y - 12, targetId: t.id, tx: t.x, ty: t.y - 6,
        speed: 260, dmg, team: e.team,
      })
      g.arrowsFired++
      cue(g, 'bow', e.x, e.y)
    } else {
      t.hp -= dmg
      puff(g, t.x + (Math.random() - 0.5) * t.r, t.y - t.r * 0.4, '#FFF3D6', 3, 'hit')
      cue(g, 'sword', t.x, t.y)
      if (t.team === 0) alertPing(g, t.x, t.y)
    }
    // defenders fight back: idle victims turn on their attacker
    if (isUnit(t) && (t.state === 'idle' || t.state === 'gather' || t.state === 'return') &&
      (t.kind === 'swordsman' || t.kind === 'spearman' || t.kind === 'archer' || t.kind === 'knight')) {
      t.state = 'attack'; t.targetId = e.id
    }
  }
}

function updateVillager(g: Game, e: Ent, dt: number): void {
  const spd = unitSpeed(g, e)
  switch (e.state) {
    case 'move': {
      if (moveToward(g, e, e.tx!, e.ty!, spd, dt)) e.state = 'idle'
      break
    }
    case 'gather': {
      const res = e.targetId !== undefined ? g.byId.get(e.targetId) : undefined
      const isFarm = res?.kind === 'farm'
      const isBeast = res?.kind === 'deer' || res?.kind === 'croc'
      const dead = !res ||
        (isFarm ? (!res.complete || res.team !== e.team || res.hp <= 0) :
          isBeast ? res.hp <= 0 && (res.amount ?? 0) <= 0 : (res.amount ?? 0) <= 0)
      if (dead) {
        // find another source of the same kind nearby, else head home with what we carry
        if (isFarm || res?.kind === undefined && e.carryRes === 'food') {
          const next = nearest(g, e.x, e.y,
            o => o.kind === 'farm' && o.team === e.team && !!o.complete, 300)
          if (next) { e.targetId = next.id; break }
        }
        const kind = res && !isFarm ? res.kind : SOURCE_OF[e.carryRes ?? 'wood']
        const next = nearest(g, e.x, e.y, o => o.kind === kind && (o.amount ?? 0) > 0, 280)
        if (next) { e.targetId = next.id }
        else if ((e.carry ?? 0) > 0) e.state = 'return'
        else e.state = 'idle'
        break
      }
      // one pair of hands per field: the earlier hand keeps it, the newcomer
      // moves to a free farm or stands down (both bouncing would empty the field)
      const outranked = isFarm && g.ents.some(o => o !== e && o.kind === 'villager' &&
        o.team === e.team && (o.state === 'gather' || o.state === 'return') &&
        o.targetId === res!.id && o.id < e.id)
      if (outranked) {
        const free = nearest(g, e.x, e.y, o => o.kind === 'farm' && o.team === e.team &&
          !!o.complete && !farmTaken(g, o, e), 320)
        if (free) { e.targetId = free.id; break }
        if (e.team === 0) toast(g, 'The field only needs one pair of hands.')
        e.state = 'idle'; e.targetId = undefined
        break
      }
      // a living beast must be brought down first: close in and strike —
      // a deer bolts between pokes; a crocodile stands its ground and bites back
      if (isBeast && res!.hp > 0) {
        if (!inRange(e, res!, 8)) { moveToward(g, e, res!.x, res!.y, spd, dt); break }
        if (Math.abs(res!.x - e.x) > 1) e.face = res!.x > e.x ? 1 : -1
        e.gatherT = (e.gatherT ?? 0) + dt
        if (e.gatherT >= GATHER_TICK) {
          e.gatherT = 0
          res!.hp -= DEER_STRIKE
          puff(g, res!.x, res!.y - 8, '#FFF3D6', 2, 'hit')
          if (res!.hp <= 0) {
            puff(g, res!.x, res!.y - 6, '#E8D5B5', 5)
          } else if (res!.kind === 'deer') {
            // startled: a short bolt away from the hunter, then it tires
            const dx = res!.x - e.x, dy = res!.y - e.y
            const d = Math.hypot(dx, dy) || 1
            res!.tx = res!.x + (dx / d) * 55
            res!.ty = res!.y + (dy / d) * 55
            res!.fleeT = 0.7
          }
        }
        break
      }
      // a farmer works from the middle of his own field, so it's plain at a
      // glance who is tending what; everyone else works from arm's length
      if (isFarm) {
        if (dist(e.x, e.y, res.x, res.y) > 4) { moveToward(g, e, res.x, res.y, spd, dt); break }
      } else if (!inRange(e, res, 6)) { moveToward(g, e, res.x, res.y, spd, dt); break }
      if (Math.abs(res.x - e.x) > 1) e.face = res.x > e.x ? 1 : -1
      const gives: ResKind = isFarm ? 'food' : RESOURCES[res.kind].gives
      e.gatherT = (e.gatherT ?? 0) + dt * gatherRate(g, e.team, gives) // techs quicken the hands
      if (isFarm) {
        // sown, green, golden, cut — the field turns while it's worked
        res.crop = (res.crop ?? 0) + dt / FARM_CYCLE
        if (res.crop >= 1) {
          res.crop = 0
          puff(g, res.x, res.y - 4, '#E4CB8F', 10) // chaff on the breeze
        }
      }
      const tick = isFarm ? GATHER_TICK * 1.5 : GATHER_TICK // farms are steady but slow
      if (e.gatherT >= tick) {
        e.gatherT = 0
        if (e.carryRes !== gives) { e.carry = 0; e.carryRes = gives }
        if (!isFarm) {
          const take = Math.min(1, res.amount!)
          res.amount! -= take
          e.carry = (e.carry ?? 0) + take
        } else {
          e.carry = (e.carry ?? 0) + 1
        }
        const sparkColor = gives === 'gold' ? '#F2CA5C'
          : gives === 'food' ? '#E58F8F'
          : gives === 'stone' ? '#C9C2B2' : '#A4C77E'
        puff(g, res.x, res.y - res.r * 0.6, sparkColor, 2, 'spark')
        cue(g, WORK_SOUND[res.kind] ?? 'chop', res.x, res.y)
        if ((res.kind === 'goldmine' || res.kind === 'stonequarry') && res.amount! > 0) {
          // the mound shrinks as it empties
          const spec = RESOURCES[res.kind]
          res.r = spec.r * (0.55 + 0.45 * (res.amount! / spec.amount))
        }
        if (!isFarm && res.amount! <= 0) {
          // depleted resources stay in the world as scenery
          if (res.kind === 'deer' || res.kind === 'croc') {
            // a picked-clean bundle fades from the meadow entirely
            puff(g, res.x, res.y - 4, '#E8D5B5', 6, 'leaf')
            killEnt(g, res)
          } else if (res.kind === 'tree') {
            puff(g, res.x, res.y - 10, '#7BA05B', 8, 'leaf')
            res.r = 8
            g.navDirty = true // a felled tree opens a lane
          } else if (res.kind === 'berrybush') {
            puff(g, res.x, res.y - 8, '#9CB37E', 6, 'leaf')
            res.r = 10
          } else {
            puff(g, res.x, res.y - 8, '#C6B89D', 8)
            res.r = 16
          }
        }
        if ((e.carry ?? 0) >= CARRY_CAP) e.state = 'return'
      }
      break
    }
    case 'return': {
      const home = nearestDropoff(g, e)
      if (!home) { e.state = 'idle'; break }
      if (!inRange(e, home, 8)) { moveToward(g, e, home.x, home.y, spd, dt); break }
      if (e.team === 0 || e.team === 1) {
        g.res[e.team][e.carryRes ?? 'wood'] += e.carry ?? 0
        if (e.team === 0) g.uiDirty = true
      }
      cue(g, 'drop', home.x, home.y)
      e.carry = 0
      const res = e.targetId !== undefined ? g.byId.get(e.targetId) : undefined
      const farmAlive = res?.kind === 'farm' && res.complete && res.team === e.team
      if (res && (farmAlive || (res.amount ?? 0) > 0)) e.state = 'gather'
      else {
        const kind = SOURCE_OF[e.carryRes ?? 'wood']
        const next = nearest(g, e.x, e.y, o => o.kind === kind && (o.amount ?? 0) > 0, 320)
        if (next) { e.targetId = next.id; e.state = 'gather' }
        else e.state = 'idle'
      }
      break
    }
    case 'build': {
      const site = e.targetId !== undefined ? g.byId.get(e.targetId) : undefined
      if (!site || (site.complete && site.hp >= site.maxHp)) { e.state = 'idle'; e.targetId = undefined; break }
      if (!inRange(e, site, 10)) { moveToward(g, e, site.x, site.y, spd, dt); break }
      if (Math.abs(site.x - e.x) > 1) e.face = site.x > e.x ? 1 : -1
      const b = BUILDINGS[site.kind]
      if (site.complete) {
        // repairs: same hammering, but timber comes out of the stores
        const woodRate = b.cost.wood / (2 * b.time) // a full mend costs about half the build price
        if (g.res[e.team].wood < woodRate * dt) {
          if (e.team === 0) toast(g, 'Out of wood — repairs halted.')
          e.state = 'idle'; e.targetId = undefined
          break
        }
        g.res[e.team].wood -= woodRate * dt
        site.hp = Math.min(site.maxHp, site.hp + site.maxHp * (dt / b.time))
        if (Math.random() < dt * 6) puff(g, site.x + (Math.random() - 0.5) * site.r, site.y - site.r * 0.5, '#E8DCC0', 1)
        if (site.hp >= site.maxHp) { e.state = 'idle'; e.targetId = undefined }
        break
      }
      if ((site.progress ?? 0) <= 0 && (site.kind === 'wall' || site.kind === 'gate')) {
        g.navDirty = true // the peg becomes a real post — walkers must go around now
      }
      site.progress = Math.min(1, (site.progress ?? 0) + dt / b.time)
      site.hp = Math.min(b.hp, site.hp + (b.hp * 0.9) * (dt / b.time))
      if (Math.random() < dt * 6) puff(g, site.x + (Math.random() - 0.5) * site.r, site.y - site.r * 0.5, '#E8DCC0', 1)
      if (Math.random() < dt * 3) cue(g, 'hammer', site.x, site.y)
      if (site.progress >= 1) {
        site.complete = true
        site.hp = b.hp
        puff(g, site.x, site.y - site.r * 0.5, '#FBF3E4', 10)
        // a fence post finishing is a tap, a hall finishing is an occasion
        cue(g, site.kind === 'wall' ? 'place' : site.kind === 'gate' ? 'gate' : 'built', site.x, site.y)
        // a finished landmark IS the age-up: the new age dawns as the walls rise
        const lm = LANDMARKS[site.kind as LandmarkKind]
        if (lm && g.age[site.team] < lm.toAge) {
          g.age[site.team] = lm.toAge
          if (site.team === 0) {
            toast(g, `The ${AGE_NAMES[lm.toAge]} dawns — the ${b.name} stands!`)
            cue(g, 'ageup')
          }
          for (const bl of g.ents) {
            if (bl.team === site.team && isBuilding(bl) && bl.complete) {
              puff(g, bl.x, bl.y - bl.r * 0.4, '#FBF3E4', 6)
            }
          }
          g.uiDirty = true
        }
        // Keep the hammer swinging. A dragged fence can run a long way, and
        // with a crew on it the near posts go first — so when the thing just
        // finished was palisade, look right down the run for the next post
        // rather than downing tools because it sat a bit further off.
        const fence = site.kind === 'wall' || site.kind === 'gate'
        const reach = fence ? 700 : 170
        const wanted = (o: Ent) =>
          o.team === e.team && isBuilding(o) && !o.complete &&
          (!fence || o.kind === 'wall' || o.kind === 'gate')
        // and spread out: take a post nobody else has started before doubling up
        const taken = new Set<number>()
        for (const o of g.ents) {
          if (o !== e && o.team === e.team && o.kind === 'villager' &&
            o.state === 'build' && o.targetId !== undefined) taken.add(o.targetId)
        }
        const next = nearest(g, e.x, e.y, o => wanted(o) && !taken.has(o.id), reach) ??
          nearest(g, e.x, e.y, wanted, reach)
        if (next) { e.targetId = next.id }
        else { e.state = 'idle'; e.targetId = undefined }
      }
      break
    }
    case 'garrison': garrisonWalk(g, e, dt); break
    case 'attack': attackTarget(g, e, dt); break
    default: break // idle: villagers wait for orders (the enemy AI assigns its own)
  }
}

// deer amble near home, shy away from strangers, and bolt when struck
function updateDeer(g: Game, e: Ent, dt: number): void {
  if (e.hp <= 0) return // down: just a quiet bundle in the grass now
  e.fleeT = Math.max(0, (e.fleeT ?? 0) - dt)
  if (e.fleeT > 0 && e.tx !== undefined) {
    moveToward(g, e, e.tx, e.ty!, DEER_FLEE, dt)
  } else {
    e.scanT = (e.scanT ?? 0) - dt
    if (e.scanT <= 0) {
      e.scanT = 3 + Math.random() * 4
      const stranger = nearest(g, e.x, e.y, o => isUnit(o) && !o.hidden, 55)
      if (stranger) {
        // a wary hop away — short, because deer tire and hunters don't
        const dx = e.x - stranger.x, dy = e.y - stranger.y
        const d = Math.hypot(dx, dy) || 1
        e.tx = e.x + (dx / d) * 48
        e.ty = e.y + (dy / d) * 48
        e.fleeT = 0.6
      } else {
        e.tx = (e.homeX ?? e.x) + (Math.random() - 0.5) * 110
        e.ty = (e.homeY ?? e.y) + (Math.random() - 0.5) * 90
      }
    }
    if (e.tx !== undefined && moveToward(g, e, e.tx, e.ty!, DEER_AMBLE, dt)) {
      e.tx = undefined; e.ty = undefined
    }
  }
  // herd manners: drift apart so the family never stands in a stack
  for (const o of g.ents) {
    if (o === e || o.kind !== 'deer' || o.hp <= 0) continue
    const dx = e.x - o.x, dy = e.y - o.y
    const d = Math.hypot(dx, dy)
    const min = 26
    if (d > 0.001 && d < min) {
      e.x += (dx / d) * (min - d) * 0.5
      e.y += (dy / d) * (min - d) * 0.5
    }
  }
  e.x = Math.max(30, Math.min(g.world.w - 30, e.x))
  e.y = Math.max(30, Math.min(g.world.h - 30, e.y))
}

// crocs glide straight — no land pathfinding for a beast that lives in the
// water the grid marks as blocked (its whole world is a short leash anyway)
function crocStep(e: Ent, tx: number, ty: number, speed: number, dt: number): boolean {
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy)
  if (d < 3) return true
  const step = Math.min(speed * dt, d)
  e.x += (dx / d) * step
  e.y += (dy / d) * step
  e.stepped = true
  if (Math.abs(dx) > 3) e.face = dx > 0 ? 1 : -1
  return d - step < 3
}

// crocodiles laze by the water, lunge at whatever strays close, and bite hard.
// They keep to a short leash around home — a lost meal is soon forgotten.
function updateCroc(g: Game, e: Ent, dt: number): void {
  if (e.hp <= 0) return // belly-up: a bundle for the brave
  e.cd = Math.max(0, (e.cd ?? 0) - dt)
  const homeD = dist(e.x, e.y, e.homeX ?? e.x, e.homeY ?? e.y)
  const t = e.targetId !== undefined ? g.byId.get(e.targetId) : undefined
  if (t && isUnit(t) && !t.hidden && homeD < CROC_LEASH &&
    dist(t.x, t.y, e.homeX ?? e.x, e.homeY ?? e.y) < CROC_LEASH + 40) {
    if (!inRange(e, t, 8)) {
      crocStep(e, t.x, t.y, CROC_SPEED, dt)
    } else if (e.cd <= 0) {
      e.cd = CROC_CD
      t.hp -= CROC_DMG
      puff(g, t.x, t.y - t.r * 0.5, '#FFF3D6', 3, 'hit')
      if (t.team === 0) alertPing(g, t.x, t.y)
      if ((t.kind === 'villager' || t.kind === 'scout' || t.kind === 'monk') && t.targetId !== e.id) {
        // the bitten bolt for safety (hunters committed to the fight stay in it)
        const dx = t.x - e.x, dy = t.y - e.y
        const dl = Math.hypot(dx, dy) || 1
        t.state = 'move'
        t.tx = t.x + (dx / dl) * 120
        t.ty = t.y + (dy / dl) * 120
        t.targetId = undefined
        t.resume = null
        if (t.team === 0) toast(g, 'A crocodile snaps at your villagers!')
      } else if ((t.kind === 'swordsman' || t.kind === 'spearman' || t.kind === 'archer' || t.kind === 'knight') &&
        (t.state === 'idle' || t.state === 'move' || t.state === 'attackmove')) {
        if (t.state === 'attackmove') t.resume = { x: t.tx!, y: t.ty! }
        t.state = 'attack'; t.targetId = e.id // soldiers answer teeth with steel
      }
    }
    return
  }
  e.targetId = undefined
  // too far from the water: pad quietly home
  if (homeD > 40 && (e.tx === undefined || homeD > CROC_LEASH * 0.7)) {
    e.tx = e.homeX; e.ty = e.homeY
  }
  // watch for a meal
  e.scanT = (e.scanT ?? 0) - dt
  if (e.scanT <= 0) {
    e.scanT = 0.4
    const prey = nearest(g, e.x, e.y, o => isUnit(o) && !isSiege(o) && !o.hidden, CROC_AGGRO) // timber isn't food
    if (prey) { e.targetId = prey.id; return }
    if (e.tx === undefined && Math.random() < 0.25) {
      // a lazy drift about the lair
      e.tx = (e.homeX ?? e.x) + (Math.random() - 0.5) * 70
      e.ty = (e.homeY ?? e.y) + (Math.random() - 0.5) * 55
    }
  }
  if (e.tx !== undefined && crocStep(e, e.tx, e.ty!, CROC_SPEED * 0.45, dt)) {
    e.tx = undefined; e.ty = undefined
  }
}

// walk to a garrisonable building and shelter inside (villagers and soldiers alike)
function garrisonWalk(g: Game, e: Ent, dt: number): void {
  const b = e.targetId !== undefined ? g.byId.get(e.targetId) : undefined
  if (!b || !b.complete || !isBuilding(b)) { e.state = 'idle'; e.targetId = undefined; return }
  if (!inRange(e, b, 10)) { moveToward(g, e, b.x, b.y, unitSpeed(g, e) * 1.15, dt); return } // hurry!
  if ((b.garrison ?? 0) < BUILDINGS[b.kind].garrisonCap) {
    b.garrison = (b.garrison ?? 0) + 1
    e.hidden = true
    e.insideId = b.id
    e.carry = 0
    puff(g, b.x, b.y + b.r * 0.4, '#FBF3E4', 3)
    cue(g, 'gate', b.x, b.y)
    g.uiDirty = true
  }
  e.state = 'idle'
  e.targetId = undefined
}

function updateSoldier(g: Game, e: Ent, dt: number): void {
  const s = UNITS[e.kind]
  switch (e.state) {
    case 'move': {
      if (moveToward(g, e, e.tx!, e.ty!, unitSpeed(g, e), dt)) e.state = 'idle'
      break
    }
    case 'garrison': garrisonWalk(g, e, dt); break
    case 'attackmove': {
      e.scanT = (e.scanT ?? 0) - dt
      if (e.scanT <= 0) {
        e.scanT = 0.25
        const foe = nearestEnemyThing(g, e, 150)
        if (foe) {
          e.resume = { x: e.tx!, y: e.ty! }
          e.state = 'attack'; e.targetId = foe.id
          break
        }
      }
      if (moveToward(g, e, e.tx!, e.ty!, s.speed, dt)) {
        // arrived at destination: hunt anything left nearby, else hold
        const foe = nearestEnemyThing(g, e, 260)
        if (foe) { e.resume = { x: e.tx!, y: e.ty! }; e.state = 'attack'; e.targetId = foe.id }
        else { e.state = 'idle'; e.resume = null }
      }
      break
    }
    case 'attack': attackTarget(g, e, dt); break
    default: { // idle
      e.scanT = (e.scanT ?? 0) - dt
      if (e.scanT <= 0) {
        if (s.aggro > 0) { // auto-engage nearby enemy units
          e.scanT = 0.3
          const foe = nearestEnemyUnit(g, e, s.aggro)
          if (foe) { e.state = 'attack'; e.targetId = foe.id; e.resume = null }
        } else if (e.kind === 'trebuchet') {
          // a planted trebuchet batters any fortress in reach on its own
          e.scanT = 0.5
          const wall = nearest(g, e.x, e.y,
            o => isBuilding(o) && o.team >= 0 && o.team !== e.team, s.range + e.r)
          if (wall) { e.state = 'attack'; e.targetId = wall.id; e.resume = null }
        } else if (e.kind === 'scout' && e.team === 1) {
          // the enemy scout roams the meadow
          e.scanT = 2 + Math.random() * 3
          e.state = 'move'
          e.tx = 100 + Math.random() * (g.world.w - 200)
          e.ty = 100 + Math.random() * (g.world.h - 200)
        } else {
          e.scanT = 0.5
        }
      }
      break
    }
  }
}

// Monks carry no weapon: they fetch relics, enshrine them, and quietly mend
// the hurts of anyone standing near.
function updateMonk(g: Game, e: Ent, dt: number): void {
  const carrying = e.relicId !== undefined ? g.byId.get(e.relicId) : undefined
  if (carrying) { carrying.x = e.x; carrying.y = e.y - 2 } // the relic travels in his arms
  switch (e.state) {
    case 'move': {
      if (moveToward(g, e, e.tx!, e.ty!, unitSpeed(g, e), dt)) e.state = 'idle'
      break
    }
    case 'garrison': garrisonWalk(g, e, dt); break
    case 'fetchrelic': {
      const relic = e.targetId !== undefined ? g.byId.get(e.targetId) : undefined
      if (!relic || relic.kind !== 'relic' || relic.heldBy !== undefined || relic.shrineId !== undefined ||
        e.relicId !== undefined) {
        e.state = 'idle' // gone, claimed, or his arms are already full
        break
      }
      if (inRange(e, relic, 8)) {
        relic.heldBy = e.id
        e.relicId = relic.id
        puff(g, e.x, e.y - 14, '#E9B44C', 5, 'spark')
        if (e.team === 0) toast(g, 'A holy relic! Carry it to a church or ministry.')
        e.state = 'idle'
      } else {
        moveToward(g, e, relic.x, relic.y, unitSpeed(g, e), dt)
      }
      break
    }
    case 'enshrine': {
      const b = e.targetId !== undefined ? g.byId.get(e.targetId) : undefined
      if (!b || !carrying || !b.complete || (b.kind !== 'church' && b.kind !== 'ministry') || b.team !== e.team) {
        e.state = 'idle'
        break
      }
      if (inRange(e, b, 10)) {
        carrying.shrineId = b.id
        carrying.heldBy = undefined
        carrying.x = b.x
        carrying.y = b.y
        e.relicId = undefined
        puff(g, b.x, b.y - b.r, '#E9B44C', 8, 'spark')
        if (e.team === 0) toast(g, 'The relic is enshrined — its tithes flow in gold.')
        g.uiDirty = true
        e.state = 'idle'
      } else {
        moveToward(g, e, b.x, b.y, unitSpeed(g, e), dt)
      }
      break
    }
    default: break // idle: stand, sway, mend
  }
  e.gatherT = (e.gatherT ?? 0) - dt
  if (e.gatherT <= 0) {
    e.gatherT = MONK_HEAL_TICK
    const blessed = g.techs[e.team]?.sanctuary
    const radius = blessed ? SANCTUARY_HEAL_RADIUS : MONK_HEAL_RADIUS
    const rate = blessed ? SANCTUARY_HEAL_RATE : MONK_HEAL_RATE
    for (const u of g.ents) {
      if (u.team !== e.team || u === e || !isUnit(u) || u.hidden) continue
      if (isSiege(u)) continue // prayer mends flesh, not timber
      if (u.hp <= 0 || u.hp >= u.maxHp) continue
      if (dist(e.x, e.y, u.x, u.y) > radius) continue
      u.hp = Math.min(u.maxHp, u.hp + rate)
      if (Math.random() < 0.35) puff(g, u.x, u.y - u.r - 6, '#F5E6A8', 1, 'spark')
    }
  }
}

function updateBuilding(g: Game, e: Ent, dt: number): void {
  if (!e.complete || !e.queue) return
  // garrisoned Town Hall rains arrows on nearby raiders
  if (e.kind === 'towncenter' && (e.garrison ?? 0) > 0) {
    e.volleyT = (e.volleyT ?? TC_VOLLEY) - dt
    if (e.volleyT <= 0) {
      e.volleyT = TC_VOLLEY
      const inRangeFoes = g.ents
        .filter(o => isUnit(o) && !o.hidden && o.team >= 0 && o.team !== e.team &&
          dist(e.x, e.y, o.x, o.y) < TC_RANGE)
        .sort((a, b) => dist(e.x, e.y, a.x, a.y) - dist(e.x, e.y, b.x, b.y))
      if (inRangeFoes.length) {
        const arrows = Math.min(e.garrison ?? 0, BUILDINGS.towncenter.garrisonCap)
        for (let i = 0; i < arrows; i++) {
          const t = inRangeFoes[i % Math.min(inRangeFoes.length, 4)]
          g.projectiles.push({
            x: e.x + (Math.random() - 0.5) * 30, y: e.y - e.r * 0.9,
            targetId: t.id, tx: t.x, ty: t.y,
            speed: 250 + Math.random() * 40, dmg: ARROW_DMG, team: e.team,
          })
          g.arrowsFired++
        }
      }
    }
  }
  // a finished watchtower looses one arrow at a time, garrisoned or not
  if (e.kind === 'watchtower') {
    e.volleyT = (e.volleyT ?? TOWER_VOLLEY) - dt
    if (e.volleyT <= 0) {
      e.volleyT = TOWER_VOLLEY
      const foe = nearest(g, e.x, e.y,
        o => isUnit(o) && !o.hidden && o.team >= 0 && o.team !== e.team, TOWER_RANGE)
      if (foe) {
        g.projectiles.push({
          x: e.x, y: e.y - e.r * 1.6,
          targetId: foe.id, tx: foe.x, ty: foe.y,
          speed: 270, dmg: TOWER_DMG, team: e.team,
        })
        g.arrowsFired++
      }
    }
  }
  // an upgrade underway in this building — a champion oath or an economy tech
  if (e.research) {
    e.research.t -= dt
    if (e.research.t <= 0) {
      const id = e.research.id
      e.research = undefined
      if (id in CHAMPS) {
        const spec = CHAMPS[id as ChampId]
        g.champs[e.team][id as ChampId] = true
        // veterans already standing are knighted on the spot
        for (const u of g.ents) {
          if (u.team === e.team && spec.kinds.includes(u.kind)) {
            u.maxHp += spec.hp
            u.hp += spec.hp
            puff(g, u.x, u.y - u.r, '#E9B44C', 4, 'spark')
          }
        }
        if (e.team === 0) toast(g, `${spec.name}! ${spec.blurb}.`)
      } else {
        const spec = TECHS[id as TechId]
        g.techs[e.team][id as TechId] = true
        puff(g, e.x, e.y - e.r * 0.6, '#E9B44C', 6, 'spark')
        if (e.team === 0) toast(g, `${spec.name}! ${spec.blurb}.`)
      }
      g.uiDirty = true
    }
  }
  // the eco landmarks earn their keep on their own
  const trickle = LANDMARK_TRICKLES[e.kind as LandmarkKind]
  if (trickle) g.res[e.team][trickle.res] += trickle.rate * dt
  // the fortress landmarks rain arrows — more with soldiers on their walls
  if (e.kind === 'whitekeep' || e.kind === 'redpalace') {
    e.volleyT = (e.volleyT ?? KEEP_VOLLEY) - dt
    if (e.volleyT <= 0) {
      e.volleyT = KEEP_VOLLEY
      const foes = g.ents
        .filter(o => isUnit(o) && !o.hidden && o.team >= 0 && o.team !== e.team &&
          dist(e.x, e.y, o.x, o.y) < KEEP_RANGE)
        .sort((a, b) => dist(e.x, e.y, a.x, a.y) - dist(e.x, e.y, b.x, b.y))
      if (foes.length) {
        const arrows = KEEP_BASE_ARROWS + Math.min(e.garrison ?? 0, BUILDINGS[e.kind].garrisonCap)
        for (let i = 0; i < arrows; i++) {
          const t = foes[i % Math.min(foes.length, 4)]
          g.projectiles.push({
            x: e.x + (Math.random() - 0.5) * 24, y: e.y - e.r * 1.4,
            targetId: t.id, tx: t.x, ty: t.y,
            speed: 265 + Math.random() * 30, dmg: KEEP_DMG, team: e.team,
          })
          g.arrowsFired++
        }
      }
    }
  }
  const q = e.queue[0]
  if (!q) return
  q.t -= dt
  if (q.t <= 0) {
    e.queue.shift()
    const a = Math.random() * Math.PI * 2
    const d = e.r + 18
    const u = spawn(g, q.kind, e.team, e.x + Math.cos(a) * d, e.y + Math.abs(Math.sin(a)) * d + 6)
    // recruits ride under whatever banner this hall flies (monks still swear to none)
    if (e.team === 0 && e.recruitBanner !== undefined && mustBanner(u)) u.banner = e.recruitBanner
    puff(g, u.x, u.y, '#FBF3E4', 6)
    cue(g, 'muster', u.x, u.y)
    if (e.team === 0) g.uiDirty = true
  }
}

function killEnt(g: Game, e: Ent): void {
  // a falling building spills its garrison out instead of taking them with it
  if ((e.garrison ?? 0) > 0) {
    for (const v of g.ents) {
      if (v.hidden && v.insideId === e.id) {
        v.hidden = false
        v.insideId = undefined
        const a = Math.random() * Math.PI * 2
        v.x = e.x + Math.cos(a) * (e.r + 20)
        v.y = e.y + Math.sin(a) * (e.r * 0.6) + 16
        resumeJob(g, v)
      }
    }
  }
  // a fallen monk drops his burden where he stands; a fallen shrine spills its
  // relics onto the grass for anyone's monk to claim anew
  for (const rl of g.ents) {
    if (rl.kind !== 'relic') continue
    if (rl.heldBy === e.id) { rl.heldBy = undefined; rl.x = e.x; rl.y = e.y }
    if (rl.shrineId === e.id) {
      rl.shrineId = undefined
      const a = Math.random() * Math.PI * 2
      rl.x = e.x + Math.cos(a) * (e.r + 16)
      rl.y = e.y + Math.sin(a) * (e.r * 0.6) + 14
    }
  }
  if (e.kind === 'tree' || isBuilding(e)) g.navDirty = true // terrain changed
  const i = g.ents.indexOf(e)
  if (i >= 0) g.ents.splice(i, 1)
  g.byId.delete(e.id)
  const si = g.selection.indexOf(e.id)
  if (si >= 0) { g.selection.splice(si, 1); g.uiDirty = true }
  if (!g.selection.length && g.placing) { g.placing = null; g.placePos = null; g.placeEnd = null }
}

// Standing in your own gateway, the posts framing it must not shove you: the
// gap a gate leaves is barely wider than a villager, so with the fence pushing
// from both sides walkers were squeezed back out and never got through.
function inOwnDoorway(gates: Ent[], e: Ent): boolean {
  for (const gt of gates) {
    if (gt.team !== e.team) continue
    if (dist(gt.x, gt.y, e.x, e.y) < gt.r + 26) return true
  }
  return false
}

function separation(g: Game): void {
  const units = g.ents.filter(e => isUnit(e) && !e.hidden)
  const gates = g.ents.filter(e => e.kind === 'gate' && e.complete)
  for (let i = 0; i < units.length; i++) {
    const a = units[i]
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j]
      if (a.state === 'gather' && b.state === 'gather') continue // workers nestle at a busy bush
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.hypot(dx, dy)
      const min = a.r + b.r
      if (d > 0.001 && d < min) {
        // walkers shoulder through a crowd: whoever is standing still steps aside
        let wa = 0.5, wb = 0.5
        if (a.stepped && !b.stepped) { wa = 0.12; wb = 0.88 }
        else if (!a.stepped && b.stepped) { wa = 0.88; wb = 0.12 }
        const push = min - d
        const nx = dx / d, ny = dy / d
        a.x -= nx * push * wa; a.y -= ny * push * wa
        b.x += nx * push * wb; b.y += ny * push * wb
      }
    }
    // push out of buildings, big resources, and living trees (stumps are open ground)
    const doorway = inOwnDoorway(gates, a)
    for (const o of g.ents) {
      if (o === a || isUnit(o)) continue
      if (o.kind === 'deer') continue // soft little things — they step around us
      if (o.kind === 'farm') continue // a field is walked over, furrows and all
      if (o.kind === 'croc' && o.hp <= 0) continue // a bundle doesn't block the bank
      // a relic in a monk's arms (or on a shrine) rides along — only a free
      // wayside plinth stands its little ground
      if (o.kind === 'relic' && (o.heldBy !== undefined || o.shrineId !== undefined)) continue
      if (o.kind === 'tree' && (o.amount ?? 0) <= 0) continue // chopped through — a path!
      if (o.kind === 'gate' && o.team === a.team) continue // friendly gates let us through
      // in our own gateway, the posts framing it stand aside as well
      if (doorway && o.kind === 'wall' && o.team === a.team) continue
      if ((o.kind === 'wall' || o.kind === 'gate') && !o.complete && (o.progress ?? 0) <= 0) continue // unstarted fence pegs
      const dx = a.x - o.x, dy = a.y - o.y
      const d = Math.hypot(dx, dy)
      const min = a.r + o.r * 0.85
      if (d > 0.001 && d < min) {
        a.x += (dx / d) * (min - d)
        a.y += (dy / d) * (min - d)
      }
    }
    a.x = Math.max(16, Math.min(g.world.w - 16, a.x))
    a.y = Math.max(16, Math.min(g.world.h - 16, a.y))
  }
  // nobody swims: anything that ends the tick in deep water is set back on
  // the bank it came from (fords are shallow and pass freely)
  if (g.streams.length) {
    for (const a of g.ents) {
      if (!(isUnit(a) || a.kind === 'deer') || a.hidden) continue
      if (!inWater(g, a.x, a.y, a.r * 0.3)) continue
      const s = streamDist(g, a.x, a.y)
      // push directly away from the centerline to just past the bank
      let bestD = Infinity, cx = a.x, cy = a.y
      for (const st of g.streams) {
        for (let i = 0; i + 1 < st.pts.length; i++) {
          const p = st.pts[i], q = st.pts[i + 1]
          const abx = q.x - p.x, aby = q.y - p.y
          const len2 = abx * abx + aby * aby || 1
          const t = Math.max(0, Math.min(1, ((a.x - p.x) * abx + (a.y - p.y) * aby) / len2))
          const px = p.x + abx * t, py = p.y + aby * t
          const d = dist(a.x, a.y, px, py)
          if (d < bestD) { bestD = d; cx = px; cy = py }
        }
      }
      const dx = a.x - cx, dy = a.y - cy
      const dl = Math.hypot(dx, dy) || 1
      const out = s.w / 2 + a.r * 0.5 + 4
      a.x = cx + (dx / dl) * out
      a.y = cy + (dy / dl) * out
    }
  }
}

export function update(g: Game, dt: number): void {
  if (g.over) { g.overT += dt; return }
  g.t += dt

  for (const e of [...g.ents]) {
    if (!g.byId.has(e.id)) continue // removed earlier this tick
    if (isUnit(e)) {
      if (e.hidden) continue // safe inside the Town Hall
      e.stepped = false // set again by moveToward if the unit walks this tick
      e.cd = Math.max(0, (e.cd ?? 0) - dt)
      if (e.kind === 'villager') updateVillager(g, e, dt)
      else if (e.kind === 'monk') updateMonk(g, e, dt)
      else updateSoldier(g, e, dt)
      if (e.kind === 'trebuchet' && e.stepped) e.setup = 0 // rolling again: the frame comes down
    } else if (e.kind === 'deer') {
      updateDeer(g, e, dt)
    } else if (e.kind === 'croc') {
      updateCroc(g, e, dt)
    } else if (isBuilding(e)) {
      updateBuilding(g, e, dt)
    }
  }

  // enshrined relics tithe gold (and food, once the Tithe Barns are raised)
  for (const rl of g.ents) {
    if (rl.kind !== 'relic' || rl.shrineId === undefined) continue
    const shrine = g.byId.get(rl.shrineId)
    if (!shrine) { rl.shrineId = undefined; continue }
    g.res[shrine.team].gold += RELIC_GOLD_RATE * dt
    if (g.techs[shrine.team]?.tithebarns) g.res[shrine.team].food += RELIC_FOOD_RATE * dt
  }

  // arrows and boulders in flight
  for (const p of [...g.projectiles]) {
    const t = p.kind === 'boulder' ? undefined : g.byId.get(p.targetId)
    if (t && !t.hidden) { p.tx = t.x; p.ty = t.y - 6 } // arrows home; boulders fall where they were aimed
    const dx = p.tx - p.x, dy = p.ty - p.y
    const d = Math.hypot(dx, dy)
    const step = p.speed * dt
    if (d <= step + 4) {
      g.projectiles.splice(g.projectiles.indexOf(p), 1)
      if (p.kind === 'boulder') {
        // the boulder lands: everything hostile near the point of impact is hit
        puff(g, p.tx, p.ty, '#C9B896', 8)
        puff(g, p.tx, p.ty - 4, '#FFF3D6', 4, 'hit')
        cue(g, 'boom', p.tx, p.ty)
        for (const o of g.ents) {
          if (o.team < 0 || o.team === p.team || o.hidden) continue
          if (!isUnit(o) && !isBuilding(o)) continue
          if (dist(p.tx, p.ty, o.x, o.y) > (p.splash ?? 0) + o.r) continue
          o.hp -= p.dmg
          puff(g, o.x, o.y - o.r * 0.4, '#FFF3D6', 2, 'hit')
          if (o.team === 0) alertPing(g, o.x, o.y)
        }
      } else if (t && !t.hidden && dist(p.tx, p.ty, t.x, t.y - 6) < t.r + 12) {
        t.hp -= p.dmg
        puff(g, t.x, t.y - t.r * 0.5, '#FFF3D6', 2, 'hit')
        cue(g, 'arrowhit', t.x, t.y)
        if (t.team === 0) alertPing(g, t.x, t.y)
      }
    } else {
      p.x += (dx / d) * step
      p.y += (dy / d) * step
    }
  }

  separation(g)

  // stuck watchdog: a walker who isn't getting anywhere tries the other way around
  for (const e of g.ents) {
    if (!isUnit(e) || e.hidden) continue
    if (e.stepped) {
      const moved = dist(e.x, e.y, e.lastX ?? e.x, e.lastY ?? e.y)
      if (moved < 0.4) {
        e.stuckT = (e.stuckT ?? 0) + dt
        if (e.stuckT > 0.8) {
          e.avoidSide = -(e.avoidSide ?? 1)
          e.path = null // and ask the grid for a fresh route
          e.repathT = 0
          e.stuckT = 0
        }
      } else {
        e.stuckT = 0
      }
    } else {
      e.stuckT = 0
    }
    e.lastX = e.x
    e.lastY = e.y
  }

  // player line of sight, a few times a second
  g.visionT -= dt
  if (g.visionT <= 0) {
    g.visionT = 0.25
    updateVision(g)
  }

  // deaths
  for (const e of [...g.ents]) {
    if ((isUnit(e) || isBuilding(e)) && e.hp <= 0) {
      puff(g, e.x, e.y - e.r * 0.4, isBuilding(e) ? '#C9B896' : '#F4E4C6', isBuilding(e) ? 14 : 7)
      if (isBuilding(e) && e.kind !== 'wall') cue(g, 'crumble', e.x, e.y)
      killEnt(g, e)
    }
  }

  updateEnemyAI(g, dt)

  // particles
  for (const p of g.particles) {
    p.life += dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vx *= (1 - dt * 1.5)
    p.vy = p.kind === 'leaf' ? p.vy + 30 * dt : p.vy * (1 - dt * 1.5)
  }
  g.particles = g.particles.filter(p => p.life < p.maxLife)

  // toasts and minimap alerts age out
  const before = g.toasts.length
  g.toasts = g.toasts.filter(t => g.t - t.t < 4)
  if (g.toasts.length !== before) g.uiDirty = true
  if (g.pings.length && g.t - g.pings[0].t > 4) g.pings = g.pings.filter(p => g.t - p.t < 4)

  // win / lose
  const playerTC = g.ents.some(e => e.team === 0 && e.kind === 'towncenter')
  const enemyTC = g.ents.some(e => e.team === 1 && e.kind === 'towncenter')
  if (!enemyTC) { g.over = 'win'; g.uiDirty = true; cue(g, 'victory') }
  else if (!playerTC) { g.over = 'lose'; g.uiDirty = true; cue(g, 'defeat') }
}
