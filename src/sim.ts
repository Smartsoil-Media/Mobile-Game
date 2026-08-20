// Fixed-timestep simulation: unit state machines, combat, economy, enemy AI.
import {
  Game, Ent, Particle, UNITS, BUILDINGS, RESOURCES, SOURCE_OF,
  CARRY_CAP, GATHER_TICK, GARRISON_CAP, TC_RANGE, TC_VOLLEY, ARROW_DMG,
  WAVE_EVERY, WAVE_WARNING, WORLD_W, WORLD_H,
  dist, isUnit, isBuilding, isResource,
} from './data'
import { spawn, nearest, nearestDropoff, nearestEnemyUnit, nearestEnemyThing, pop, toast } from './world'

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

function moveToward(e: Ent, tx: number, ty: number, speed: number, dt: number): boolean {
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy)
  if (d < 3) return true
  const step = Math.min(speed * dt, d)
  e.x += (dx / d) * step
  e.y += (dy / d) * step
  if (Math.abs(dx) > 1) e.face = dx > 0 ? 1 : -1
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
    moveToward(e, t.x, t.y, s.speed, dt)
    return
  }
  if (Math.abs(t.x - e.x) > 1) e.face = t.x > e.x ? 1 : -1
  if ((e.cd ?? 0) <= 0) {
    e.cd = s.cd
    t.hp -= s.dmg
    puff(g, t.x + (Math.random() - 0.5) * t.r, t.y - t.r * 0.4, '#FFF3D6', 3, 'hit')
    // defenders fight back: idle victims turn on their attacker
    if (isUnit(t) && (t.state === 'idle' || t.state === 'gather' || t.state === 'return') && t.kind === 'swordsman') {
      t.state = 'attack'; t.targetId = e.id
    }
  }
}

function updateVillager(g: Game, e: Ent, dt: number): void {
  const s = UNITS.villager
  switch (e.state) {
    case 'move': {
      if (moveToward(e, e.tx!, e.ty!, s.speed, dt)) e.state = 'idle'
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
      if (!inRange(e, res, 6)) { moveToward(e, res.x, res.y, s.speed, dt); break }
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
      if (!inRange(e, home, 8)) { moveToward(e, home.x, home.y, s.speed, dt); break }
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
      if (!site || site.complete) { e.state = 'idle'; e.targetId = undefined; break }
      if (!inRange(e, site, 10)) { moveToward(e, site.x, site.y, s.speed, dt); break }
      if (Math.abs(site.x - e.x) > 1) e.face = site.x > e.x ? 1 : -1
      const b = BUILDINGS[site.kind]
      site.progress = Math.min(1, (site.progress ?? 0) + dt / b.time)
      site.hp = Math.min(b.hp, site.hp + (b.hp * 0.9) * (dt / b.time))
      if (Math.random() < dt * 6) puff(g, site.x + (Math.random() - 0.5) * site.r, site.y - site.r * 0.5, '#E8DCC0', 1)
      if (site.progress >= 1) {
        site.complete = true
        site.hp = b.hp
        puff(g, site.x, site.y - site.r * 0.5, '#FBF3E4', 10)
        e.state = 'idle'; e.targetId = undefined
      }
      break
    }
    case 'garrison': {
      const tc = e.targetId !== undefined ? g.byId.get(e.targetId) : undefined
      if (!tc || !tc.complete) { e.state = 'idle'; e.targetId = undefined; break }
      if (!inRange(e, tc, 10)) { moveToward(e, tc.x, tc.y, s.speed * 1.15, dt); break } // run!
      if ((tc.garrison ?? 0) < GARRISON_CAP) {
        tc.garrison = (tc.garrison ?? 0) + 1
        e.hidden = true
        e.carry = 0
        puff(g, tc.x, tc.y + tc.r * 0.4, '#FBF3E4', 3)
        g.uiDirty = true
      }
      e.state = 'idle'
      e.targetId = undefined
      break
    }
    case 'attack': attackTarget(g, e, dt); break
    default: { // idle
      // enemy flavor villagers keep their meadow busy
      if (e.team === 1) {
        const res = nearest(g, e.x, e.y, o => isResource(o) && (o.amount ?? 0) > 0, 500)
        if (res) { e.state = 'gather'; e.targetId = res.id }
      }
      break
    }
  }
}

