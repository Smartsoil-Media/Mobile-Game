// Cosy storybook sprites, all drawn with canvas vector shapes.
import { Ent, TEAM_COLOR } from './data'

const SKIN = '#F6CFA0'
const WALL = '#F6E7C8'
const WALL_EDGE = '#D9C39B'
const ROOF = '#D9A85F'
const ROOF_DARK = '#C08F4B'
const WOOD = '#8B6A4A'
const WOOD_DARK = '#6F5238'

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Tilt the sprite toward its direction of travel. Caller must save/restore.
// The heading is mirrored onto the facing side so the lean is symmetric.
export function lean(ctx: CanvasRenderingContext2D, e: Ent, factor: number, cap: number): void {
  if (!e.stepped || e.heading === undefined) return
  const f = (e.face ?? 1) >= 0 ? 1 : -1
  const h = e.heading
  const rel = Math.atan2(Math.sin(h), f * Math.cos(h))
  const tilt = f * Math.max(-cap, Math.min(cap, rel * factor))
  ctx.translate(e.x, e.y)
  ctx.rotate(tilt)
  ctx.translate(-e.x, -e.y)
}

export function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(66, 84, 44, 0.18)'
  ctx.beginPath()
  ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2)
  ctx.fill()
}

// ---------- Resources ----------

