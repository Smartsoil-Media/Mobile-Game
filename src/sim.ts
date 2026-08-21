// Fixed-timestep simulation: unit state machines, combat, economy, enemy AI.
import {
  Game, Ent, Particle, LandmarkKind, UNITS, BUILDINGS, RESOURCES, SOURCE_OF, DMG_BONUS,
  CHAMPS, LANDMARKS, LANDMARK_TRICKLE, AGE_NAMES,
  KEEP_RANGE, KEEP_VOLLEY, KEEP_DMG, KEEP_BASE_ARROWS,
  CARRY_CAP, GATHER_TICK, TC_RANGE, TC_VOLLEY, ARROW_DMG,
  TOWER_RANGE, TOWER_VOLLEY, TOWER_DMG, WORLD_W, WORLD_H,
  dist, isUnit, isBuilding, isResource,
} from './data'
import { spawn, nearest, nearestDropoff, nearestEnemyUnit, nearestEnemyThing, toast, updateVision, unitSpeed, champDmg, resumeJob } from './world'
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
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy)
  if (d < 3) return true
  let dirX = dx / d, dirY = dy / d

  // steering: if the stretch just ahead runs into a building, slide along its
  // edge instead of pinning against it (small round resources need no steering —
  // the separation push already slides walkers around them naturally)
  const probe = Math.min(d, e.r + 18)
  const px = e.x + dirX * probe, py = e.y + dirY * probe
  let block: Ent | null = null
  for (const o of g.ents) {
    if (o === e) continue
    // living trees are terrain now; stumps and everything else stay open
    const treeWall = o.kind === 'tree' && (o.amount ?? 0) > 0
    if (!treeWall && !isBuilding(o)) continue
    if (o.kind === 'gate' && o.team === e.team) continue // our own gates swing open
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
  return d - step < 3
}

function inRange(a: Ent, b: Ent, range: number): boolean {
  return dist(a.x, a.y, b.x, b.y) <= a.r + b.r + range
}

