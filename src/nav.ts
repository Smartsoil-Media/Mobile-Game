// Coarse navigation: a walkability grid over standing terrain (living trees,
// buildings) plus A* pathfinding. Units consult it only when their straight
// line is blocked — open-meadow walking stays exactly as it always was, and
// the local steering slide still handles fine detail and moving obstacles.
// The payoff: a forest pocket is finally ONE obstacle, not a trap of trunks.
import { Game, Ent, dist, isBuilding } from './data'

export const NAV_CELL = 32

// bit 1 blocks team 0, bit 2 blocks team 1 (gates open for their own side)
// how much ground a finished gate reopens for its owner, so the gap survives
// the coarse lattice and A* can actually route a walker through it
const GATE_OPEN_R = 34
function bitFor(team: number): number { return team === 1 ? 2 : 1 }

// distance from a point to the nearest stream centerline (Infinity when dry)
export function streamDist(g: Game, x: number, y: number): { d: number; w: number } {
  let best = Infinity, bw = 0
  for (const s of g.streams) {
    for (let i = 0; i + 1 < s.pts.length; i++) {
      const a = s.pts[i], b = s.pts[i + 1]
      const abx = b.x - a.x, aby = b.y - a.y
      const len2 = abx * abx + aby * aby || 1
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / len2))
      const d = dist(x, y, a.x + abx * t, a.y + aby * t)
      if (d < best) { best = d; bw = s.w }
    }
  }
  return { d: best, w: bw }
}

// deep water at this point? Fords are shallow — crossable on foot — unless
// the caller asks for them counted (placement wants nothing built there)
export function inWater(g: Game, x: number, y: number, margin = 0, fordsCount = false): boolean {
  if (!g.streams.length) return false
  const s = streamDist(g, x, y)
  if (s.d >= s.w / 2 + margin) return false
  if (fordsCount) return true
  return !g.fords.some(f => dist(x, y, f.x, f.y) < f.r)
}

export function rebuildNav(g: Game): void {
  const w = Math.ceil(g.world.w / NAV_CELL)
  const h = Math.ceil(g.world.h / NAV_CELL)
  if (!g.nav || g.nav.w !== w || g.nav.h !== h) g.nav = { w, h, block: new Uint8Array(w * h) }
  const grid = g.nav.block
  // streams never move: stamp them once, then start every rebuild from that
  if (!g.navWater) {
    g.navWater = new Uint8Array(w * h)
    if (g.streams.length) {
      for (let cy = 0; cy < h; cy++) {
        for (let cx = 0; cx < w; cx++) {
          if (inWater(g, cx * NAV_CELL + NAV_CELL / 2, cy * NAV_CELL + NAV_CELL / 2, 8)) {
            g.navWater[cy * w + cx] = 3
          }
        }
      }
    }
  }
  grid.set(g.navWater)
  const stamp = (x: number, y: number, r: number, bits: number) => {
    const x0 = Math.max(0, Math.floor((x - r) / NAV_CELL))
    const x1 = Math.min(w - 1, Math.floor((x + r) / NAV_CELL))
    const y0 = Math.max(0, Math.floor((y - r) / NAV_CELL))
    const y1 = Math.min(h - 1, Math.floor((y + r) / NAV_CELL))
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (dist(x, y, cx * NAV_CELL + NAV_CELL / 2, cy * NAV_CELL + NAV_CELL / 2) <= r) {
          grid[cy * w + cx] |= bits
        }
      }
    }
  }
  const gates: Ent[] = []
  for (const o of g.ents) {
    if (o.kind === 'tree') {
      if ((o.amount ?? 0) > 0) stamp(o.x, o.y, o.r * 0.85 + 10, 3) // stumps stay open
    } else if (o.kind === 'crag') {
      stamp(o.x, o.y, o.r * 0.85 + 10, 3) // bare rock climbs for no one
    } else if (isBuilding(o)) {
      if (o.kind === 'farm') continue // a field is walked straight across
      if ((o.kind === 'wall' || o.kind === 'gate') && !o.complete && (o.progress ?? 0) <= 0) continue // pegs
      const bits = o.kind === 'gate' ? (o.team === 0 ? 2 : o.team === 1 ? 1 : 3) : 3
      stamp(o.x, o.y, o.r * 0.85 + 10, bits)
      if (o.kind === 'gate' && o.complete) gates.push(o)
    }
  }
  // A gate has to leave a REAL hole for its own side, and it cannot do that
  // while the fence is being stamped around it: the posts either side spread
  // wider than the gap between them, so whether the gateway came out passable
  // depended on where its centre happened to fall against the 32px lattice —
  // half the time the fence closed over its own gate, A* found no way through,
  // and the walker set off straight into the palisade. So open the ground back
  // up afterwards, for the owner only.
  for (const gt of gates) {
    const mine = gt.team === 0 ? 1 : gt.team === 1 ? 2 : 3
    const r = GATE_OPEN_R
    const x0 = Math.max(0, Math.floor((gt.x - r) / NAV_CELL))
    const x1 = Math.min(w - 1, Math.floor((gt.x + r) / NAV_CELL))
    const y0 = Math.max(0, Math.floor((gt.y - r) / NAV_CELL))
    const y1 = Math.min(h - 1, Math.floor((gt.y + r) / NAV_CELL))
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (dist(gt.x, gt.y, cx * NAV_CELL + NAV_CELL / 2, cy * NAV_CELL + NAV_CELL / 2) > r) continue
        grid[cy * w + cx] &= ~mine
      }
    }
  }
  g.navDirty = false
}