export function drawTree(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  if ((e.amount ?? 0) <= 0) {
    // chopped: a cosy stump with growth rings and a stray leaf
    shadow(ctx, e.x, e.y + 3, 9, 3.6)
    ctx.fillStyle = WOOD
    rr(ctx, e.x - 6, e.y - 6, 12, 10, 3.5)
    ctx.fill()
    ctx.fillStyle = '#C89B6E'
    ctx.beginPath(); ctx.ellipse(e.x, e.y - 6, 6, 3.4, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#A8794F'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.ellipse(e.x, e.y - 6, 3.4, 1.8, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#85B168'
    ctx.beginPath(); ctx.ellipse(e.x + 8, e.y + 1, 2.8, 1.6, 0.5, 0, Math.PI * 2); ctx.fill()
    return
  }
  const sway = Math.sin(t * 0.8 + e.seed) * 1.6
  const full = (e.amount ?? 60) / 60
  const s = 0.75 + 0.25 * full
  shadow(ctx, e.x, e.y + 4, 15 * s, 6 * s)
  // trunk
  ctx.fillStyle = WOOD
  rr(ctx, e.x - 4, e.y - 14, 8, 18, 3.5)
  ctx.fill()
  // canopy: puffy overlapping circles
  const cy = e.y - 24 * s
  ctx.fillStyle = '#6D9552'
  for (const [ox, oy, r] of [[-9, 4, 10], [9, 4, 10], [0, -6, 12], [0, 5, 11]]) {
    ctx.beginPath(); ctx.arc(e.x + ox * s + sway * 0.4, cy + oy * s, r * s, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = '#85B168'
  for (const [ox, oy, r] of [[-6, -4, 8], [5, -6, 7.5], [-1, 2, 9]]) {
    ctx.beginPath(); ctx.arc(e.x + ox * s + sway, cy + oy * s - 2, r * s, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = '#9CC47E'
  ctx.beginPath(); ctx.arc(e.x - 4 * s + sway, cy - 8 * s, 5 * s, 0, Math.PI * 2); ctx.fill()
}

export function drawMine(ctx: CanvasRenderingContext2D, e: Ent): void {
  const left = Math.max(0, (e.amount ?? 500) / 500)
  if (left <= 0) {
    // mined out: a flat patch of grey rubble
    shadow(ctx, e.x, e.y + 6, 15, 5)
    ctx.fillStyle = '#B9AE95'
    for (const [ox, oy, r] of [[-8, 2, 5], [6, 4, 4.4], [0, -2, 5.5], [12, -1, 3.4], [-14, 4, 3]]) {
      ctx.beginPath(); ctx.ellipse(e.x + ox, e.y + oy, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = '#CFC4AC'
    for (const [ox, oy, r] of [[-4, 0, 3], [8, 1, 2.6], [2, 4, 2.4]]) {
      ctx.beginPath(); ctx.ellipse(e.x + ox, e.y + oy, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill()
    }
    return
  }
  // the mound shrinks as it's mined out
  const R = 34 * (0.55 + 0.45 * left)
  shadow(ctx, e.x, e.y + R * 0.55, R * 1.05, R * 0.4)
  ctx.fillStyle = '#B3A489'
  ctx.beginPath()
  ctx.ellipse(e.x, e.y, R, R * 0.72, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#C6B89D'
  ctx.beginPath()
  ctx.ellipse(e.x - R * 0.2, e.y - R * 0.25, R * 0.62, R * 0.42, -0.2, 0, Math.PI * 2)
  ctx.fill()
  // gold nuggets
  const nuggets = Math.max(2, Math.round(6 * left))
  ctx.fillStyle = '#E9B44C'
  for (let i = 0; i < nuggets; i++) {
    const a = (i / 6) * Math.PI * 2 + e.seed
    const nx = e.x + Math.cos(a) * R * 0.45
    const ny = e.y - 2 + Math.sin(a) * R * 0.3
    ctx.beginPath(); ctx.arc(nx, ny, 3.4, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = '#F5D584'
  ctx.beginPath(); ctx.arc(e.x + 3, e.y - R * 0.3, 2.4, 0, Math.PI * 2); ctx.fill()
}

export function drawBush(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  if ((e.amount ?? 0) <= 0) {
    // foraged out: bare twiggy shrub
    shadow(ctx, e.x, e.y + 3, 8, 3)
    ctx.strokeStyle = '#8A7458'
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.moveTo(e.x, e.y + 3); ctx.lineTo(e.x - 4, e.y - 6)
    ctx.moveTo(e.x, e.y + 3); ctx.lineTo(e.x + 1, e.y - 8)
    ctx.moveTo(e.x, e.y + 3); ctx.lineTo(e.x + 5, e.y - 5)
    ctx.stroke()
    ctx.fillStyle = '#9CB37E'
    ctx.beginPath(); ctx.ellipse(e.x + 5, e.y - 5, 2, 1.2, 0.4, 0, Math.PI * 2); ctx.fill()
    return
  }
  const sway = Math.sin(t * 0.9 + e.seed) * 0.8
  shadow(ctx, e.x, e.y + 4, 13, 5)
  // rounded shrub
  ctx.fillStyle = '#75A055'
  for (const [ox, oy, r] of [[-6, 0, 8], [6, 0, 8], [0, -4, 9]]) {
    ctx.beginPath(); ctx.arc(e.x + ox + sway * 0.4, e.y + oy, r, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = '#8CB56A'
  ctx.beginPath(); ctx.arc(e.x - 2 + sway, e.y - 5, 6.5, 0, Math.PI * 2); ctx.fill()
  // berries, thinning as the bush is picked
  const left = (e.amount ?? 120) / 120
  const berries = Math.max(2, Math.round(7 * left))
  ctx.fillStyle = '#C9525E'
  for (let i = 0; i < berries; i++) {
    const a = (i / 7) * Math.PI * 2 + e.seed
    ctx.beginPath()
    ctx.arc(e.x + Math.cos(a) * 7, e.y - 2 + Math.sin(a) * 5, 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#E58F8F'
  ctx.beginPath(); ctx.arc(e.x + 2, e.y - 6, 1.6, 0, Math.PI * 2); ctx.fill()
}

export function drawQuarry(ctx: CanvasRenderingContext2D, e: Ent): void {
  const left = Math.max(0, (e.amount ?? 350) / 350)
  if (left <= 0) {
    // quarried out: cool grey rubble
    shadow(ctx, e.x, e.y + 6, 14, 5)
    ctx.fillStyle = '#A8A395'
    for (const [ox, oy, r] of [[-7, 2, 4.6], [5, 4, 4], [1, -2, 5], [11, 0, 3]]) {
      ctx.beginPath(); ctx.ellipse(e.x + ox, e.y + oy, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = '#C2BDB0'
    for (const [ox, oy, r] of [[-3, 0, 2.8], [7, 2, 2.4]]) {
      ctx.beginPath(); ctx.ellipse(e.x + ox, e.y + oy, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill()
    }
    return
  }
  const R = 30 * (0.55 + 0.45 * left)
  shadow(ctx, e.x, e.y + R * 0.55, R * 1.05, R * 0.4)
  // grey angular rock pile
  ctx.fillStyle = '#A8A395'
  ctx.beginPath()
  ctx.ellipse(e.x, e.y, R, R * 0.7, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#BDB8AA'
  ctx.beginPath()
  ctx.moveTo(e.x - R * 0.55, e.y - R * 0.1)
  ctx.lineTo(e.x - R * 0.15, e.y - R * 0.62)
  ctx.lineTo(e.x + R * 0.35, e.y - R * 0.4)
  ctx.lineTo(e.x + R * 0.5, e.y + R * 0.05)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#D3CEC1'
  ctx.beginPath()
  ctx.moveTo(e.x - R * 0.15, e.y - R * 0.62)
  ctx.lineTo(e.x + R * 0.1, e.y - R * 0.55)
  ctx.lineTo(e.x - R * 0.05, e.y - R * 0.25)
  ctx.closePath()
  ctx.fill()
  // chisel marks
  ctx.strokeStyle = '#8F8A7C'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(e.x + R * 0.15, e.y + R * 0.15); ctx.lineTo(e.x + R * 0.35, e.y + R * 0.25)
  ctx.moveTo(e.x - R * 0.4, e.y + R * 0.2); ctx.lineTo(e.x - R * 0.22, e.y + R * 0.3)
  ctx.stroke()
}

// ---------- Buildings ----------

function chimneySmoke(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number): void {
  for (let i = 0; i < 3; i++) {
    const p = ((t * 0.35 + i / 3 + seed * 0.13) % 1)
    const a = (1 - p) * 0.32
    if (a <= 0.01) continue
    ctx.fillStyle = `rgba(250, 246, 235, ${a})`
    ctx.beginPath()
    ctx.arc(x + Math.sin((p * 5) + seed) * 4, y - p * 26, 3.5 + p * 5, 0, Math.PI * 2)
    ctx.fill()
  }
}

function flag(ctx: CanvasRenderingContext2D, x: number, y: number, team: number, t: number): void {
  const c = TEAM_COLOR[team] ?? TEAM_COLOR[0]
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 2.4
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 20); ctx.stroke()
  const wave = Math.sin(t * 3) * 1.6
  ctx.fillStyle = c.main
  ctx.beginPath()
  ctx.moveTo(x, y - 20)
  ctx.quadraticCurveTo(x + 8, y - 22 + wave, x + 15, y - 18 + wave)
  ctx.quadraticCurveTo(x + 8, y - 15 + wave, x, y - 12)
  ctx.closePath()
  ctx.fill()
}

export function drawTC(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 26, 52, 15)
  // walls
  ctx.fillStyle = WALL
  rr(ctx, x - 38, y - 16, 76, 44, 8); ctx.fill()
  ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 2; rr(ctx, x - 38, y - 16, 76, 44, 8); ctx.stroke()
  // timber cross-beams
  ctx.strokeStyle = '#E0CBA4'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(x - 20, y - 14); ctx.lineTo(x - 20, y + 26); ctx.moveTo(x + 20, y - 14); ctx.lineTo(x + 20, y + 26); ctx.stroke()
  // big friendly roof
  ctx.fillStyle = ROOF
  ctx.beginPath()
  ctx.moveTo(x - 48, y - 10)
  ctx.quadraticCurveTo(x - 46, y - 16, x - 40, y - 18)
  ctx.lineTo(x - 6, y - 46)
  ctx.quadraticCurveTo(x, y - 50, x + 6, y - 46)
  ctx.lineTo(x + 40, y - 18)
  ctx.quadraticCurveTo(x + 46, y - 16, x + 48, y - 10)
  ctx.quadraticCurveTo(x + 40, y - 6, x, y - 8)
  ctx.quadraticCurveTo(x - 40, y - 6, x - 48, y - 10)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = ROOF_DARK
  ctx.beginPath()
  ctx.moveTo(x - 48, y - 10); ctx.quadraticCurveTo(x - 40, y - 6, x, y - 8)
  ctx.quadraticCurveTo(x + 40, y - 6, x + 48, y - 10)
  ctx.quadraticCurveTo(x + 40, y - 2, x, y - 4)
  ctx.quadraticCurveTo(x - 40, y - 2, x - 48, y - 10)
  ctx.closePath(); ctx.fill()
  // door
  ctx.fillStyle = WOOD
  rr(ctx, x - 9, y + 6, 18, 22, 8); ctx.fill()
  ctx.fillStyle = '#E9B44C'
  ctx.beginPath(); ctx.arc(x + 4, y + 18, 1.8, 0, Math.PI * 2); ctx.fill()
  // bell arch in the gable — swings while villagers shelter inside
  ctx.fillStyle = '#FBEFD3'; ctx.beginPath(); ctx.arc(x, y - 24, 6, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = WOOD; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y - 24, 6, 0, Math.PI * 2); ctx.stroke()
  const ringing = (e.garrison ?? 0) > 0
  const swing = ringing ? Math.sin(t * 9) * 0.55 : 0
  ctx.save()
  ctx.translate(x, y - 28)
  ctx.rotate(swing)
  ctx.fillStyle = '#E9B44C'
  ctx.beginPath()
  ctx.moveTo(-3.2, 5.5)
  ctx.quadraticCurveTo(-3.4, 0.5, 0, 0)
  ctx.quadraticCurveTo(3.4, 0.5, 3.2, 5.5)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#B8842E'
  ctx.beginPath(); ctx.arc(0, 6.4, 1.4, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  // chimney
  ctx.fillStyle = '#B9977C'
  rr(ctx, x + 20, y - 44, 9, 16, 2.5); ctx.fill()
  chimneySmoke(ctx, x + 24.5, y - 46, t, e.seed)
  flag(ctx, x - 34, y - 22, e.team, t + e.seed)
}

export function drawHouse(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 15, 27, 9)
  ctx.fillStyle = WALL
  rr(ctx, x - 19, y - 8, 38, 24, 6); ctx.fill()
  ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 1.8; rr(ctx, x - 19, y - 8, 38, 24, 6); ctx.stroke()
  ctx.fillStyle = ROOF
  ctx.beginPath()
  ctx.moveTo(x - 25, y - 5)
  ctx.lineTo(x - 3, y - 25)
  ctx.quadraticCurveTo(x, y - 27, x + 3, y - 25)
  ctx.lineTo(x + 25, y - 5)
  ctx.quadraticCurveTo(x, y - 10, x - 25, y - 5)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = WOOD
  rr(ctx, x - 5, y + 3, 10, 13, 4.5); ctx.fill()
  ctx.fillStyle = '#B9977C'
  rr(ctx, x + 9, y - 22, 6, 11, 2); ctx.fill()
  chimneySmoke(ctx, x + 12, y - 24, t, e.seed)
}

export function drawBarracks(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  shadow(ctx, x, y + 21, 40, 12)
  ctx.fillStyle = WALL
  rr(ctx, x - 30, y - 12, 60, 34, 7); ctx.fill()
  ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 2; rr(ctx, x - 30, y - 12, 60, 34, 7); ctx.stroke()
  // roof
  ctx.fillStyle = c.dark
  ctx.beginPath()
  ctx.moveTo(x - 37, y - 8)
  ctx.lineTo(x - 4, y - 34)
  ctx.quadraticCurveTo(x, y - 37, x + 4, y - 34)
  ctx.lineTo(x + 37, y - 8)
  ctx.quadraticCurveTo(x, y - 14, x - 37, y - 8)
  ctx.closePath(); ctx.fill()
  // door
  ctx.fillStyle = WOOD
  rr(ctx, x - 8, y + 2, 16, 20, 7); ctx.fill()
  // shield sign
  ctx.fillStyle = c.main
  ctx.beginPath()
  ctx.arc(x - 18, y - 2, 6.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#FBF3E4'
  ctx.beginPath(); ctx.arc(x - 18, y - 2, 2.6, 0, Math.PI * 2); ctx.fill()
  // crossed sword sign
  ctx.strokeStyle = '#C7CCD4'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x + 13, y - 7); ctx.lineTo(x + 23, y + 3); ctx.moveTo(x + 23, y - 7); ctx.lineTo(x + 13, y + 3); ctx.stroke()
  flag(ctx, x + 28, y - 14, e.team, t + e.seed)
}

export function drawLumberCamp(ctx: CanvasRenderingContext2D, e: Ent): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 15, 28, 9)
  // open-sided shelter: two timber posts + sloped thatch roof
  ctx.strokeStyle = WOOD
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(x - 18, y + 12); ctx.lineTo(x - 18, y - 10)
  ctx.moveTo(x + 18, y + 12); ctx.lineTo(x + 18, y - 6)
  ctx.stroke()
  ctx.fillStyle = ROOF
  ctx.beginPath()
  ctx.moveTo(x - 27, y - 8)
  ctx.quadraticCurveTo(x, y - 22, x + 26, y - 4)
  ctx.lineTo(x + 22, y + 1)
  ctx.quadraticCurveTo(x, y - 15, x - 23, y - 2)
  ctx.closePath(); ctx.fill()
  // stacked cut logs under the roof
  ctx.fillStyle = WOOD
  for (const [ox, oy] of [[-8, 6], [0, 6], [8, 6], [-4, 0], [4, 0]]) {
    ctx.beginPath(); ctx.arc(x + ox, y + oy + 4, 4.2, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = '#C89B6E'
  for (const [ox, oy] of [[-8, 6], [0, 6], [8, 6], [-4, 0], [4, 0]]) {
    ctx.beginPath(); ctx.arc(x + ox, y + oy + 4, 2, 0, Math.PI * 2); ctx.fill()
  }
  // axe in a stump beside the shelter
  ctx.fillStyle = WOOD_DARK
  rr(ctx, x + 22, y + 8, 9, 7, 2.5); ctx.fill()
  ctx.save()
  ctx.translate(x + 26.5, y + 8)
  ctx.rotate(-0.6)
  ctx.strokeStyle = WOOD; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -9); ctx.stroke()
  ctx.fillStyle = '#C7CCD4'
  rr(ctx, -0.5, -12, 5, 3.4, 1.5); ctx.fill()
  ctx.restore()
}

export function drawMiningCamp(ctx: CanvasRenderingContext2D, e: Ent): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 15, 28, 9)
  // squat stone hut
  ctx.fillStyle = '#CFC4AC'
  rr(ctx, x - 18, y - 6, 36, 21, 6); ctx.fill()
  ctx.strokeStyle = '#B4A88D'; ctx.lineWidth = 1.8
  rr(ctx, x - 18, y - 6, 36, 21, 6); ctx.stroke()
  // stone texture dots
  ctx.fillStyle = '#BDB197'
  for (const [ox, oy] of [[-10, 2], [2, 8], [10, 0], [-3, -1]]) {
    ctx.beginPath(); ctx.ellipse(x + ox, y + oy, 3.4, 2.4, 0, 0, Math.PI * 2); ctx.fill()
  }
  // timber roof
  ctx.fillStyle = WOOD
  ctx.beginPath()
  ctx.moveTo(x - 23, y - 3)
  ctx.lineTo(x - 2, y - 19)
  ctx.quadraticCurveTo(x, y - 20.5, x + 2, y - 19)
  ctx.lineTo(x + 23, y - 3)
  ctx.quadraticCurveTo(x, y - 9, x - 23, y - 3)
  ctx.closePath(); ctx.fill()
  // doorway
  ctx.fillStyle = '#5F5343'
  rr(ctx, x - 5, y + 4, 10, 11, 4.5); ctx.fill()
  // gold crate beside the hut
  ctx.fillStyle = WOOD_DARK
  rr(ctx, x + 20, y + 6, 12, 9, 2); ctx.fill()
  ctx.fillStyle = '#E9B44C'
  for (const [ox, oy] of [[3, -1], [7, -2.5], [9, 0]]) {
    ctx.beginPath(); ctx.arc(x + 20 + ox, y + 6 + oy, 2.4, 0, Math.PI * 2); ctx.fill()
  }
  // crossed pickaxe sign on the wall
  ctx.strokeStyle = '#8A7458'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x - 14, y - 1); ctx.lineTo(x - 8, y + 5); ctx.stroke()
  ctx.strokeStyle = '#C7CCD4'
  ctx.beginPath(); ctx.arc(x - 13.5, y + 0.5, 4, -2.4, -0.6); ctx.stroke()
}

export function drawFarm(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  // tilled plot in a timber frame
  ctx.fillStyle = '#B08968'
  rr(ctx, x - 24, y - 15, 48, 32, 6); ctx.fill()
  ctx.strokeStyle = WOOD
  ctx.lineWidth = 3
  rr(ctx, x - 24, y - 15, 48, 32, 6); ctx.stroke()
  // furrow rows
  ctx.strokeStyle = '#9A7357'
  ctx.lineWidth = 2.4
  for (let i = 0; i < 4; i++) {
    const ry = y - 9 + i * 7
    ctx.beginPath()
    ctx.moveTo(x - 19, ry)
    ctx.quadraticCurveTo(x, ry + 1.5, x + 19, ry)
    ctx.stroke()
  }
  // little sprouts, swaying
  ctx.fillStyle = '#7FA95E'
  for (let i = 0; i < 8; i++) {
    const sx = x - 16 + (i % 4) * 10.5 + Math.sin(t * 1.4 + i + e.seed) * 0.7
    const sy = y - 6 + Math.floor(i / 4) * 14
    ctx.beginPath(); ctx.ellipse(sx, sy, 2.4, 3.2, 0, 0, Math.PI * 2); ctx.fill()
  }
  // corner post with a team pennant
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 2.4
  ctx.beginPath(); ctx.moveTo(x + 21, y - 13); ctx.lineTo(x + 21, y - 26); ctx.stroke()
  ctx.fillStyle = c.main
  ctx.beginPath()
  ctx.moveTo(x + 21, y - 26)
  ctx.lineTo(x + 30, y - 23.5)
  ctx.lineTo(x + 21, y - 21)
  ctx.closePath(); ctx.fill()
}

export function drawWatchtower(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  shadow(ctx, x, y + 13, 20, 8)
  // timber palisade body, slightly tapered (stone comes with the upgrade)
  ctx.fillStyle = '#A9855C'
  ctx.beginPath()
  ctx.moveTo(x - 15, y + 12)
  ctx.lineTo(x - 12, y - 26)
  ctx.lineTo(x + 12, y - 26)
  ctx.lineTo(x + 15, y + 12)
  ctx.quadraticCurveTo(x, y + 16, x - 15, y + 12)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 1.8
  ctx.stroke()
  // vertical plank seams
  ctx.strokeStyle = 'rgba(111, 82, 56, 0.55)'
  ctx.lineWidth = 1.4
  for (const ox of [-8, -2.5, 3, 8.5]) {
    ctx.beginPath()
    ctx.moveTo(x + ox, y - 25)
    ctx.lineTo(x + ox * 1.15, y + 12)
    ctx.stroke()
  }
  // cross-brace
  ctx.strokeStyle = WOOD
  ctx.lineWidth = 2.6
  ctx.beginPath()
  ctx.moveTo(x - 12, y + 9); ctx.lineTo(x + 12, y - 4)
  ctx.moveTo(x + 12, y + 9); ctx.lineTo(x - 12, y - 4)
  ctx.stroke()
  // arrow slit
  ctx.fillStyle = '#4A3413'
  rr(ctx, x - 1.6, y - 20, 3.2, 9, 1.6); ctx.fill()
  // timber balcony ring
  ctx.fillStyle = WOOD
  rr(ctx, x - 16, y - 32, 32, 8, 3); ctx.fill()
  ctx.fillStyle = WOOD_DARK
  for (const ox of [-13, -5, 3, 11]) rr(ctx, x + ox, y - 33.5, 2.4, 4, 1), ctx.fill()
  // garrison peeking over the parapet
  const inside = Math.min(e.garrison ?? 0, 3)
  for (let i = 0; i < inside; i++) {
    const hx = x - 8 + i * 8
    ctx.fillStyle = SKIN
    ctx.beginPath(); ctx.arc(hx, y - 35, 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = c.main
    ctx.beginPath(); ctx.arc(hx, y - 36.5, 3.1, Math.PI, 0); ctx.fill()
  }
  // pointed roof in team color
  ctx.fillStyle = c.dark
  ctx.beginPath()
  ctx.moveTo(x - 17, y - 38)
  ctx.quadraticCurveTo(x, y - 42, x + 17, y - 38)
  ctx.lineTo(x + 2.5, y - 58)
  ctx.quadraticCurveTo(x, y - 60, x - 2.5, y - 58)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = c.main
  ctx.beginPath()
  ctx.moveTo(x - 17, y - 38)
  ctx.quadraticCurveTo(x, y - 42, x + 17, y - 38)
  ctx.quadraticCurveTo(x, y - 46, x - 17, y - 38)
  ctx.closePath(); ctx.fill()
  flag(ctx, x, y - 58, e.team, t + e.seed)
}

export function drawSite(ctx: CanvasRenderingContext2D, e: Ent): void {
  // construction: wooden frame + rising walls with progress
  const x = e.x, y = e.y, w = e.r * 0.9
  shadow(ctx, x, y + e.r * 0.45, w, e.r * 0.28)
  const p = e.progress ?? 0
  // ground plot
  ctx.fillStyle = 'rgba(190, 165, 120, 0.5)'
  rr(ctx, x - w, y - w * 0.5, w * 2, w, 8); ctx.fill()
  // corner posts
  ctx.strokeStyle = WOOD
  ctx.lineWidth = 4
  for (const [ox, oy] of [[-w + 5, -w * 0.5 + 4], [w - 5, -w * 0.5 + 4]]) {
    ctx.beginPath(); ctx.moveTo(x + ox, y + oy + 8); ctx.lineTo(x + ox, y + oy - 14); ctx.stroke()
  }
  ctx.beginPath(); ctx.moveTo(x - w + 5, y - w * 0.5 - 8); ctx.lineTo(x + w - 5, y - w * 0.5 - 8); ctx.stroke()
  // rising wall
  if (p > 0.1) {
    ctx.fillStyle = WALL
    const h = (w * 0.9) * Math.min(1, p)
    rr(ctx, x - w + 8, y + w * 0.4 - h, (w - 8) * 2, h, 5); ctx.fill()
  }
  // progress ring
  ctx.strokeStyle = 'rgba(91, 70, 50, 0.25)'
  ctx.lineWidth = 5
  ctx.beginPath(); ctx.arc(x, y - e.r - 14, 10, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = '#E9B44C'
  ctx.beginPath(); ctx.arc(x, y - e.r - 14, 10, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke()
}

// ---------- Units ----------

function unitBase(ctx: CanvasRenderingContext2D, e: Ent, t: number): { bx: number; by: number; walk: number } {
  const moving = e.stepped === true
  const working = !moving && (e.state === 'gather' || e.state === 'build' || e.state === 'attack')
  const walk = Math.sin(t * 9 + (e.phase ?? 0))
  const bob = moving ? Math.abs(walk) * 2.2
    : working ? Math.abs(Math.sin(t * 5 + (e.phase ?? 0))) * 1.2
    : Math.sin(t * 2 + (e.phase ?? 0)) * 0.8
  shadow(ctx, e.x, e.y + 6, 9, 3.6)
  return { bx: e.x, by: e.y - bob, walk: moving ? walk : 0 }
}

export function drawVillager(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  const { bx, by, walk } = unitBase(ctx, e, t)
  const f = e.face ?? 1
  ctx.save()
  lean(ctx, e, 0.2, 0.25)
  // feet
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath(); ctx.ellipse(bx - 3.5, e.y + 4 + walk * 1.2, 2.6, 1.8, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(bx + 3.5, e.y + 4 - walk * 1.2, 2.6, 1.8, 0, 0, Math.PI * 2); ctx.fill()
  // body: rounded tunic in team color
  ctx.fillStyle = c.main
  ctx.beginPath()
  ctx.moveTo(bx - 6.5, by + 4)
  ctx.quadraticCurveTo(bx - 7.5, by - 6, bx, by - 7)
  ctx.quadraticCurveTo(bx + 7.5, by - 6, bx + 6.5, by + 4)
  ctx.quadraticCurveTo(bx, by + 7, bx - 6.5, by + 4)
  ctx.closePath(); ctx.fill()
  // head
  ctx.fillStyle = SKIN
  ctx.beginPath(); ctx.arc(bx, by - 11, 6, 0, Math.PI * 2); ctx.fill()
  // straw hat
  ctx.fillStyle = '#E8C97A'
  ctx.beginPath(); ctx.ellipse(bx, by - 14.5, 8, 3, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(bx, by - 15.5, 4.4, Math.PI, 0); ctx.fill()
  // eyes
  ctx.fillStyle = '#5A4632'
  ctx.beginPath(); ctx.arc(bx + f * 2, by - 10.5, 0.9, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(bx + f * 4.5, by - 10.5, 0.9, 0, Math.PI * 2); ctx.fill()
  // carrying something home
  if ((e.carry ?? 0) > 0) {
    if (e.carryRes === 'gold') {
      ctx.fillStyle = '#D9A85F'
      ctx.beginPath(); ctx.arc(bx - f * 7, by - 2, 4.4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#E9B44C'
      ctx.beginPath(); ctx.arc(bx - f * 7, by - 3.4, 2.2, 0, Math.PI * 2); ctx.fill()
    } else {
      ctx.save()
      ctx.translate(bx - f * 6, by - 4)
      ctx.rotate(f * 0.5)
      ctx.fillStyle = WOOD
      rr(ctx, -2.6, -6, 5.2, 12, 2.4); ctx.fill()
      ctx.fillStyle = '#C89B6E'
      ctx.beginPath(); ctx.ellipse(0, -6, 2.6, 1.4, 0, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
  }
  // working swing: little axe/pick bob when gathering or building
  if (e.state === 'gather' || e.state === 'build') {
    const swing = Math.sin(t * 10 + (e.phase ?? 0)) * 0.9
    ctx.save()
    ctx.translate(bx + f * 7, by - 3)
    ctx.rotate(f * (0.5 + swing * 0.55))
    ctx.strokeStyle = WOOD; ctx.lineWidth = 2.2
    ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, -7); ctx.stroke()
    ctx.fillStyle = '#C7CCD4'
    rr(ctx, -1, -10, f * 5.5, 3.6, 1.6); ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}

export function drawSwordsman(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  const { bx, by, walk } = unitBase(ctx, e, t)
  const f = e.face ?? 1
  ctx.save()
  lean(ctx, e, 0.2, 0.25)
  const striking = e.state === 'attack' && (e.cd ?? 0) > UNITS_CD_SWORD - 0.25
  const lunge = striking ? f * 3 : 0
  // feet
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath(); ctx.ellipse(bx - 3.8, e.y + 4.4 + walk * 1.2, 2.8, 2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(bx + 3.8, e.y + 4.4 - walk * 1.2, 2.8, 2, 0, 0, Math.PI * 2); ctx.fill()
  // body
  ctx.fillStyle = c.main
  ctx.beginPath()
  ctx.moveTo(bx - 7.5 + lunge, by + 4.6)
  ctx.quadraticCurveTo(bx - 8.5 + lunge, by - 6.5, bx + lunge, by - 8)
  ctx.quadraticCurveTo(bx + 8.5 + lunge, by - 6.5, bx + 7.5 + lunge, by + 4.6)
  ctx.quadraticCurveTo(bx + lunge, by + 8, bx - 7.5 + lunge, by + 4.6)
  ctx.closePath(); ctx.fill()
  // belt
  ctx.fillStyle = c.dark
  rr(ctx, bx - 7 + lunge, by + 0.5, 14, 3, 1.5); ctx.fill()
  // head + round helmet
  ctx.fillStyle = SKIN
  ctx.beginPath(); ctx.arc(bx + lunge, by - 12, 6.2, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#C7CCD4'
  ctx.beginPath(); ctx.arc(bx + lunge, by - 13.5, 6.4, Math.PI * 0.98, Math.PI * 2.02); ctx.fill()
  ctx.fillStyle = '#AEB4BF'
  rr(ctx, bx - 6.6 + lunge, by - 14.2, 13.2, 2.4, 1.2); ctx.fill()
  // plume
  ctx.fillStyle = c.main
  ctx.beginPath(); ctx.arc(bx + lunge, by - 19.5, 2.6, 0, Math.PI * 2); ctx.fill()
  // eyes
  ctx.fillStyle = '#5A4632'
  ctx.beginPath(); ctx.arc(bx + f * 2 + lunge, by - 11, 1, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(bx + f * 4.6 + lunge, by - 11, 1, 0, Math.PI * 2); ctx.fill()
  // round shield on the off-hand side
  ctx.fillStyle = c.dark
  ctx.beginPath(); ctx.arc(bx - f * 7.5 + lunge, by - 2, 5.4, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#FBF3E4'
  ctx.beginPath(); ctx.arc(bx - f * 7.5 + lunge, by - 2, 2, 0, Math.PI * 2); ctx.fill()
  // sword
  ctx.save()
  ctx.translate(bx + f * 7.5 + lunge, by - 2)
  ctx.rotate(f * (striking ? 1.15 : 0.45))
  ctx.strokeStyle = '#D7DBE2'; ctx.lineWidth = 2.6
  ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, -11); ctx.stroke()
  ctx.strokeStyle = '#E9B44C'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(-2.6, 0); ctx.lineTo(2.6, 0); ctx.stroke()
  ctx.restore()
  ctx.restore()
}

export function drawArcher(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  const { bx, by, walk } = unitBase(ctx, e, t)
  const f = e.face ?? 1
  const drawing = e.state === 'attack' && (e.cd ?? 0) > 1.2 // just loosed / drawing
  ctx.save()
  lean(ctx, e, 0.2, 0.25)
  // feet
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath(); ctx.ellipse(bx - 3.4, e.y + 4 + walk * 1.2, 2.5, 1.8, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(bx + 3.4, e.y + 4 - walk * 1.2, 2.5, 1.8, 0, 0, Math.PI * 2); ctx.fill()
  // body: slim tunic
  ctx.fillStyle = c.main
  ctx.beginPath()
  ctx.moveTo(bx - 6, by + 4)
  ctx.quadraticCurveTo(bx - 7, by - 6.5, bx, by - 7.5)
  ctx.quadraticCurveTo(bx + 7, by - 6.5, bx + 6, by + 4)
  ctx.quadraticCurveTo(bx, by + 7, bx - 6, by + 4)
  ctx.closePath(); ctx.fill()
  // quiver on the back
  ctx.save()
  ctx.translate(bx - f * 6.5, by - 4)
  ctx.rotate(f * 0.35)
  ctx.fillStyle = '#8B6A4A'
  rr(ctx, -2.2, -5, 4.4, 10, 2); ctx.fill()
  ctx.strokeStyle = '#F4E4C6'; ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(-1, -5); ctx.lineTo(-1, -8)
  ctx.moveTo(1.2, -5); ctx.lineTo(1.2, -8.5)
  ctx.stroke()
  ctx.restore()
  // head with a hood
  ctx.fillStyle = SKIN
  ctx.beginPath(); ctx.arc(bx, by - 11.5, 5.8, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = c.dark
  ctx.beginPath(); ctx.arc(bx, by - 12.5, 6, Math.PI * 0.9, Math.PI * 2.1); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(bx - f * 2, by - 18)
  ctx.quadraticCurveTo(bx - f * 7, by - 17, bx - f * 8, by - 13)
  ctx.quadraticCurveTo(bx - f * 5, by - 15.5, bx - f * 2.5, by - 16.5)
  ctx.closePath(); ctx.fill()
  // eyes
  ctx.fillStyle = '#5A4632'
  ctx.beginPath(); ctx.arc(bx + f * 1.8, by - 10.8, 0.9, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(bx + f * 4.2, by - 10.8, 0.9, 0, Math.PI * 2); ctx.fill()
  // bow held forward
  ctx.save()
  ctx.translate(bx + f * 7, by - 4)
  ctx.strokeStyle = WOOD
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.arc(0, 0, 8, -Math.PI / 2 + 0.25, Math.PI / 2 - 0.25)
  ctx.stroke()
  ctx.strokeStyle = '#F4E4C6'
  ctx.lineWidth = 1
  const pull = drawing ? -f * 3 : 0
  ctx.beginPath()
  ctx.moveTo(0.8, -7.5)
  ctx.lineTo(pull, 0)
  ctx.lineTo(0.8, 7.5)
  ctx.stroke()
  if (drawing) {
    ctx.strokeStyle = '#6F5238'
    ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.moveTo(pull, 0); ctx.lineTo(8, 0); ctx.stroke()
  }
  ctx.restore()
  ctx.restore()
}

export function drawArcheryRange(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  shadow(ctx, x, y + 19, 38, 11)
  // open training pavilion on the left
  ctx.fillStyle = WALL
  rr(ctx, x - 34, y - 8, 34, 28, 6); ctx.fill()
  ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 2
  rr(ctx, x - 34, y - 8, 34, 28, 6); ctx.stroke()
  ctx.fillStyle = ROOF
  ctx.beginPath()
  ctx.moveTo(x - 40, y - 5)
  ctx.lineTo(x - 19, y - 24)
  ctx.quadraticCurveTo(x - 17, y - 25.5, x - 15, y - 24)
  ctx.lineTo(x + 6, y - 5)
  ctx.quadraticCurveTo(x - 17, y - 10, x - 40, y - 5)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = WOOD
  rr(ctx, x - 22, y + 6, 10, 14, 4); ctx.fill()
  // fence rail toward the target lane
  ctx.strokeStyle = WOOD
  ctx.lineWidth = 2.6
  ctx.beginPath()
  ctx.moveTo(x + 2, y + 12); ctx.lineTo(x + 34, y + 12)
  ctx.moveTo(x + 8, y + 8); ctx.lineTo(x + 8, y + 16)
  ctx.moveTo(x + 22, y + 8); ctx.lineTo(x + 22, y + 16)
  ctx.stroke()
  // round straw target on a tripod
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.moveTo(x + 24, y + 4); ctx.lineTo(x + 20, y + 14)
  ctx.moveTo(x + 24, y + 4); ctx.lineTo(x + 28, y + 14)
  ctx.stroke()
  ctx.fillStyle = '#E8C97A'
  ctx.beginPath(); ctx.arc(x + 24, y - 4, 10, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#FBF3E4'
  ctx.beginPath(); ctx.arc(x + 24, y - 4, 6.6, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#C9525E'
  ctx.beginPath(); ctx.arc(x + 24, y - 4, 3.4, 0, Math.PI * 2); ctx.fill()
  // an arrow stuck in the target
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 1.8
  ctx.beginPath(); ctx.moveTo(x + 25, y - 5); ctx.lineTo(x + 31, y - 11); ctx.stroke()
  ctx.fillStyle = '#F4E4C6'
  ctx.beginPath(); ctx.arc(x + 31.5, y - 11.5, 1.6, 0, Math.PI * 2); ctx.fill()
  flag(ctx, x - 36, y - 12, e.team, t + e.seed)
}

const UNITS_CD_SWORD = 0.9

export function drawScout(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  const f = e.face ?? 1
  const moving = e.stepped === true
  const trot = moving ? Math.sin(t * 12 + (e.phase ?? 0)) : Math.sin(t * 2 + (e.phase ?? 0)) * 0.4
  const by = e.y - Math.abs(trot) * 2.4
  shadow(ctx, e.x, e.y + 6, 11, 4)
  ctx.save()
  lean(ctx, e, 0.45, 0.55) // the pony really points where it's trotting
  // pony legs
  ctx.strokeStyle = '#7A5C40'
  ctx.lineWidth = 2.6
  ctx.beginPath()
  ctx.moveTo(e.x - 5, by - 2); ctx.lineTo(e.x - 5 - trot * 2, e.y + 5)
  ctx.moveTo(e.x + 5, by - 2); ctx.lineTo(e.x + 5 + trot * 2, e.y + 5)
  ctx.stroke()
  // pony body: rounded little horse
  ctx.fillStyle = '#96714C'
  ctx.beginPath()
  ctx.ellipse(e.x, by - 4, 10, 6.5, 0, 0, Math.PI * 2)
  ctx.fill()
  // head + ears
  ctx.beginPath()
  ctx.ellipse(e.x + f * 10, by - 8, 4.6, 3.8, f * 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(e.x + f * 8, by - 11)
  ctx.lineTo(e.x + f * 9.5, by - 15)
  ctx.lineTo(e.x + f * 11.5, by - 11)
  ctx.closePath(); ctx.fill()
  // mane + tail
  ctx.fillStyle = '#6F5238'
  ctx.beginPath(); ctx.arc(e.x + f * 5.5, by - 9.5, 2.6, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath()
  ctx.ellipse(e.x - f * 10, by - 3 + trot, 2.2, 4.4, f * 0.5, 0, Math.PI * 2)
  ctx.fill()
  // saddle in team color
  ctx.fillStyle = c.main
  rr(ctx, e.x - 4.5, by - 9.5, 9, 4.5, 2); ctx.fill()
  // little rider
  ctx.fillStyle = c.main
  ctx.beginPath()
  ctx.moveTo(bxr(e.x, f) - 4.5, by - 10)
  ctx.quadraticCurveTo(bxr(e.x, f) - 5, by - 17, bxr(e.x, f), by - 18)
  ctx.quadraticCurveTo(bxr(e.x, f) + 5, by - 17, bxr(e.x, f) + 4.5, by - 10)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = SKIN
  ctx.beginPath(); ctx.arc(bxr(e.x, f), by - 20.5, 4.6, 0, Math.PI * 2); ctx.fill()
  // feathered cap
  ctx.fillStyle = c.dark
  ctx.beginPath(); ctx.arc(bxr(e.x, f), by - 22, 4.8, Math.PI * 0.95, Math.PI * 2.05); ctx.fill()
  ctx.strokeStyle = '#85B168'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(bxr(e.x, f) - f * 3, by - 25)
  ctx.quadraticCurveTo(bxr(e.x, f) - f * 6, by - 28, bxr(e.x, f) - f * 8, by - 26)
  ctx.stroke()
  // eyes
  ctx.fillStyle = '#5A4632'
  ctx.beginPath(); ctx.arc(bxr(e.x, f) + f * 1.5, by - 20, 0.8, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(bxr(e.x, f) + f * 3.4, by - 20, 0.8, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function bxr(x: number, f: number): number { return x - f * 1.5 }