function attackTarget(g: Game, e: Ent, dt: number): void {
  const s = UNITS[e.kind]
  const t = e.targetId !== undefined ? g.byId.get(e.targetId) : undefined
  if (!t || t.hidden) {
    // target gone (or safely garrisoned): resume attack-move or go idle
    if (e.resume) { e.state = 'attackmove'; e.tx = e.resume.x; e.ty = e.resume.y }
    else e.state = 'idle'
    e.targetId = undefined
    return
  }
  if (!inRange(e, t, s.range)) {
    e.chaseT = 0.25 // once caught up, dig in a little past the range line
    moveToward(g, e, t.x, t.y, unitSpeed(g, e), dt)
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
    } else {
      t.hp -= dmg
      puff(g, t.x + (Math.random() - 0.5) * t.r, t.y - t.r * 0.4, '#FFF3D6', 3, 'hit')
    }
    // defenders fight back: idle victims turn on their attacker
    if (isUnit(t) && (t.state === 'idle' || t.state === 'gather' || t.state === 'return') &&
      (t.kind === 'swordsman' || t.kind === 'spearman' || t.kind === 'archer')) {
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
      const dead = !res ||
        (isFarm ? (!res.complete || res.team !== e.team || res.hp <= 0) : (res.amount ?? 0) <= 0)
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
      if (!inRange(e, res, 6)) { moveToward(g, e, res.x, res.y, spd, dt); break }
      if (Math.abs(res.x - e.x) > 1) e.face = res.x > e.x ? 1 : -1
      e.gatherT = (e.gatherT ?? 0) + dt
      const tick = isFarm ? GATHER_TICK * 1.5 : GATHER_TICK // farms are steady but slow
      if (e.gatherT >= tick) {
        e.gatherT = 0
        const gives = isFarm ? 'food' : RESOURCES[res.kind].gives
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
        if ((res.kind === 'goldmine' || res.kind === 'stonequarry') && res.amount! > 0) {
          // the mound shrinks as it empties
          const spec = RESOURCES[res.kind]
          res.r = spec.r * (0.55 + 0.45 * (res.amount! / spec.amount))
        }
        if (!isFarm && res.amount! <= 0) {
          // depleted resources stay in the world as scenery
          if (res.kind === 'tree') {
            puff(g, res.x, res.y - 10, '#7BA05B', 8, 'leaf')
            res.r = 8
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
      site.progress = Math.min(1, (site.progress ?? 0) + dt / b.time)
      site.hp = Math.min(b.hp, site.hp + (b.hp * 0.9) * (dt / b.time))
      if (Math.random() < dt * 6) puff(g, site.x + (Math.random() - 0.5) * site.r, site.y - site.r * 0.5, '#E8DCC0', 1)
      if (site.progress >= 1) {
        site.complete = true
        site.hp = b.hp
        puff(g, site.x, site.y - site.r * 0.5, '#FBF3E4', 10)
        // a finished landmark IS the age-up: the new age dawns as the walls rise
        const lm = LANDMARKS[site.kind as LandmarkKind]
        if (lm && g.age[site.team] < lm.toAge) {
          g.age[site.team] = lm.toAge
          if (site.team === 0) toast(g, `The ${AGE_NAMES[lm.toAge]} dawns — the ${b.name} stands!`)
          for (const bl of g.ents) {
            if (bl.team === site.team && isBuilding(bl) && bl.complete) {
              puff(g, bl.x, bl.y - bl.r * 0.4, '#FBF3E4', 6)
            }
          }
          g.uiDirty = true
        }
        // keep the hammer swinging: pick up the next site in the row (wall lines!)
        const next = nearest(g, e.x, e.y, o => o.team === e.team && isBuilding(o) && !o.complete, 170)
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
        } else if (e.kind === 'scout' && e.team === 1) {
          // the enemy scout roams the meadow
          e.scanT = 2 + Math.random() * 3
          e.state = 'move'
          e.tx = 100 + Math.random() * (WORLD_W - 200)
          e.ty = 100 + Math.random() * (WORLD_H - 200)
        } else {
          e.scanT = 0.5
        }
      }
      break
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
  // a champion upgrade underway in this hall
  if (e.research) {
    e.research.t -= dt
    if (e.research.t <= 0) {
      const id = e.research.id
      const spec = CHAMPS[id]
      g.champs[e.team][id] = true
      e.research = undefined
      // veterans already standing are knighted on the spot
      for (const u of g.ents) {
        if (u.team === e.team && spec.kinds.includes(u.kind)) {
          u.maxHp += spec.hp
          u.hp += spec.hp
          puff(g, u.x, u.y - u.r, '#E9B44C', 4, 'spark')
        }
      }
      if (e.team === 0) toast(g, `${spec.name}! ${spec.blurb}.`)
      g.uiDirty = true
    }
  }
  // the eco landmarks earn their keep on their own
  if (e.kind === 'abbeymill') g.res[e.team].food += LANDMARK_TRICKLE * dt
  if (e.kind === 'guildhall') g.res[e.team].gold += LANDMARK_TRICKLE * dt
  // the White Keep rains arrows — more with soldiers on its walls
  if (e.kind === 'whitekeep') {
    e.volleyT = (e.volleyT ?? KEEP_VOLLEY) - dt
    if (e.volleyT <= 0) {
      e.volleyT = KEEP_VOLLEY
      const foes = g.ents
        .filter(o => isUnit(o) && !o.hidden && o.team >= 0 && o.team !== e.team &&
          dist(e.x, e.y, o.x, o.y) < KEEP_RANGE)
        .sort((a, b) => dist(e.x, e.y, a.x, a.y) - dist(e.x, e.y, b.x, b.y))
      if (foes.length) {
        const arrows = KEEP_BASE_ARROWS + Math.min(e.garrison ?? 0, BUILDINGS.whitekeep.garrisonCap)
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
    puff(g, u.x, u.y, '#FBF3E4', 6)
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
  const i = g.ents.indexOf(e)
  if (i >= 0) g.ents.splice(i, 1)
  g.byId.delete(e.id)
  const si = g.selection.indexOf(e.id)
  if (si >= 0) { g.selection.splice(si, 1); g.uiDirty = true }
  if (!g.selection.length && g.placing) { g.placing = null; g.placePos = null; g.placeEnd = null }
}

function separation(g: Game): void {
  const units = g.ents.filter(e => isUnit(e) && !e.hidden)
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
    for (const o of g.ents) {
      if (o === a || isUnit(o)) continue
      if (o.kind === 'tree' && (o.amount ?? 0) <= 0) continue // chopped through — a path!
      if (o.kind === 'gate' && o.team === a.team) continue // friendly gates let us through
      if ((o.kind === 'wall' || o.kind === 'gate') && !o.complete && (o.progress ?? 0) <= 0) continue // unstarted fence pegs
      const dx = a.x - o.x, dy = a.y - o.y
      const d = Math.hypot(dx, dy)
      const min = a.r + o.r * 0.85
      if (d > 0.001 && d < min) {
        a.x += (dx / d) * (min - d)
        a.y += (dy / d) * (min - d)
      }
    }
    a.x = Math.max(16, Math.min(WORLD_W - 16, a.x))
    a.y = Math.max(16, Math.min(WORLD_H - 16, a.y))
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
      else updateSoldier(g, e, dt)
    } else if (isBuilding(e)) {
      updateBuilding(g, e, dt)
    }
  }

  // arrows in flight
  for (const p of [...g.projectiles]) {
    const t = g.byId.get(p.targetId)
    if (t && !t.hidden) { p.tx = t.x; p.ty = t.y - 6 }
    const dx = p.tx - p.x, dy = p.ty - p.y
    const d = Math.hypot(dx, dy)
    const step = p.speed * dt
    if (d <= step + 4) {
      g.projectiles.splice(g.projectiles.indexOf(p), 1)
      if (t && !t.hidden && dist(p.tx, p.ty, t.x, t.y - 6) < t.r + 12) {
        t.hp -= p.dmg
        puff(g, t.x, t.y - t.r * 0.5, '#FFF3D6', 2, 'hit')
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

  // toasts age out
  const before = g.toasts.length
  g.toasts = g.toasts.filter(t => g.t - t.t < 4)
  if (g.toasts.length !== before) g.uiDirty = true

  // win / lose
  const playerTC = g.ents.some(e => e.team === 0 && e.kind === 'towncenter')
  const enemyTC = g.ents.some(e => e.team === 1 && e.kind === 'towncenter')
  if (!enemyTC) { g.over = 'win'; g.uiDirty = true }
  else if (!playerTC) { g.over = 'lose'; g.uiDirty = true }
}