function updateSoldier(g: Game, e: Ent, dt: number): void {
  const s = UNITS[e.kind]
  switch (e.state) {
    case 'move': {
      if (moveToward(e, e.tx!, e.ty!, s.speed, dt)) e.state = 'idle'
      break
    }
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
      if (moveToward(e, e.tx!, e.ty!, s.speed, dt)) {
        // arrived at destination: hunt anything left nearby, else hold
        const foe = nearestEnemyThing(g, e, 260)
        if (foe) { e.resume = { x: e.tx!, y: e.ty! }; e.state = 'attack'; e.targetId = foe.id }
        else { e.state = 'idle'; e.resume = null }
      }
      break
    }
    case 'attack': attackTarget(g, e, dt); break
    default: { // idle: auto-engage nearby enemy units
      e.scanT = (e.scanT ?? 0) - dt
      if (e.scanT <= 0) {
        e.scanT = 0.3
        const foe = nearestEnemyUnit(g, e, s.aggro)
        if (foe) { e.state = 'attack'; e.targetId = foe.id; e.resume = null }
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
        const arrows = Math.min(e.garrison ?? 0, GARRISON_CAP)
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
  // a falling Town Hall spills its garrison out instead of taking them with it
  if (e.kind === 'towncenter' && (e.garrison ?? 0) > 0) {
    let left = e.garrison ?? 0
    for (const v of g.ents) {
      if (left <= 0) break
      if (v.team === e.team && v.kind === 'villager' && v.hidden) {
        v.hidden = false
        const a = Math.random() * Math.PI * 2
        v.x = e.x + Math.cos(a) * (e.r + 20)
        v.y = e.y + Math.sin(a) * (e.r * 0.6) + 16
        v.state = 'idle'
        left--
      }
    }
  }
  const i = g.ents.indexOf(e)
  if (i >= 0) g.ents.splice(i, 1)
  g.byId.delete(e.id)
  const si = g.selection.indexOf(e.id)
  if (si >= 0) { g.selection.splice(si, 1); g.uiDirty = true }
  if (!g.selection.length && g.placing) g.placing = null
}

function separation(g: Game): void {
  const units = g.ents.filter(e => isUnit(e) && !e.hidden)
  for (let i = 0; i < units.length; i++) {
    const a = units[i]
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j]
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.hypot(dx, dy)
      const min = a.r + b.r
      if (d > 0.001 && d < min) {
        const push = (min - d) / 2
        const nx = dx / d, ny = dy / d
        a.x -= nx * push; a.y -= ny * push
        b.x += nx * push; b.y += ny * push
      }
    }
    // push out of buildings and big resources
    for (const o of g.ents) {
      if (o === a || isUnit(o)) continue
      if (o.kind === 'tree') continue // walkable under canopies, keeps paths simple
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

function enemyWaves(g: Game, dt: number): void {
  if (g.t < g.wave.at) {
    if (!g.wave.warned && g.t >= g.wave.at - WAVE_WARNING) {
      g.wave.warned = true
      toast(g, g.wave.count === 0
        ? 'Raiders sighted near the enemy camp! Ring the bell or arm up!'
        : 'Raiders are mustering again!')
    }
    return
  }
  const barracks = g.ents.find(e => e.team === 1 && e.kind === 'barracks' && e.complete)
  const tc = g.ents.find(e => e.team === 1 && e.kind === 'towncenter')
  const src = barracks ?? tc
  if (!src) return
  const playerTC = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const target = playerTC ?? g.ents.find(e => e.team === 0)
  if (!target) return
  for (let i = 0; i < g.wave.size; i++) {
    const u = spawn(g, 'swordsman', 1, src.x + (Math.random() - 0.5) * 60, src.y + src.r + 14 + Math.random() * 30)
    u.state = 'attackmove'
    u.tx = target.x + (Math.random() - 0.5) * 80
    u.ty = target.y + (Math.random() - 0.5) * 80
  }
  g.wave.count++
  toast(g, g.wave.count === 1 ? 'Enemy raid! Defend your town!' : `Raid incoming — ${g.wave.size} raiders!`)
  g.wave.at = g.t + WAVE_EVERY
  g.wave.size = Math.min(7, g.wave.size + 1)
  g.wave.warned = false
}

export function update(g: Game, dt: number): void {
  if (g.over) { g.overT += dt; return }
  g.t += dt

  for (const e of [...g.ents]) {
    if (!g.byId.has(e.id)) continue // removed earlier this tick
    if (isUnit(e)) {
      if (e.hidden) continue // safe inside the Town Hall
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

  // deaths
  for (const e of [...g.ents]) {
    if ((isUnit(e) || isBuilding(e)) && e.hp <= 0) {
      puff(g, e.x, e.y - e.r * 0.4, isBuilding(e) ? '#C9B896' : '#F4E4C6', isBuilding(e) ? 14 : 7)
      killEnt(g, e)
    }
  }

  enemyWaves(g, dt)

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