function blockedCell(g: Game, bit: number, cx: number, cy: number): boolean {
  const n = g.nav!
  if (cx < 0 || cy < 0 || cx >= n.w || cy >= n.h) return true
  return (n.block[cy * n.w + cx] & bit) !== 0
}

export function navBlocked(g: Game, team: number, x: number, y: number): boolean {
  if (g.navDirty || !g.nav) rebuildNav(g)
  return blockedCell(g, bitFor(team), Math.floor(x / NAV_CELL), Math.floor(y / NAV_CELL))
}

// Is the straight walk from (x0,y0) to (x1,y1) free of standing terrain?
// `slack` ignores the final approach (the destination itself is often a tree
// to chop or a hall to enter); `maxDist` limits how far ahead we care — a
// walker only needs to see the next stretch, and repaths as the view changes.
export function lineClear(g: Game, team: number, x0: number, y0: number, x1: number, y1: number,
  slack = 70, maxDist = Infinity): boolean {
  if (g.navDirty || !g.nav) rebuildNav(g)
  const bit = bitFor(team)
  const d = Math.hypot(x1 - x0, y1 - y0)
  const usable = Math.min(d - slack, maxDist)
  if (usable <= 0) return true
  const steps = Math.ceil(usable / 12)
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * (usable / d)
    if (blockedCell(g, bit, Math.floor((x0 + (x1 - x0) * t) / NAV_CELL), Math.floor((y0 + (y1 - y0) * t) / NAV_CELL))) {
      return false
    }
  }
  return true
}

// nearest open cell to (cx,cy), searching outward ring by ring
function findOpen(g: Game, bit: number, cx: number, cy: number, maxR: number): { cx: number; cy: number } | null {
  if (!blockedCell(g, bit, cx, cy)) return { cx, cy }
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        if (!blockedCell(g, bit, cx + dx, cy + dy)) return { cx: cx + dx, cy: cy + dy }
      }
    }
  }
  return null
}

// A* over the grid: 8-way with no corner-cutting, octile heuristic, bounded
// effort. Returns smoothed world-coordinate waypoints, or null if there is
// no way through (the caller falls back to the old direct walk).
export function findPath(g: Game, team: number, sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] | null {
  if (g.navDirty || !g.nav) rebuildNav(g)
  const n = g.nav!
  const W = n.w, H = n.h, bit = bitFor(team)
  const s = findOpen(g, bit, Math.max(0, Math.min(W - 1, Math.floor(sx / NAV_CELL))),
    Math.max(0, Math.min(H - 1, Math.floor(sy / NAV_CELL))), 3)
  const t = findOpen(g, bit, Math.max(0, Math.min(W - 1, Math.floor(tx / NAV_CELL))),
    Math.max(0, Math.min(H - 1, Math.floor(ty / NAV_CELL))), 6)
  if (!s || !t) return null
  const startId = s.cy * W + s.cx
  const goalId = t.cy * W + t.cx
  if (startId === goalId) return [{ x: t.cx * NAV_CELL + NAV_CELL / 2, y: t.cy * NAV_CELL + NAV_CELL / 2 }]

  const gScore = new Map<number, number>()
  const cameFrom = new Map<number, number>()
  const hOf = (id: number) => {
    const dx = Math.abs((id % W) - t.cx), dy = Math.abs(Math.floor(id / W) - t.cy)
    return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy)
  }
  // binary heap of [f, id]
  const heap: [number, number][] = [[hOf(startId), startId]]
  const push = (f: number, id: number) => {
    heap.push([f, id])
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      const tmp = heap[p]; heap[p] = heap[i]; heap[i] = tmp
      i = p
    }
  }
  const pop = (): [number, number] => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1, r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        const tmp = heap[m]; heap[m] = heap[i]; heap[i] = tmp
        i = m
      }
    }
    return top
  }
  gScore.set(startId, 0)
  let found = false
  let explored = 0
  while (heap.length && explored < 6000) {
    const [, cur] = pop()
    if (cur === goalId) { found = true; break }
    explored++
    const cx = cur % W, cy = Math.floor(cur / W)
    const gCur = gScore.get(cur)!
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = cx + dx, ny = cy + dy
        if (blockedCell(g, bit, nx, ny)) continue
        // no cutting corners: a diagonal needs both shoulders free
        if (dx && dy && (blockedCell(g, bit, cx + dx, cy) || blockedCell(g, bit, cx, cy + dy))) continue
        const id = ny * W + nx
        const cost = gCur + (dx && dy ? 1.4142 : 1)
        if (cost < (gScore.get(id) ?? Infinity)) {
          gScore.set(id, cost)
          cameFrom.set(id, cur)
          push(cost + hOf(id), id)
        }
      }
    }
  }
  if (!found) return null
  // walk back, then string-pull so the route hugs no more corners than it must
  const cells: number[] = []
  for (let cur = goalId; cur !== startId; cur = cameFrom.get(cur)!) cells.push(cur)
  cells.reverse()
  const pts = cells.map(id => ({
    x: (id % W) * NAV_CELL + NAV_CELL / 2,
    y: Math.floor(id / W) * NAV_CELL + NAV_CELL / 2,
  }))
  const out: { x: number; y: number }[] = []
  let ax = sx, ay = sy
  let i = 0
  while (i < pts.length) {
    let j = i
    while (j + 1 < pts.length && lineClear(g, team, ax, ay, pts[j + 1].x, pts[j + 1].y, 0)) j++
    out.push(pts[j])
    ax = pts[j].x; ay = pts[j].y
    i = j + 1
  }
  return out
}
