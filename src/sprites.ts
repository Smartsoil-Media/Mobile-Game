// Cosy storybook sprites, all drawn with canvas vector shapes.
import { Ent, TEAM_COLOR, BANNERS, KINGS_BANNER } from './data'

const SKIN = '#F6CFA0'
const WALL = '#F6E7C8'
const WALL_EDGE = '#D9C39B'
const ROOF = '#D9A85F'
const ROOF_DARK = '#C08F4B'
const WOOD = '#8B6A4A'
const WOOD_DARK = '#6F5238'
const TIMBER = '#DCBC8D'
const TIMBER_EDGE = '#B99460'
const STONE_FOOT = '#CFC4AC'
const STONE_FOOT_DOT = '#BDB197'

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

// Building walls wear their age: rough timber planks in the Dark Age,
// cream plaster on a stone footing once Feudal, dressed stone in the Castle Age.
function agedWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, age: number): void {
  if (age >= 3) {
    ctx.fillStyle = '#D9D4C4'
    rr(ctx, x, y, w, h, r); ctx.fill()
    ctx.strokeStyle = '#B4AE9B'; ctx.lineWidth = 2
    rr(ctx, x, y, w, h, r); ctx.stroke()
    // coursed stone blocks
    ctx.strokeStyle = 'rgba(140, 133, 112, 0.4)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let sy = y + 8; sy < y + h - 4; sy += 8) {
      ctx.moveTo(x + 2.5, sy)
      ctx.lineTo(x + w - 2.5, sy)
    }
    let stagger = false
    for (let sy = y + 2; sy < y + h - 4; sy += 8) {
      for (let sx = x + (stagger ? 12 : 7); sx < x + w - 5; sx += 11) {
        ctx.moveTo(sx, sy + 1.5)
        ctx.lineTo(sx, sy + 6.5)
      }
      stagger = !stagger
    }
    ctx.stroke()
    return
  }
  if (age >= 2) {
    ctx.fillStyle = WALL
    rr(ctx, x, y, w, h, r); ctx.fill()
    ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 2
    rr(ctx, x, y, w, h, r); ctx.stroke()
    // stone footing course along the base
    ctx.fillStyle = STONE_FOOT
    rr(ctx, x + 1, y + h - 7, w - 2, 7, 3.5); ctx.fill()
    ctx.fillStyle = STONE_FOOT_DOT
    for (let sx = x + 6; sx < x + w - 5; sx += 9) {
      ctx.beginPath(); ctx.ellipse(sx, y + h - 3.5, 2.6, 1.8, 0, 0, Math.PI * 2); ctx.fill()
    }
  } else {
    ctx.fillStyle = TIMBER
    rr(ctx, x, y, w, h, r); ctx.fill()
    ctx.strokeStyle = TIMBER_EDGE; ctx.lineWidth = 2
    rr(ctx, x, y, w, h, r); ctx.stroke()
    // vertical plank seams
    ctx.strokeStyle = 'rgba(139, 106, 74, 0.38)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let sx = x + 8; sx < x + w - 4; sx += 9) {
      ctx.moveTo(sx, y + 2.5)
      ctx.lineTo(sx, y + h - 2.5)
    }
    ctx.stroke()
  }
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
  const variant = e.seed % 3 // the woods are a mix: oaks, pines, and pale birches
  if (variant === 1) {
    // pine: a dark trunk under stacked green skirts
    ctx.fillStyle = WOOD_DARK
    rr(ctx, e.x - 3, e.y - 12, 6, 16, 2.5)
    ctx.fill()
    const tiers: [number, number][] = [[-8, 15], [-18, 12], [-27, 8.5]]
    for (let i = 0; i < tiers.length; i++) {
      const [oy, w] = tiers[i]
      ctx.fillStyle = i % 2 ? '#5E8A4E' : '#6D9552'
      ctx.beginPath()
      ctx.moveTo(e.x + sway * (0.3 + i * 0.25), e.y + (oy - 13) * s)
      ctx.lineTo(e.x - w * s, e.y + oy * s)
      ctx.lineTo(e.x + w * s, e.y + oy * s)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = '#85B168'
    ctx.beginPath(); ctx.arc(e.x + sway, e.y - 36 * s, 3.4 * s, 0, Math.PI * 2); ctx.fill()
    return
  }
  if (variant === 2) {
    // birch: pale dashed trunk, a lighter, smaller crown
    ctx.fillStyle = '#E6DCC8'
    rr(ctx, e.x - 3.4, e.y - 16, 6.8, 20, 3)
    ctx.fill()
    ctx.strokeStyle = 'rgba(90, 78, 60, 0.55)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(e.x - 2, e.y - 4); ctx.lineTo(e.x + 0.5, e.y - 4)
    ctx.moveTo(e.x + 0.5, e.y - 10); ctx.lineTo(e.x + 3, e.y - 10)
    ctx.moveTo(e.x - 3, e.y - 14); ctx.lineTo(e.x - 0.5, e.y - 14)
    ctx.stroke()
    const cy = e.y - 26 * s
    ctx.fillStyle = '#8CB56A'
    for (const [ox, oy, r] of [[-7, 2, 8], [7, 2, 8], [0, -4, 9.5]]) {
      ctx.beginPath(); ctx.arc(e.x + ox * s + sway * 0.5, cy + oy * s, r * s, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = '#AACD8C'
    ctx.beginPath(); ctx.arc(e.x - 3 * s + sway, cy - 6 * s, 5.5 * s, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#C4DCA8'
    ctx.beginPath(); ctx.arc(e.x + 4 * s + sway, cy - 3 * s, 3.4 * s, 0, Math.PI * 2); ctx.fill()
    return
  }
  // oak (the classic)
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

// a little fleur-de-lis, the French signature, at (x, y) roughly s tall
function fleur(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color = '#E9B44C'): void {
  ctx.fillStyle = color
  ctx.beginPath() // center petal
  ctx.moveTo(x, y - s)
  ctx.quadraticCurveTo(x + s * 0.34, y - s * 0.3, x, y + s * 0.28)
  ctx.quadraticCurveTo(x - s * 0.34, y - s * 0.3, x, y - s)
  ctx.fill()
  ctx.beginPath() // side petals curling out
  ctx.moveTo(x - s * 0.16, y - s * 0.1)
  ctx.quadraticCurveTo(x - s * 0.8, y - s * 0.55, x - s * 0.62, y + s * 0.16)
  ctx.quadraticCurveTo(x - s * 0.4, y + s * 0.3, x - s * 0.16, y + s * 0.12)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x + s * 0.16, y - s * 0.1)
  ctx.quadraticCurveTo(x + s * 0.8, y - s * 0.55, x + s * 0.62, y + s * 0.16)
  ctx.quadraticCurveTo(x + s * 0.4, y + s * 0.3, x + s * 0.16, y + s * 0.12)
  ctx.fill()
  ctx.fillRect(x - s * 0.34, y + s * 0.3, s * 0.68, s * 0.2) // the band
}

const SLATE = '#5B7BA6' // French rooftops wear the blue of the crown
const SLATE_DARK = '#48628A'

// Chamber of Commerce (French Feudal eco landmark): a fine merchants' hall —
// striped market awning, hanging coin sign, crates of goods, slate roof
export function drawChamberOfCommerce(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 22, 40, 12)
  agedWall(ctx, x - 30, y - 22, 60, 40, 6, 2)
  // slate roof
  ctx.fillStyle = SLATE
  ctx.beginPath()
  ctx.moveTo(x - 38, y - 20)
  ctx.lineTo(x, y - 44)
  ctx.lineTo(x + 38, y - 20)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = SLATE_DARK
  ctx.beginPath()
  ctx.moveTo(x - 38, y - 20)
  ctx.lineTo(x - 30, y - 20)
  ctx.lineTo(x + 2, y - 41)
  ctx.lineTo(x, y - 44)
  ctx.closePath()
  ctx.fill()
  fleur(ctx, x, y - 48, 5)
  // striped awning over the counter
  ctx.fillStyle = '#C9525E'
  ctx.beginPath()
  ctx.moveTo(x - 28, y - 8)
  ctx.lineTo(x - 2, y - 8)
  ctx.lineTo(x - 4, y - 1)
  ctx.lineTo(x - 26, y - 1)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#FBF3E4'
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.moveTo(x - 24 + i * 8, y - 8)
    ctx.lineTo(x - 20 + i * 8, y - 8)
    ctx.lineTo(x - 21.5 + i * 8, y - 1)
    ctx.lineTo(x - 25.5 + i * 8, y - 1)
    ctx.closePath()
    ctx.fill()
  }
  // door and hanging coin sign
  ctx.fillStyle = WOOD
  rr(ctx, x + 8, y + 2, 13, 16, 5)
  ctx.fill()
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.moveTo(x + 26, y - 6); ctx.lineTo(x + 26, y + 0.5); ctx.stroke()
  const sway = Math.sin(t * 1.4 + e.seed) * 1.4
  ctx.fillStyle = '#E9B44C'
  ctx.beginPath(); ctx.arc(x + 26 + sway, y + 4, 4.4, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#F5D584'
  ctx.beginPath(); ctx.arc(x + 26 + sway, y + 4, 2.4, 0, Math.PI * 2); ctx.fill()
  // crates of goods
  ctx.fillStyle = TIMBER
  rr(ctx, x - 40, y + 8, 11, 10, 2); ctx.fill()
  rr(ctx, x - 33, y + 1, 9, 8, 2); ctx.fill()
  ctx.strokeStyle = TIMBER_EDGE
  ctx.lineWidth = 1
  rr(ctx, x - 40, y + 8, 11, 10, 2); ctx.stroke()
  rr(ctx, x - 33, y + 1, 9, 8, 2); ctx.stroke()
}

// School of Cavalry (French Feudal military landmark): a long riding hall
// with paddock rails, a horse-head sign and the fleur flying high
export function drawCavalrySchool(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 26, 48, 13)
  agedWall(ctx, x - 40, y - 16, 80, 38, 6, 2)
  // twin slate roofs, the riding hall long and low
  ctx.fillStyle = SLATE
  ctx.beginPath()
  ctx.moveTo(x - 46, y - 14)
  ctx.lineTo(x - 18, y - 36)
  ctx.lineTo(x + 10, y - 14)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x + 2, y - 14)
  ctx.lineTo(x + 26, y - 32)
  ctx.lineTo(x + 48, y - 14)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = SLATE_DARK
  ctx.beginPath()
  ctx.moveTo(x - 46, y - 14)
  ctx.lineTo(x - 40, y - 14)
  ctx.lineTo(x - 15, y - 33.5)
  ctx.lineTo(x - 18, y - 36)
  ctx.closePath()
  ctx.fill()
  // wide stable door
  ctx.fillStyle = WOOD
  rr(ctx, x - 12, y + 2, 22, 20, 7)
  ctx.fill()
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(x - 1, y + 2); ctx.lineTo(x - 1, y + 22)
  ctx.stroke()
  // horse-head sign
  ctx.fillStyle = '#8B5A32'
  ctx.beginPath()
  ctx.ellipse(x - 26, y - 4, 4.6, 3.4, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(x - 29.5, y - 7.5, 2.4, 3.2, -0.7, 0, Math.PI * 2)
  ctx.fill()
  // paddock rails
  ctx.strokeStyle = TIMBER_EDGE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x + 22, y + 12); ctx.lineTo(x + 46, y + 12)
  ctx.moveTo(x + 22, y + 18); ctx.lineTo(x + 46, y + 18)
  ctx.moveTo(x + 26, y + 8); ctx.lineTo(x + 26, y + 22)
  ctx.moveTo(x + 42, y + 8); ctx.lineTo(x + 42, y + 22)
  ctx.stroke()
  // banner with the fleur
  const wave = Math.sin(t * 2 + e.seed) * 2
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x - 18, y - 36); ctx.lineTo(x - 18, y - 52); ctx.stroke()
  ctx.fillStyle = SLATE
  ctx.beginPath()
  ctx.moveTo(x - 18, y - 52)
  ctx.quadraticCurveTo(x - 6 + wave, y - 50, x - 2 + wave, y - 46)
  ctx.lineTo(x - 18, y - 44)
  ctx.closePath()
  ctx.fill()
  fleur(ctx, x - 11 + wave * 0.5, y - 48, 3.4, '#FBF3E4')
}

// Royal Vineyard (French Castle eco landmark): a stone villa over trellis
// rows heavy with grapes, barrels waiting by the door
export function drawRoyalVineyard(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 24, 42, 12)
  agedWall(ctx, x - 34, y - 24, 52, 34, 6, 3)
  ctx.fillStyle = SLATE
  ctx.beginPath()
  ctx.moveTo(x - 40, y - 22)
  ctx.lineTo(x - 8, y - 42)
  ctx.lineTo(x + 24, y - 22)
  ctx.closePath()
  ctx.fill()
  fleur(ctx, x - 8, y - 46, 4.6)
  // arched door and round window
  ctx.fillStyle = WOOD
  ctx.beginPath()
  ctx.arc(x - 8, y + 0, 6.5, Math.PI, 0)
  ctx.lineTo(x - 1.5, y + 10)
  ctx.lineTo(x - 14.5, y + 10)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#A8C6E0'
  ctx.beginPath(); ctx.arc(x - 8, y - 16, 3.4, 0, Math.PI * 2); ctx.fill()
  // trellis rows with grape clusters
  for (let row = 0; row < 2; row++) {
    const ry = y + 12 + row * 9
    ctx.strokeStyle = '#6F5238'
    ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.moveTo(x + 6, ry); ctx.lineTo(x + 44, ry); ctx.stroke()
    ctx.fillStyle = '#75A055'
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.ellipse(x + 11 + i * 10, ry - 1.5, 4, 2.6, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#7B5AA6'
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.arc(x + 10 + i * 10, ry + 2.4, 1.7, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(x + 13 + i * 10, ry + 2, 1.4, 0, Math.PI * 2); ctx.fill()
    }
  }
  // barrels by the door
  ctx.fillStyle = '#A8794F'
  rr(ctx, x - 32, y + 6, 9, 11, 3.5); ctx.fill()
  rr(ctx, x - 22, y + 9, 8, 9, 3); ctx.fill()
  ctx.strokeStyle = '#6F5238'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x - 32, y + 11.5); ctx.lineTo(x - 23, y + 11.5)
  ctx.moveTo(x - 22, y + 13.5); ctx.lineTo(x - 14, y + 13.5)
  ctx.stroke()
}

// The Red Palace (French Castle military landmark): a brick fortress tower,
// slate cone roof, fleur banner — bolts rain from its walls
export function drawRedPalace(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 20, 34, 11)
  // tapered brick tower
  ctx.fillStyle = '#B06A58'
  ctx.beginPath()
  ctx.moveTo(x - 24, y + 18)
  ctx.lineTo(x - 18, y - 46)
  ctx.lineTo(x + 18, y - 46)
  ctx.lineTo(x + 24, y + 18)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#8E5344'
  ctx.lineWidth = 2
  ctx.stroke()
  // brick coursing
  ctx.strokeStyle = 'rgba(120, 66, 52, 0.45)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  for (let sy = y + 8; sy > y - 42; sy -= 9) {
    const w = 24 - (y + 18 - sy) * 0.09
    ctx.moveTo(x - w + 2, sy)
    ctx.lineTo(x + w - 2, sy)
  }
  ctx.stroke()
  // arrow slits
  ctx.fillStyle = '#5E3A2E'
  for (const sy of [-30, -12, 4]) {
    rr(ctx, x - 1.8, y + sy, 3.6, 9, 1.8)
    ctx.fill()
  }
  // machicolated top + slate cone
  ctx.fillStyle = '#8E5344'
  rr(ctx, x - 22, y - 52, 44, 9, 3)
  ctx.fill()
  ctx.fillStyle = '#B06A58'
  for (let i = 0; i < 5; i++) {
    rr(ctx, x - 20 + i * 9, y - 57, 6, 6, 1.5)
    ctx.fill()
  }
  ctx.fillStyle = SLATE
  ctx.beginPath()
  ctx.moveTo(x - 16, y - 56)
  ctx.lineTo(x, y - 76)
  ctx.lineTo(x + 16, y - 56)
  ctx.closePath()
  ctx.fill()
  // fleur banner streaming from the peak
  const wave = Math.sin(t * 2.2 + e.seed) * 2.4
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x, y - 76); ctx.lineTo(x, y - 90); ctx.stroke()
  ctx.fillStyle = '#C9525E'
  ctx.beginPath()
  ctx.moveTo(x, y - 90)
  ctx.quadraticCurveTo(x + 12 + wave, y - 88, x + 16 + wave, y - 83)
  ctx.lineTo(x, y - 81)
  ctx.closePath()
  ctx.fill()
  fleur(ctx, x + 7 + wave * 0.5, y - 85.5, 3.2, '#FBF3E4')
  // arched door
  ctx.fillStyle = WOOD
  ctx.beginPath()
  ctx.arc(x, y + 8, 6.5, Math.PI, 0)
  ctx.lineTo(x + 6.5, y + 18)
  ctx.lineTo(x - 6.5, y + 18)
  ctx.closePath()
  ctx.fill()
}

// a rocky crag: an impassable outcrop rising from the meadow — terrain with
// a bit of storybook drama, sized by e.r (little sister rocks ride the same fn)
export function drawCrag(ctx: CanvasRenderingContext2D, e: Ent): void {
  const R = e.r
  const tilt = ((e.seed % 5) - 2) * 0.06
  shadow(ctx, e.x, e.y + R * 0.42, R * 1.15, R * 0.42)
  // a cosy pile of rounded boulders, lit from the upper left
  const boulder = (ox: number, oy: number, rx: number, ry: number, base: string, lit: string) => {
    ctx.fillStyle = base
    ctx.beginPath()
    ctx.ellipse(e.x + ox * R, e.y + oy * R, rx * R, ry * R, tilt, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = lit
    ctx.beginPath()
    ctx.ellipse(e.x + (ox - rx * 0.24) * R, e.y + (oy - ry * 0.3) * R, rx * R * 0.62, ry * R * 0.55, tilt, 0, Math.PI * 2)
    ctx.fill()
  }
  boulder(0.02, 0.02, 1.0, 0.66, '#9A968A', '#ADA99B') // the broad base
  boulder(-0.42, -0.42, 0.55, 0.46, '#A8A395', '#BCB7A8') // left shoulder
  boulder(0.4, -0.52, 0.48, 0.42, '#B0AB9C', '#C5C0B1') // right shoulder
  boulder(-0.02, -0.78, 0.4, 0.34, '#BCB7A8', '#D3CEC1') // the crown
  // a couple of cracks so the stone reads as stone
  ctx.strokeStyle = 'rgba(110, 105, 92, 0.55)'
  ctx.lineWidth = Math.max(1.2, R * 0.045)
  ctx.beginPath()
  ctx.moveTo(e.x - R * 0.2, e.y - R * 0.45)
  ctx.quadraticCurveTo(e.x - R * 0.1, e.y - R * 0.2, e.x - R * 0.24, e.y + R * 0.05)
  ctx.moveTo(e.x + R * 0.35, e.y - R * 0.3)
  ctx.quadraticCurveTo(e.x + R * 0.44, e.y - R * 0.08, e.x + R * 0.32, e.y + R * 0.12)
  ctx.stroke()
  // grass tucked around the foot
  ctx.fillStyle = '#7AA058'
  for (const [ox, oy, rr] of [[-0.88, 0.34, 0.16], [-0.15, 0.46, 0.13], [0.55, 0.4, 0.15], [0.92, 0.26, 0.11]] as [number, number, number][]) {
    ctx.beginPath()
    ctx.ellipse(e.x + ox * R, e.y + oy * R, rr * R + 3, (rr * R + 3) * 0.55, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

// a crocodile: lurking mostly-submerged in the water (eyes, nostrils and a
// ridge of scutes above the ripples), hauled out long and low on the bank,
// and belly-up once three brave villagers have had their say
export function drawCroc(ctx: CanvasRenderingContext2D, e: Ent, t: number, submerged = false): void {
  const f = (e.face ?? 1) >= 0 ? 1 : -1
  const DARK = '#4E7434'
  const HIDE = '#6B8F53'
  const BELLY = '#C9C29B'
  if (e.hp <= 0) {
    // down: rolled over in the shallows, harvested gently
    const left = Math.max(0.45, (e.amount ?? 130) / 130)
    shadow(ctx, e.x, e.y + 4, 16 * left + 2, 4.5)
    ctx.fillStyle = BELLY
    ctx.beginPath(); ctx.ellipse(e.x, e.y - 3, 15 * left + 2, 6 * left + 1, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = HIDE
    ctx.beginPath(); ctx.ellipse(e.x + 12 * f * left, e.y - 3, 5.5, 3, 0.1 * f, 0, Math.PI * 2); ctx.fill()
    // stubby legs skyward
    ctx.strokeStyle = HIDE
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(e.x - 6 * f * left, e.y - 8); ctx.lineTo(e.x - 7 * f * left, e.y - 12)
    ctx.moveTo(e.x + 2 * f * left, e.y - 8); ctx.lineTo(e.x + 3 * f * left, e.y - 12)
    ctx.stroke()
    ctx.strokeStyle = '#3E5C2A'
    ctx.lineWidth = 1.1
    ctx.beginPath() // a peacefully closed eye
    ctx.moveTo(e.x + 11 * f * left, e.y - 4.5); ctx.lineTo(e.x + 13.5 * f * left, e.y - 4.5)
    ctx.stroke()
    return
  }
  const wag = Math.sin(t * 3 + (e.phase ?? 0)) * 3
  if (submerged) {
    // just the tell-tale bits above the waterline
    ctx.strokeStyle = 'rgba(240, 248, 252, 0.45)'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.ellipse(e.x, e.y, 20 + Math.sin(t * 1.6 + (e.phase ?? 0)) * 2.5, 7, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(e.x, e.y, 28 + Math.sin(t * 1.6 + 1.4 + (e.phase ?? 0)) * 3, 10.5, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = HIDE
    // eye knobs + snout tip + a ridge of scutes trailing behind
    ctx.beginPath(); ctx.ellipse(e.x + 8 * f, e.y - 1.5, 3, 2.4, 0, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(e.x + 3.5 * f, e.y - 1.8, 2.7, 2.2, 0, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(e.x + 13.5 * f, e.y, 2.4, 1.7, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = DARK
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.ellipse(e.x - (3 + i * 6) * f + wag * i * 0.2, e.y + 0.5, 2.6, 1.6, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#F6E7A0'
    ctx.beginPath(); ctx.arc(e.x + 7 * f, e.y - 2.6, 1, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(e.x + 4.5 * f, e.y - 2.8, 0.9, 0, Math.PI * 2); ctx.fill()
    return
  }
  // hauled out on the bank
  const biting = (e.cd ?? 0) > 1.2 * 0.6 // jaws still wide from the last snap
  shadow(ctx, e.x, e.y + 4, 20, 5)
  // tail, swishing
  ctx.fillStyle = HIDE
  ctx.beginPath()
  ctx.moveTo(e.x - 8 * f, e.y - 6)
  ctx.quadraticCurveTo(e.x - 20 * f, e.y - 7 + wag, e.x - 26 * f, e.y - 2 + wag)
  ctx.quadraticCurveTo(e.x - 19 * f, e.y + 1 + wag * 0.5, e.x - 8 * f, e.y + 1)
  ctx.closePath()
  ctx.fill()
  // body
  ctx.fillStyle = HIDE
  ctx.beginPath(); ctx.ellipse(e.x, e.y - 4, 13, 5.5, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = BELLY
  ctx.beginPath(); ctx.ellipse(e.x, e.y - 1.5, 11, 2.8, 0, 0, Math.PI * 2); ctx.fill()
  // stubby legs
  ctx.strokeStyle = DARK
  ctx.lineWidth = 2.4
  ctx.beginPath()
  ctx.moveTo(e.x - 7 * f, e.y - 2); ctx.lineTo(e.x - 9 * f, e.y + 3)
  ctx.moveTo(e.x + 5 * f, e.y - 2); ctx.lineTo(e.x + 3 * f, e.y + 3)
  ctx.stroke()
  // head and jaws
  if (biting) {
    ctx.fillStyle = HIDE
    ctx.beginPath() // upper jaw thrown open
    ctx.moveTo(e.x + 9 * f, e.y - 7)
    ctx.lineTo(e.x + 22 * f, e.y - 13)
    ctx.lineTo(e.x + 21 * f, e.y - 8)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath() // lower jaw
    ctx.moveTo(e.x + 9 * f, e.y - 5)
    ctx.lineTo(e.x + 22 * f, e.y - 2)
    ctx.lineTo(e.x + 10 * f, e.y - 1)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#FBF3E4' // teeth
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.arc(e.x + (12 + i * 3.4) * f, e.y - 8.5 - i * 1.1, 0.9, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    ctx.fillStyle = HIDE
    ctx.beginPath(); ctx.ellipse(e.x + 14 * f, e.y - 5, 7.5, 3, 0.05 * f, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = DARK
    ctx.lineWidth = 1
    ctx.beginPath() // the long smiling jaw line
    ctx.moveTo(e.x + 8 * f, e.y - 4)
    ctx.quadraticCurveTo(e.x + 15 * f, e.y - 3, e.x + 20.5 * f, e.y - 4.4)
    ctx.stroke()
    ctx.fillStyle = DARK // nostril
    ctx.beginPath(); ctx.arc(e.x + 20 * f, e.y - 6.4, 0.9, 0, Math.PI * 2); ctx.fill()
  }
  // eye
  ctx.fillStyle = '#F6E7A0'
  ctx.beginPath(); ctx.arc(e.x + 10.5 * f, e.y - 7.2, 1.6, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#2E2213'
  ctx.beginPath(); ctx.arc(e.x + 10.9 * f, e.y - 7.2, 0.8, 0, Math.PI * 2); ctx.fill()
  // scutes down the spine
  ctx.fillStyle = DARK
  for (let i = 0; i < 4; i++) {
    const sx = e.x + (4 - i * 5) * f
    ctx.beginPath()
    ctx.moveTo(sx - 1.6, e.y - 8)
    ctx.lineTo(sx, e.y - 10.6)
    ctx.lineTo(sx + 1.6, e.y - 8)
    ctx.closePath()
    ctx.fill()
  }
}

// a shy little deer — and, once brought down, a quiet bundle in the grass
export function drawDeer(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const f = (e.face ?? 1) >= 0 ? 1 : -1
  if (e.hp <= 0) {
    // down: curled up asleep-forever, harvested gently
    const left = Math.max(0.4, (e.amount ?? 90) / 90)
    shadow(ctx, e.x, e.y + 3, 12 * left + 2, 4)
    ctx.fillStyle = '#C99B62'
    ctx.beginPath(); ctx.ellipse(e.x, e.y - 3, 11 * left + 1, 6.5 * left + 0.5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#B8874E'
    ctx.beginPath(); ctx.ellipse(e.x + 6 * f * left, e.y - 4, 4.4, 3.6, 0.2 * f, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#8A6538'
    ctx.lineWidth = 1.1
    ctx.beginPath() // a closed, restful eye
    ctx.arc(e.x + 7 * f * left, e.y - 4.5, 1.6, f > 0 ? 0.2 : Math.PI - 1.2, f > 0 ? 1.2 : Math.PI - 0.2)
    ctx.stroke()
    ctx.fillStyle = '#F3E7CE'
    ctx.beginPath(); ctx.ellipse(e.x - 8 * f * left, e.y - 2, 2.6, 2, 0, 0, Math.PI * 2); ctx.fill()
    return
  }
  const step = e.stepped ? Math.sin(t * 9 + (e.phase ?? 0)) : 0
  const bob = e.stepped ? Math.abs(Math.sin(t * 9 + (e.phase ?? 0))) * 1.2 : Math.sin(t * 1.6 + (e.phase ?? 0)) * 0.5
  shadow(ctx, e.x, e.y + 4, 11, 4)
  ctx.save()
  ctx.translate(0, -bob)
  // slender legs, trotting when on the move
  ctx.strokeStyle = '#A57B45'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(e.x - 6 * f, e.y - 6); ctx.lineTo(e.x - 6 * f + step * 2, e.y + 4)
  ctx.moveTo(e.x - 2 * f, e.y - 6); ctx.lineTo(e.x - 2 * f - step * 2, e.y + 4)
  ctx.moveTo(e.x + 3 * f, e.y - 6); ctx.lineTo(e.x + 3 * f + step * 1.6, e.y + 4)
  ctx.moveTo(e.x + 6 * f, e.y - 6); ctx.lineTo(e.x + 6 * f - step * 1.6, e.y + 4)
  ctx.stroke()
  // body
  ctx.fillStyle = '#C99B62'
  ctx.beginPath(); ctx.ellipse(e.x, e.y - 9, 9.5, 6, 0, 0, Math.PI * 2); ctx.fill()
  // white rump patch + flick of tail
  ctx.fillStyle = '#F3E7CE'
  ctx.beginPath(); ctx.ellipse(e.x - 8 * f, e.y - 9, 3, 3.6, 0, 0, Math.PI * 2); ctx.fill()
  // neck and head
  ctx.fillStyle = '#C99B62'
  ctx.beginPath(); ctx.ellipse(e.x + 8 * f, e.y - 15, 3.4, 4.6, 0.5 * f, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(e.x + 10 * f, e.y - 19, 3.8, 3.2, 0.2 * f, 0, Math.PI * 2); ctx.fill()
  // muzzle, ear, eye
  ctx.fillStyle = '#B8874E'
  ctx.beginPath(); ctx.ellipse(e.x + 13.4 * f, e.y - 18, 1.8, 1.4, 0.2 * f, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#C99B62'
  ctx.beginPath(); ctx.ellipse(e.x + 7.6 * f, e.y - 22.5, 1.6, 2.6, -0.5 * f, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#F3E7CE'
  ctx.beginPath(); ctx.ellipse(e.x + 7.6 * f, e.y - 22.2, 0.8, 1.4, -0.5 * f, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#4A3413'
  ctx.beginPath(); ctx.arc(e.x + 10.6 * f, e.y - 19.5, 1.1, 0, Math.PI * 2); ctx.fill()
  // little antlers on the bucks
  if (e.seed % 2 === 0) {
    ctx.strokeStyle = '#8A6538'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(e.x + 9.5 * f, e.y - 22); ctx.lineTo(e.x + 8.5 * f, e.y - 26); ctx.lineTo(e.x + 6.5 * f, e.y - 27.5)
    ctx.moveTo(e.x + 8.5 * f, e.y - 26); ctx.lineTo(e.x + 10 * f, e.y - 28)
    ctx.stroke()
  }
  // dappled back
  ctx.fillStyle = 'rgba(243, 231, 206, 0.75)'
  for (const [ox, oy] of [[-3, -12], [1, -10.5], [-6, -10]]) {
    ctx.beginPath(); ctx.arc(e.x + ox * f, e.y + oy, 1, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
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

// A hall that sends its recruits to another banner flies that banner's colours,
// so the whole routing of your village can be read off the rooftops.
function bannerTint(e: Ent): string | undefined {
  const b = e.recruitBanner
  return e.team === 0 && b !== undefined && b !== KINGS_BANNER ? BANNERS[b].color : undefined
}
function flag(ctx: CanvasRenderingContext2D, x: number, y: number, team: number, t: number, tint?: string): void {
  const c = TEAM_COLOR[team] ?? TEAM_COLOR[0]
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 2.4
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 20); ctx.stroke()
  const wave = Math.sin(t * 3) * 1.6
  ctx.fillStyle = tint ?? c.main
  ctx.beginPath()
  ctx.moveTo(x, y - 20)
  ctx.quadraticCurveTo(x + 8, y - 22 + wave, x + 15, y - 18 + wave)
  ctx.quadraticCurveTo(x + 8, y - 15 + wave, x, y - 12)
  ctx.closePath()
  ctx.fill()
}

export function drawTC(ctx: CanvasRenderingContext2D, e: Ent, t: number, age = 2): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 26, 52, 15)
  // walls wear the age: planks first, plaster on stone once Feudal
  agedWall(ctx, x - 38, y - 16, 76, 44, 8, age)
  if (age >= 2) {
    // timber framing reads well on plaster
    ctx.strokeStyle = '#E0CBA4'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x - 20, y - 14); ctx.lineTo(x - 20, y + 19); ctx.moveTo(x + 20, y - 14); ctx.lineTo(x + 20, y + 19); ctx.stroke()
  }
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

export function drawHouse(ctx: CanvasRenderingContext2D, e: Ent, t: number, age = 2): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 15, 27, 9)
  agedWall(ctx, x - 19, y - 8, 38, 24, 6, age)
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

export function drawBarracks(ctx: CanvasRenderingContext2D, e: Ent, t: number, age = 2): void {
  const x = e.x, y = e.y
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  shadow(ctx, x, y + 21, 40, 12)
  agedWall(ctx, x - 30, y - 12, 60, 34, 7, age)
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
  flag(ctx, x + 28, y - 14, e.team, t + e.seed, bannerTint(e))
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

export function drawWall(ctx: CanvasRenderingContext2D, e: Ent): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 7, 9, 3.5)
  // two lashed palisade posts with pointed tops
  const lean1 = (e.seed % 3) - 1
  for (const [ox, h, col] of [[-4, 17 + (e.seed % 4), WOOD], [4, 19 + (e.seed % 3), '#96754F']] as [number, number, string][]) {
    ctx.fillStyle = col
    rr(ctx, x + ox - 3.2 + lean1 * 0.4, y + 8 - h, 6.4, h, 2.5); ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x + ox - 3.2, y + 9 - h)
    ctx.lineTo(x + ox + lean1 * 0.6, y + 4 - h)
    ctx.lineTo(x + ox + 3.2, y + 9 - h)
    ctx.closePath(); ctx.fill()
  }
  // rope lashing across the pair
  ctx.strokeStyle = '#6F5238'
  ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.moveTo(x - 7.4, y - 3); ctx.lineTo(x + 7.4, y - 4.5); ctx.stroke()
}

export function drawGate(ctx: CanvasRenderingContext2D, e: Ent, t: number, open = false): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 10, 17, 5)
  // heavy end posts
  for (const ox of [-13, 13]) {
    ctx.fillStyle = WOOD
    rr(ctx, x + ox - 3.5, y - 15, 7, 26, 2.5); ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x + ox - 3.5, y - 14)
    ctx.lineTo(x + ox, y - 19.5)
    ctx.lineTo(x + ox + 3.5, y - 14)
    ctx.closePath(); ctx.fill()
  }
  // lintel beam
  ctx.fillStyle = WOOD_DARK
  rr(ctx, x - 16, y - 14.5, 32, 5, 2); ctx.fill()
  if (open) {
    // doors swung back against the posts — friends pass freely
    ctx.fillStyle = '#A9855C'
    rr(ctx, x - 12.6, y - 8, 4, 18, 1.5); ctx.fill()
    rr(ctx, x + 8.6, y - 8, 4, 18, 1.5); ctx.fill()
  } else {
    // closed planked doors with cross-braces
    ctx.fillStyle = '#A9855C'
    rr(ctx, x - 9.6, y - 9, 9.2, 19, 2); ctx.fill()
    rr(ctx, x + 0.4, y - 9, 9.2, 19, 2); ctx.fill()
    ctx.strokeStyle = WOOD_DARK; ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(x - 8.6, y - 7.5); ctx.lineTo(x - 1.4, y + 8.5)
    ctx.moveTo(x - 1.4, y - 7.5); ctx.lineTo(x - 8.6, y + 8.5)
    ctx.moveTo(x + 1.4, y - 7.5); ctx.lineTo(x + 8.6, y + 8.5)
    ctx.moveTo(x + 8.6, y - 7.5); ctx.lineTo(x + 1.4, y + 8.5)
    ctx.stroke()
  }
}

// ---------- Landmarks ----------

export function drawAbbeyMill(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 18, 32, 10)
  // abbey hall: cream with arched windows
  ctx.fillStyle = WALL
  rr(ctx, x - 26, y - 12, 44, 32, 7); ctx.fill()
  ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 2
  rr(ctx, x - 26, y - 12, 44, 32, 7); ctx.stroke()
  ctx.fillStyle = '#8FB2D6'
  for (const ox of [-16, -4, 8]) {
    ctx.beginPath()
    ctx.moveTo(x + ox - 2.6, y + 2)
    ctx.lineTo(x + ox - 2.6, y - 4)
    ctx.quadraticCurveTo(x + ox, y - 7.5, x + ox + 2.6, y - 4)
    ctx.lineTo(x + ox + 2.6, y + 2)
    ctx.closePath(); ctx.fill()
  }
  // steep roof with a little bell gable
  ctx.fillStyle = ROOF
  ctx.beginPath()
  ctx.moveTo(x - 32, y - 9)
  ctx.lineTo(x - 4, y - 30)
  ctx.quadraticCurveTo(x - 2, y - 31.5, x, y - 30)
  ctx.lineTo(x + 24, y - 9)
  ctx.quadraticCurveTo(x - 4, y - 15, x - 32, y - 9)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#FBEFD3'
  ctx.beginPath(); ctx.arc(x - 3, y - 24, 4.4, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = WOOD; ctx.lineWidth = 1.4
  ctx.beginPath(); ctx.arc(x - 3, y - 24, 4.4, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#E9B44C'
  ctx.beginPath(); ctx.arc(x - 3, y - 23.2, 2, 0, Math.PI * 2); ctx.fill()
  // the mill wing: small tower + turning sails
  ctx.fillStyle = TIMBER
  ctx.beginPath()
  ctx.moveTo(x + 18, y + 20); ctx.lineTo(x + 21, y - 6)
  ctx.lineTo(x + 31, y - 6); ctx.lineTo(x + 34, y + 20)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = TIMBER_EDGE; ctx.lineWidth = 1.8; ctx.stroke()
  const hub = { x: x + 26, y: y - 10 }
  ctx.save()
  ctx.translate(hub.x, hub.y)
  ctx.rotate(t * 0.45 + (e.seed % 5))
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2)
    ctx.strokeStyle = WOOD_DARK; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -15); ctx.stroke()
    ctx.fillStyle = 'rgba(251, 243, 228, 0.92)'
    rr(ctx, 0.5, -15, 4.5, 11, 1.8); ctx.fill()
  }
  ctx.restore()
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath(); ctx.arc(hub.x, hub.y, 2.4, 0, Math.PI * 2); ctx.fill()
}

export function drawKingsBarracks(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  shadow(ctx, x, y + 22, 42, 12)
  // stout stone-based hall
  ctx.fillStyle = '#CFC4AC'
  rr(ctx, x - 32, y + 8, 64, 14, 5); ctx.fill()
  ctx.fillStyle = WALL
  rr(ctx, x - 32, y - 14, 64, 26, 7); ctx.fill()
  ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 2
  rr(ctx, x - 32, y - 14, 64, 22, 7); ctx.stroke()
  // twin-peaked roof in royal color
  ctx.fillStyle = c.dark
  ctx.beginPath()
  ctx.moveTo(x - 38, y - 10)
  ctx.lineTo(x - 16, y - 30)
  ctx.lineTo(x + 4, y - 10)
  ctx.quadraticCurveTo(x - 16, y - 15, x - 38, y - 10)
  ctx.closePath(); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x - 2, y - 10)
  ctx.lineTo(x + 18, y - 30)
  ctx.lineTo(x + 38, y - 10)
  ctx.quadraticCurveTo(x + 18, y - 15, x - 2, y - 10)
  ctx.closePath(); ctx.fill()
  // great door + crown sign
  ctx.fillStyle = WOOD
  rr(ctx, x - 9, y + 2, 18, 20, 7); ctx.fill()
  ctx.fillStyle = '#E9B44C'
  ctx.beginPath()
  ctx.moveTo(x - 20, y - 2)
  ctx.lineTo(x - 20, y - 8); ctx.lineTo(x - 17.5, y - 4.5); ctx.lineTo(x - 15, y - 9)
  ctx.lineTo(x - 12.5, y - 4.5); ctx.lineTo(x - 10, y - 8); ctx.lineTo(x - 10, y - 2)
  ctx.closePath(); ctx.fill()
  // crossed halberds sign
  ctx.strokeStyle = '#8B6A4A'; ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x + 12, y - 6); ctx.lineTo(x + 24, y + 4)
  ctx.moveTo(x + 24, y - 6); ctx.lineTo(x + 12, y + 4)
  ctx.stroke()
  flag(ctx, x - 16, y - 26, e.team, t + e.seed, bannerTint(e))
  flag(ctx, x + 18, y - 26, e.team, t + e.seed + 2, bannerTint(e))
}

export function drawGuildhall(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 20, 34, 11)
  // tall half-timbered hall
  ctx.fillStyle = WALL
  rr(ctx, x - 24, y - 22, 48, 42, 7); ctx.fill()
  ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 2
  rr(ctx, x - 24, y - 22, 48, 42, 7); ctx.stroke()
  ctx.strokeStyle = '#B98E5A'; ctx.lineWidth = 2.4
  ctx.beginPath()
  ctx.moveTo(x - 22, y - 8); ctx.lineTo(x + 22, y - 8)
  ctx.moveTo(x - 14, y - 21); ctx.lineTo(x - 14, y - 8)
  ctx.moveTo(x + 14, y - 21); ctx.lineTo(x + 14, y - 8)
  ctx.moveTo(x - 22, y - 8); ctx.lineTo(x - 10, y + 18)
  ctx.moveTo(x + 22, y - 8); ctx.lineTo(x + 10, y + 18)
  ctx.stroke()
  // jettied roof
  ctx.fillStyle = ROOF_DARK
  ctx.beginPath()
  ctx.moveTo(x - 30, y - 19)
  ctx.lineTo(x - 3, y - 36)
  ctx.quadraticCurveTo(x, y - 37.5, x + 3, y - 36)
  ctx.lineTo(x + 30, y - 19)
  ctx.quadraticCurveTo(x, y - 24, x - 30, y - 19)
  ctx.closePath(); ctx.fill()
  // hanging coin sign
  ctx.strokeStyle = WOOD_DARK; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x - 24, y - 4); ctx.lineTo(x - 30, y - 4); ctx.moveTo(x - 30, y - 4); ctx.lineTo(x - 30, y + 1); ctx.stroke()
  ctx.fillStyle = '#E9B44C'
  ctx.beginPath(); ctx.arc(x - 30, y + 5, 4.4, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#F5D584'
  ctx.beginPath(); ctx.arc(x - 30, y + 5, 2.6, 0, Math.PI * 2); ctx.fill()
  // door + crates of goods
  ctx.fillStyle = WOOD
  rr(ctx, x - 7, y + 4, 14, 16, 6); ctx.fill()
  ctx.fillStyle = WOOD_DARK
  rr(ctx, x + 14, y + 10, 11, 9, 2); ctx.fill()
  rr(ctx, x + 18, y + 3, 8, 7, 2); ctx.fill()
}

export function drawWhiteKeep(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  shadow(ctx, x, y + 18, 28, 10)
  // the white tower, tall and proud
  ctx.fillStyle = '#E9E5D8'
  ctx.beginPath()
  ctx.moveTo(x - 20, y + 16)
  ctx.lineTo(x - 17, y - 34)
  ctx.lineTo(x + 17, y - 34)
  ctx.lineTo(x + 20, y + 16)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = '#C2BCA8'; ctx.lineWidth = 2
  ctx.stroke()
  // stone coursing
  ctx.strokeStyle = 'rgba(140, 133, 112, 0.35)'; ctx.lineWidth = 1.2
  ctx.beginPath()
  for (let sy = y - 26; sy < y + 12; sy += 9) { ctx.moveTo(x - 17.5, sy); ctx.lineTo(x + 17.5, sy) }
  ctx.stroke()
  // crenellations
  ctx.fillStyle = '#E9E5D8'
  for (const ox of [-17, -7.5, 2, 11.5]) rr(ctx, x + ox, y - 41, 6.5, 8, 1.5), ctx.fill()
  ctx.strokeStyle = '#C2BCA8'; ctx.lineWidth = 1.4
  for (const ox of [-17, -7.5, 2, 11.5]) rr(ctx, x + ox, y - 41, 6.5, 8, 1.5), ctx.stroke()
  // arrow slits + arched door
  ctx.fillStyle = '#6B6656'
  for (const sy of [-24, -12]) rr(ctx, x - 1.5, y + sy, 3, 8, 1.5), ctx.fill()
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.moveTo(x - 6, y + 16); ctx.lineTo(x - 6, y + 6)
  ctx.quadraticCurveTo(x, y + 1, x + 6, y + 6); ctx.lineTo(x + 6, y + 16)
  ctx.closePath(); ctx.fill()
  // the great banner
  ctx.strokeStyle = WOOD_DARK; ctx.lineWidth = 2.4
  ctx.beginPath(); ctx.moveTo(x, y - 41); ctx.lineTo(x, y - 54); ctx.stroke()
  const wave = Math.sin(t * 3 + e.seed) * 1.8
  ctx.fillStyle = c.main
  ctx.beginPath()
  ctx.moveTo(x, y - 54)
  ctx.quadraticCurveTo(x + 10, y - 56 + wave, x + 18, y - 51 + wave)
  ctx.quadraticCurveTo(x + 10, y - 47 + wave, x, y - 45)
  ctx.closePath(); ctx.fill()
}

export function drawStable(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  shadow(ctx, x, y + 21, 38, 12)
  // broad timber barn
  ctx.fillStyle = TIMBER
  rr(ctx, x - 29, y - 10, 58, 32, 7); ctx.fill()
  ctx.strokeStyle = TIMBER_EDGE; ctx.lineWidth = 2
  rr(ctx, x - 29, y - 10, 58, 32, 7); ctx.stroke()
  ctx.strokeStyle = 'rgba(139, 106, 74, 0.38)'; ctx.lineWidth = 1.2
  ctx.beginPath()
  for (const sx of [-20, -12, 12, 20]) { ctx.moveTo(x + sx, y - 7); ctx.lineTo(x + sx, y + 19) }
  ctx.stroke()
  // deep thatch roof
  ctx.fillStyle = ROOF
  ctx.beginPath()
  ctx.moveTo(x - 36, y - 6)
  ctx.lineTo(x - 4, y - 30)
  ctx.quadraticCurveTo(x, y - 32.5, x + 4, y - 30)
  ctx.lineTo(x + 36, y - 6)
  ctx.quadraticCurveTo(x, y - 12, x - 36, y - 6)
  ctx.closePath(); ctx.fill()
  // wide arched stall door, dark within
  ctx.fillStyle = '#5F5343'
  ctx.beginPath()
  ctx.moveTo(x - 12, y + 21)
  ctx.lineTo(x - 12, y + 4)
  ctx.quadraticCurveTo(x, y - 7, x + 12, y + 4)
  ctx.lineTo(x + 12, y + 21)
  ctx.closePath(); ctx.fill()
  // a friendly horse head peeking out, nodding gently
  const nod = Math.sin(t * 1.6 + e.seed) * 1.2
  ctx.save()
  ctx.translate(x + 1, y + 8 + nod)
  ctx.fillStyle = '#B98A5C'
  ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 4.6, -0.25, 0, Math.PI * 2); ctx.fill() // head
  ctx.beginPath(); ctx.ellipse(5, 2.6, 3.6, 2.6, -0.35, 0, Math.PI * 2); ctx.fill() // muzzle
  ctx.fillStyle = '#8A6440'
  ctx.beginPath(); ctx.moveTo(-3.5, -3.6); ctx.lineTo(-1.4, -7.4); ctx.lineTo(0.6, -3.9); ctx.closePath(); ctx.fill() // ear
  ctx.beginPath(); ctx.ellipse(-4.5, -0.5, 2, 3.4, 0.35, 0, Math.PI * 2); ctx.fill() // mane
  ctx.fillStyle = '#4A3413'
  ctx.beginPath(); ctx.arc(1.4, -1.2, 1, 0, Math.PI * 2); ctx.fill() // eye
  ctx.restore()
  // hay bale by the door
  ctx.fillStyle = '#E4CB8F'
  rr(ctx, x + 17, y + 11, 12, 9, 3); ctx.fill()
  ctx.strokeStyle = '#C4A867'; ctx.lineWidth = 1.3
  ctx.beginPath(); ctx.moveTo(x + 19.5, y + 11.5); ctx.lineTo(x + 19.5, y + 19.5); ctx.moveTo(x + 26, y + 11.5); ctx.lineTo(x + 26, y + 19.5); ctx.stroke()
  // horseshoe sign
  ctx.strokeStyle = '#C7CCD4'; ctx.lineWidth = 2.2
  ctx.beginPath(); ctx.arc(x - 20, y - 1, 4, Math.PI * 0.85, Math.PI * 2.15); ctx.stroke()
  flag(ctx, x + 30, y - 12, e.team, t + e.seed, bannerTint(e))
}

export function drawBlacksmith(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 20, 34, 11)
  // stout stone workshop
  ctx.fillStyle = '#CFC4AC'
  rr(ctx, x - 26, y - 10, 52, 30, 7); ctx.fill()
  ctx.strokeStyle = '#B4A88D'; ctx.lineWidth = 2
  rr(ctx, x - 26, y - 10, 52, 30, 7); ctx.stroke()
  ctx.fillStyle = '#BDB197'
  for (const [ox, oy] of [[-16, 4], [-4, 12], [8, 2], [16, 10], [-9, -3]]) {
    ctx.beginPath(); ctx.ellipse(x + ox, y + oy, 3.6, 2.5, 0, 0, Math.PI * 2); ctx.fill()
  }
  // timber roof with a smoking chimney
  ctx.fillStyle = WOOD
  ctx.beginPath()
  ctx.moveTo(x - 32, y - 6)
  ctx.lineTo(x - 3, y - 26)
  ctx.quadraticCurveTo(x, y - 28, x + 3, y - 26)
  ctx.lineTo(x + 32, y - 6)
  ctx.quadraticCurveTo(x, y - 13, x - 32, y - 6)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#B4A88D'
  rr(ctx, x + 12, y - 30, 8, 13, 2); ctx.fill()
  chimneySmoke(ctx, x + 16, y - 32, t * 1.4, e.seed) // the forge never rests
  // wide doorway, lit by the forge within
  ctx.fillStyle = '#4A3F31'
  rr(ctx, x - 11, y - 2, 22, 22, 7); ctx.fill()
  const glow = 0.55 + Math.sin(t * 5 + e.seed) * 0.18
  ctx.fillStyle = `rgba(242, 158, 73, ${glow})`
  ctx.beginPath()
  ctx.ellipse(x, y + 13, 8, 6, 0, Math.PI, 0)
  ctx.fill()
  // anvil on a stump out front
  ctx.fillStyle = WOOD_DARK
  rr(ctx, x + 20, y + 12, 11, 7, 2.5); ctx.fill()
  ctx.fillStyle = '#7B8087'
  ctx.beginPath()
  ctx.moveTo(x + 19, y + 8); ctx.lineTo(x + 32, y + 8)
  ctx.lineTo(x + 30, y + 11); ctx.lineTo(x + 27, y + 11)
  ctx.lineTo(x + 27, y + 13); ctx.lineTo(x + 24, y + 13)
  ctx.lineTo(x + 24, y + 11); ctx.lineTo(x + 21, y + 11)
  ctx.closePath(); ctx.fill()
  // crossed-hammer sign on the wall
  ctx.strokeStyle = '#8A7458'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x - 21, y - 3); ctx.lineTo(x - 14, y + 4); ctx.moveTo(x - 14, y - 3); ctx.lineTo(x - 21, y + 4); ctx.stroke()
  ctx.fillStyle = '#C7CCD4'
  rr(ctx, x - 23.5, y - 5.5, 5, 3.4, 1.2); ctx.fill()
  rr(ctx, x - 16.5, y - 5.5, 5, 3.4, 1.2); ctx.fill()
}

export function drawMill(ctx: CanvasRenderingContext2D, e: Ent, t: number, age = 2): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 16, 26, 9)
  // tapered tower — planked in the Dark Age, plastered on stone once Feudal
  ctx.fillStyle = age >= 2 ? WALL : TIMBER
  ctx.beginPath()
  ctx.moveTo(x - 14, y + 15)
  ctx.lineTo(x - 10, y - 16)
  ctx.lineTo(x + 10, y - 16)
  ctx.lineTo(x + 14, y + 15)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = age >= 2 ? WALL_EDGE : TIMBER_EDGE; ctx.lineWidth = 2
  ctx.stroke()
  if (age >= 2) {
    ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.moveTo(x - 12, y + 4); ctx.lineTo(x + 12, y + 4); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x - 11, y - 6); ctx.lineTo(x + 11, y - 6); ctx.stroke()
    ctx.fillStyle = STONE_FOOT
    ctx.beginPath()
    ctx.moveTo(x - 13.2, y + 9); ctx.lineTo(x + 13.2, y + 9)
    ctx.lineTo(x + 14, y + 15); ctx.lineTo(x - 14, y + 15)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = STONE_FOOT_DOT
    for (const sx of [-8, 0, 8]) {
      ctx.beginPath(); ctx.ellipse(x + sx, y + 12, 2.6, 1.8, 0, 0, Math.PI * 2); ctx.fill()
    }
  } else {
    ctx.strokeStyle = 'rgba(139, 106, 74, 0.38)'; ctx.lineWidth = 1.2
    ctx.beginPath()
    for (const sx of [-7, 0, 7]) {
      ctx.moveTo(x + sx * 0.85, y - 14)
      ctx.lineTo(x + sx, y + 13)
    }
    ctx.stroke()
  }
  // thatch cap
  ctx.fillStyle = ROOF
  ctx.beginPath()
  ctx.moveTo(x - 13, y - 15)
  ctx.quadraticCurveTo(x, y - 27, x + 13, y - 15)
  ctx.quadraticCurveTo(x, y - 19, x - 13, y - 15)
  ctx.closePath(); ctx.fill()
  // doorway + a plump grain sack
  ctx.fillStyle = WOOD
  rr(ctx, x - 5, y + 4, 10, 12, 4.5); ctx.fill()
  ctx.fillStyle = '#E4CB8F'
  ctx.beginPath(); ctx.ellipse(x + 18, y + 12, 5, 6, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#C4A867'; ctx.lineWidth = 1.4
  ctx.beginPath(); ctx.moveTo(x + 15, y + 8); ctx.quadraticCurveTo(x + 18, y + 10, x + 21, y + 8); ctx.stroke()
  // sails on a hub, turning at a sleepy pace
  const hubY = y - 21
  ctx.save()
  ctx.translate(x, hubY)
  ctx.rotate(t * 0.45 + (e.seed % 7))
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2)
    ctx.strokeStyle = WOOD_DARK; ctx.lineWidth = 2.2
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -19); ctx.stroke()
    ctx.fillStyle = 'rgba(251, 243, 228, 0.92)'
    rr(ctx, 0.5, -19, 5.5, 14, 2); ctx.fill()
    ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 1
    rr(ctx, 0.5, -19, 5.5, 14, 2); ctx.stroke()
  }
  ctx.restore()
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath(); ctx.arc(x, hubY, 3, 0, Math.PI * 2); ctx.fill()
}

// A field fills its whole 4x4 plot and turns through the year as it's worked:
// bare furrows and seed, green shoots, tall stalks, then heavy gold ready for
// the scythe — and back to bare earth when it's cut.
export function drawFarm(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  const crop = Math.max(0, Math.min(1, e.crop ?? 0))
  const grow = Math.min(1, crop / 0.85) // how tall the crop stands
  const ripe = Math.max(0, (crop - 0.55) / 0.45) // green giving way to gold
  const H = 30 // half the plot: a 4-tile field, edge to edge
  // tilled earth, darker in the furrows
  ctx.fillStyle = '#B08968'
  rr(ctx, x - H, y - H, H * 2, H * 2, 5); ctx.fill()
  ctx.fillStyle = 'rgba(154, 115, 87, 0.5)'
  rr(ctx, x - H + 3, y - H + 3, H * 2 - 6, H * 2 - 6, 4); ctx.fill()
  // the furrows themselves, ploughed in gentle waves
  ctx.strokeStyle = '#9A7357'
  ctx.lineWidth = 2.6
  const rows = 5
  for (let i = 0; i < rows; i++) {
    const ry = y - H + 9 + i * ((H * 2 - 16) / (rows - 1))
    ctx.beginPath()
    ctx.moveTo(x - H + 5, ry)
    ctx.quadraticCurveTo(x, ry + 1.6, x + H - 5, ry)
    ctx.stroke()
  }
  // the crop, row by row
  const green = [127, 169, 94], gold = [214, 176, 74]
  const col = green.map((v, i) => Math.round(v + (gold[i] - v) * ripe))
  ctx.fillStyle = `rgb(${col[0]}, ${col[1]}, ${col[2]})`
  ctx.strokeStyle = `rgb(${col[0]}, ${col[1]}, ${col[2]})`
  for (let i = 0; i < rows; i++) {
    const ry = y - H + 9 + i * ((H * 2 - 16) / (rows - 1))
    for (let j = 0; j < 7; j++) {
      const sx = x - H + 7 + j * ((H * 2 - 14) / 6)
      const sway = Math.sin(t * 1.5 + i * 0.7 + j + e.seed) * (0.6 + grow * 1.4)
      if (crop < 0.1) {
        // just sown: seed pressed into the furrow
        ctx.fillStyle = '#8B6A4A'
        ctx.beginPath(); ctx.arc(sx, ry + 1.5, 1.1, 0, Math.PI * 2); ctx.fill()
        continue
      }
      const h = 2.5 + grow * 8.5
      ctx.lineWidth = 1.4 + grow * 0.8
      ctx.beginPath()
      ctx.moveTo(sx, ry + 1)
      ctx.quadraticCurveTo(sx + sway * 0.5, ry + 1 - h * 0.6, sx + sway, ry + 1 - h)
      ctx.stroke()
      if (ripe > 0.35) {
        // a heavy head of grain, bowing as it ripens
        ctx.beginPath()
        ctx.ellipse(sx + sway, ry + 1 - h - 1, 1.5, 2.6 * ripe, sway * 0.12, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  // timber frame over the top so the plot reads as ONE field
  ctx.strokeStyle = WOOD
  ctx.lineWidth = 3
  rr(ctx, x - H, y - H, H * 2, H * 2, 5); ctx.stroke()
  // corner post with a team pennant
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 2.4
  ctx.beginPath(); ctx.moveTo(x + H - 3, y - H + 2); ctx.lineTo(x + H - 3, y - H - 12); ctx.stroke()
  ctx.fillStyle = c.main
  ctx.beginPath()
  ctx.moveTo(x + H - 3, y - H - 12)
  ctx.lineTo(x + H + 6, y - H - 9.5)
  ctx.lineTo(x + H - 3, y - H - 7)
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

// ---------- The faith: relics, churches, ministries ----------

export function drawRelic(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  const glow = 0.5 + Math.sin(t * 2 + e.seed) * 0.25
  shadow(ctx, x, y + 6, 11, 4)
  // a soft holy shimmer around the wayside plinth
  ctx.save()
  ctx.globalAlpha = 0.16 + glow * 0.1
  ctx.fillStyle = '#F5D584'
  ctx.beginPath(); ctx.arc(x, y - 4, 16 + glow * 3, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  // mossy stone plinth
  ctx.fillStyle = STONE_FOOT
  rr(ctx, x - 8, y - 1, 16, 7, 2.5); ctx.fill()
  ctx.strokeStyle = STONE_FOOT_DOT; ctx.lineWidth = 1.2
  rr(ctx, x - 8, y - 1, 16, 7, 2.5); ctx.stroke()
  ctx.fillStyle = '#88A65E'
  ctx.beginPath(); ctx.ellipse(x - 6, y + 5.5, 3.4, 1.4, 0, 0, Math.PI * 2); ctx.fill()
  // the golden reliquary: a little gabled chest
  ctx.fillStyle = '#E9B44C'
  rr(ctx, x - 6.5, y - 9, 13, 8.5, 1.6); ctx.fill()
  ctx.fillStyle = '#C98F2B'
  ctx.beginPath()
  ctx.moveTo(x - 7.5, y - 8.5)
  ctx.lineTo(x, y - 14)
  ctx.lineTo(x + 7.5, y - 8.5)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#F5D584'
  rr(ctx, x - 1.1, y - 8.2, 2.2, 6.6, 1); ctx.fill()
  rr(ctx, x - 4.4, y - 6.4, 8.8, 2, 1); ctx.fill()
  // a spark drifting heavenward now and then
  const sp = (t * 0.6 + e.seed * 0.13) % 1
  ctx.globalAlpha = (1 - sp) * 0.8
  ctx.fillStyle = '#FBF3E4'
  ctx.beginPath(); ctx.arc(x + Math.sin(e.seed + t) * 4, y - 14 - sp * 12, 1.2, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
}

// tiny gold caskets along a shrine's front — one per enshrined relic
function relicPips(ctx: CanvasRenderingContext2D, x: number, y: number, n: number): void {
  for (let i = 0; i < Math.min(n, 5); i++) {
    const px = x + (i - (Math.min(n, 5) - 1) / 2) * 10
    ctx.fillStyle = '#E9B44C'
    rr(ctx, px - 3.2, y - 3, 6.4, 4.6, 1); ctx.fill()
    ctx.fillStyle = '#C98F2B'
    ctx.beginPath()
    ctx.moveTo(px - 3.8, y - 2.6); ctx.lineTo(px, y - 5.4); ctx.lineTo(px + 3.8, y - 2.6)
    ctx.closePath(); ctx.fill()
  }
}

export function drawChurch(ctx: CanvasRenderingContext2D, e: Ent, t: number, relics = 0): void {
  const x = e.x, y = e.y
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  shadow(ctx, x, y + 19, 32, 10)
  // stone nave with a cream upper
  ctx.fillStyle = STONE_FOOT
  rr(ctx, x - 22, y - 2, 44, 22, 4); ctx.fill()
  ctx.fillStyle = WALL
  rr(ctx, x - 22, y - 18, 44, 20, 5); ctx.fill()
  ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 2
  rr(ctx, x - 22, y - 18, 44, 20, 5); ctx.stroke()
  // honey gable roof
  ctx.fillStyle = ROOF
  ctx.beginPath()
  ctx.moveTo(x - 27, y - 15)
  ctx.lineTo(x, y - 31)
  ctx.lineTo(x + 27, y - 15)
  ctx.quadraticCurveTo(x, y - 21, x - 27, y - 15)
  ctx.closePath(); ctx.fill()
  // the little bell tower, cross atop
  ctx.fillStyle = WALL
  rr(ctx, x - 5.5, y - 44, 11, 18, 2.5); ctx.fill()
  ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 1.6
  rr(ctx, x - 5.5, y - 44, 11, 18, 2.5); ctx.stroke()
  ctx.fillStyle = ROOF_DARK
  ctx.beginPath()
  ctx.moveTo(x - 8, y - 43); ctx.lineTo(x, y - 52); ctx.lineTo(x + 8, y - 43)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#5A4632'
  ctx.beginPath(); ctx.arc(x, y - 37, 2.4, 0, Math.PI * 2); ctx.fill() // the bell in its arch
  ctx.strokeStyle = '#E9B44C'; ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y - 60); ctx.lineTo(x, y - 53)
  ctx.moveTo(x - 3, y - 57.5); ctx.lineTo(x + 3, y - 57.5)
  ctx.stroke()
  // rose window + arched door
  ctx.fillStyle = '#E8C97A'
  ctx.beginPath(); ctx.arc(x - 13, y - 9, 3.6, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = c.main
  ctx.beginPath(); ctx.arc(x + 13, y - 9, 3.6, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.moveTo(x - 6, y + 20); ctx.lineTo(x - 6, y + 6)
  ctx.quadraticCurveTo(x, y, x + 6, y + 6); ctx.lineTo(x + 6, y + 20)
  ctx.closePath(); ctx.fill()
  relicPips(ctx, x, y + 3, relics)
}

export function drawMinistry(ctx: CanvasRenderingContext2D, e: Ent, t: number, relics = 0): void {
  const x = e.x, y = e.y
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  shadow(ctx, x, y + 20, 35, 11)
  // a stately dressed-stone hall
  ctx.fillStyle = '#E4DFCE'
  rr(ctx, x - 26, y - 20, 52, 41, 5); ctx.fill()
  ctx.strokeStyle = '#C2BCA8'; ctx.lineWidth = 2
  rr(ctx, x - 26, y - 20, 52, 41, 5); ctx.stroke()
  ctx.strokeStyle = 'rgba(140, 133, 112, 0.3)'; ctx.lineWidth = 1.1
  ctx.beginPath()
  for (let sy = y - 12; sy < y + 18; sy += 8) { ctx.moveTo(x - 24, sy); ctx.lineTo(x + 24, sy) }
  ctx.stroke()
  // low hipped roof with a lantern gable
  ctx.fillStyle = ROOF_DARK
  ctx.beginPath()
  ctx.moveTo(x - 31, y - 17)
  ctx.lineTo(x - 20, y - 30)
  ctx.lineTo(x + 20, y - 30)
  ctx.lineTo(x + 31, y - 17)
  ctx.quadraticCurveTo(x, y - 23, x - 31, y - 17)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = WALL
  rr(ctx, x - 7, y - 40, 14, 12, 2.5); ctx.fill()
  ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 1.6
  rr(ctx, x - 7, y - 40, 14, 12, 2.5); ctx.stroke()
  ctx.fillStyle = ROOF
  ctx.beginPath()
  ctx.moveTo(x - 9.5, y - 39); ctx.lineTo(x, y - 47); ctx.lineTo(x + 9.5, y - 39)
  ctx.closePath(); ctx.fill()
  // the open golden book of records on the lantern
  ctx.fillStyle = '#E9B44C'
  ctx.beginPath()
  ctx.moveTo(x - 4.5, y - 35.5)
  ctx.quadraticCurveTo(x, y - 37.5, x, y - 36)
  ctx.quadraticCurveTo(x, y - 37.5, x + 4.5, y - 35.5)
  ctx.lineTo(x + 4.5, y - 32)
  ctx.quadraticCurveTo(x, y - 33.5, x, y - 32.5)
  ctx.quadraticCurveTo(x, y - 33.5, x - 4.5, y - 32)
  ctx.closePath(); ctx.fill()
  // columned porch and tall door
  ctx.fillStyle = '#D3CEC1'
  rr(ctx, x - 13, y + 2, 4, 18, 1.6); ctx.fill()
  rr(ctx, x + 9, y + 2, 4, 18, 1.6); ctx.fill()
  ctx.fillStyle = WOOD_DARK
  rr(ctx, x - 6, y + 4, 12, 17, 3); ctx.fill()
  // tall windows either side
  ctx.fillStyle = '#E8C97A'
  rr(ctx, x - 21, y - 14, 5.5, 9, 2); ctx.fill()
  rr(ctx, x + 15.5, y - 14, 5.5, 9, 2); ctx.fill()
  // the banner of whoever keeps the ledgers
  ctx.strokeStyle = WOOD_DARK; ctx.lineWidth = 2.2
  ctx.beginPath(); ctx.moveTo(x + 20, y - 30); ctx.lineTo(x + 20, y - 44); ctx.stroke()
  const wave = Math.sin(t * 3 + e.seed) * 1.6
  ctx.fillStyle = c.main
  ctx.beginPath()
  ctx.moveTo(x + 20, y - 44)
  ctx.quadraticCurveTo(x + 28, y - 45 + wave, x + 34, y - 41 + wave)
  ctx.quadraticCurveTo(x + 28, y - 38 + wave, x + 20, y - 36)
  ctx.closePath(); ctx.fill()
  relicPips(ctx, x, y + 0, relics)
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

export function drawMonk(ctx: CanvasRenderingContext2D, e: Ent, t: number, carrying = false): void {
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  const { bx, by, walk } = unitBase(ctx, e, t)
  const f = e.face ?? 1
  ctx.save()
  lean(ctx, e, 0.2, 0.25)
  // sandalled feet
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath(); ctx.ellipse(bx - 3.2, e.y + 4 + walk * 1.2, 2.5, 1.7, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(bx + 3.2, e.y + 4 - walk * 1.2, 2.5, 1.7, 0, 0, Math.PI * 2); ctx.fill()
  // the long brown habit, hem swaying
  ctx.fillStyle = '#8A6B4E'
  ctx.beginPath()
  ctx.moveTo(bx - 7, by + 5)
  ctx.quadraticCurveTo(bx - 7.5, by - 7, bx, by - 8)
  ctx.quadraticCurveTo(bx + 7.5, by - 7, bx + 7, by + 5)
  ctx.quadraticCurveTo(bx, by + 7.5, bx - 7, by + 5)
  ctx.closePath(); ctx.fill()
  // rope belt in the team's color
  ctx.strokeStyle = c.main; ctx.lineWidth = 1.8
  ctx.beginPath(); ctx.moveTo(bx - 6.2, by); ctx.lineTo(bx + 6.2, by); ctx.stroke()
  // cowl draped at the shoulders
  ctx.fillStyle = '#75593F'
  ctx.beginPath(); ctx.ellipse(bx, by - 7, 6.4, 3, 0, 0, Math.PI * 2); ctx.fill()
  // head with a tidy tonsure
  ctx.fillStyle = SKIN
  ctx.beginPath(); ctx.arc(bx, by - 12, 5.6, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#75593F'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(bx, by - 12, 5.2, Math.PI * 1.15, Math.PI * 1.85, true); ctx.stroke()
  // gentle eyes
  ctx.fillStyle = '#5A4632'
  ctx.beginPath(); ctx.arc(bx + f * 1.8, by - 11.5, 0.9, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(bx + f * 4.2, by - 11.5, 0.9, 0, Math.PI * 2); ctx.fill()
  if (carrying) {
    // the reliquary rides high in both hands, shining all the way home
    const lift = Math.sin(t * 2 + (e.phase ?? 0)) * 0.8
    const ry = by - 24 + lift
    ctx.globalAlpha = 0.25
    ctx.fillStyle = '#F5D584'
    ctx.beginPath(); ctx.arc(bx, ry, 10, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = SKIN; ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(bx - 4.5, by - 6); ctx.lineTo(bx - 4, ry + 4)
    ctx.moveTo(bx + 4.5, by - 6); ctx.lineTo(bx + 4, ry + 4)
    ctx.stroke()
    ctx.fillStyle = '#E9B44C'
    rr(ctx, bx - 5.5, ry - 1, 11, 6.5, 1.4); ctx.fill()
    ctx.fillStyle = '#C98F2B'
    ctx.beginPath()
    ctx.moveTo(bx - 6.2, ry - 0.6); ctx.lineTo(bx, ry - 5); ctx.lineTo(bx + 6.2, ry - 0.6)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#F5D584'
    rr(ctx, bx - 0.9, ry - 0.4, 1.8, 5, 0.8); ctx.fill()
  } else {
    // a plain walking staff, crooked just so
    ctx.strokeStyle = WOOD; ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(bx + f * 7, e.y + 4)
    ctx.lineTo(bx + f * 7.5, by - 14)
    ctx.stroke()
    ctx.strokeStyle = '#E9B44C'; ctx.lineWidth = 1.8
    ctx.beginPath(); ctx.arc(bx + f * 7.5, by - 15.5, 2, Math.PI * 0.8, Math.PI * 2.25); ctx.stroke()
  }
  ctx.restore()
}

export function drawSwordsman(ctx: CanvasRenderingContext2D, e: Ent, t: number, champ = false): void {
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
  // plume — champions wear the gold
  ctx.fillStyle = champ ? '#E9B44C' : c.main
  ctx.beginPath(); ctx.arc(bx + lunge, by - 19.5, champ ? 3.1 : 2.6, 0, Math.PI * 2); ctx.fill()
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

export function drawSpearman(ctx: CanvasRenderingContext2D, e: Ent, t: number, champ = false): void {
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  const { bx, by, walk } = unitBase(ctx, e, t)
  const f = e.face ?? 1
  const thrusting = e.state === 'attack' && (e.cd ?? 0) > 0.72
  const lunge = thrusting ? f * 3.5 : 0
  ctx.save()
  lean(ctx, e, 0.2, 0.25)
  // feet
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath(); ctx.ellipse(bx - 3.6, e.y + 4.2 + walk * 1.2, 2.6, 1.9, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(bx + 3.6, e.y + 4.2 - walk * 1.2, 2.6, 1.9, 0, 0, Math.PI * 2); ctx.fill()
  // body
  ctx.fillStyle = c.main
  ctx.beginPath()
  ctx.moveTo(bx - 6.5 + lunge, by + 4.4)
  ctx.quadraticCurveTo(bx - 7.5 + lunge, by - 6, bx + lunge, by - 7.5)
  ctx.quadraticCurveTo(bx + 7.5 + lunge, by - 6, bx + 6.5 + lunge, by + 4.4)
  ctx.quadraticCurveTo(bx + lunge, by + 7.5, bx - 6.5 + lunge, by + 4.4)
  ctx.closePath(); ctx.fill()
  // small buckler on the off-hand
  ctx.fillStyle = WOOD
  ctx.beginPath(); ctx.arc(bx - f * 7 + lunge, by - 1.5, 4.2, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#C7CCD4'
  ctx.beginPath(); ctx.arc(bx - f * 7 + lunge, by - 1.5, 1.6, 0, Math.PI * 2); ctx.fill()
  // head + conical cap
  ctx.fillStyle = SKIN
  ctx.beginPath(); ctx.arc(bx + lunge, by - 11.5, 6, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = c.dark
  ctx.beginPath()
  ctx.moveTo(bx - 6.2 + lunge, by - 13.5)
  ctx.quadraticCurveTo(bx + lunge, by - 16, bx + 6.2 + lunge, by - 13.5)
  ctx.lineTo(bx + 1.5 + lunge, by - 21.5)
  ctx.quadraticCurveTo(bx + lunge, by - 22.5, bx - 1.5 + lunge, by - 21.5)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#E9B44C'
  ctx.beginPath(); ctx.arc(bx + lunge, by - 22, champ ? 2.2 : 1.3, 0, Math.PI * 2); ctx.fill()
  if (champ) { // champions wear a golden band on the cap
    ctx.strokeStyle = '#E9B44C'; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.moveTo(bx - 5.6 + lunge, by - 14); ctx.lineTo(bx + 5.6 + lunge, by - 14); ctx.stroke()
  }
  // eyes
  ctx.fillStyle = '#5A4632'
  ctx.beginPath(); ctx.arc(bx + f * 1.8 + lunge, by - 10.8, 0.9, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(bx + f * 4.2 + lunge, by - 10.8, 0.9, 0, Math.PI * 2); ctx.fill()
  // the long spear, angled forward; thrusts on attack
  ctx.save()
  ctx.translate(bx + f * 6 + lunge * 1.4, by - 3)
  ctx.rotate(f * (thrusting ? 0.12 : 0.35))
  ctx.strokeStyle = WOOD
  ctx.lineWidth = 2.2
  ctx.beginPath(); ctx.moveTo(-f * 6, 6); ctx.lineTo(f * 13, -7); ctx.stroke()
  ctx.fillStyle = '#C7CCD4'
  ctx.save()
  ctx.translate(f * 13, -7)
  ctx.rotate(f * -0.68)
  ctx.beginPath()
  ctx.moveTo(-2.2, 0); ctx.lineTo(0, -6); ctx.lineTo(2.2, 0)
  ctx.closePath(); ctx.fill()
  ctx.restore()
  ctx.restore()
  ctx.restore()
}

export function drawArcher(ctx: CanvasRenderingContext2D, e: Ent, t: number, champ = false): void {
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
  ctx.fillStyle = champ ? '#C98F2B' : c.dark // champion longbows hood in gold-braid
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
  flag(ctx, x - 36, y - 12, e.team, t + e.seed, bannerTint(e))
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

export function drawKnight(ctx: CanvasRenderingContext2D, e: Ent, t: number, champ = false): void {
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  const f = e.face ?? 1
  const moving = e.stepped === true
  const trot = moving ? Math.sin(t * 11 + (e.phase ?? 0)) : Math.sin(t * 2 + (e.phase ?? 0)) * 0.4
  const by = e.y - Math.abs(trot) * 2.6
  shadow(ctx, e.x, e.y + 6, 13, 4.5)
  ctx.save()
  lean(ctx, e, 0.4, 0.5)
  // charger legs
  ctx.strokeStyle = '#6B4F37'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(e.x - 6, by - 2); ctx.lineTo(e.x - 6 - trot * 2.2, e.y + 5.5)
  ctx.moveTo(e.x + 6, by - 2); ctx.lineTo(e.x + 6 + trot * 2.2, e.y + 5.5)
  ctx.stroke()
  // the charger, broad and proud, in a team caparison
  ctx.fillStyle = '#84603F'
  ctx.beginPath(); ctx.ellipse(e.x, by - 5, 11.5, 7.5, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = champ ? '#E9B44C' : c.main
  ctx.beginPath(); ctx.ellipse(e.x, by - 3, 10.5, 5.5, 0, 0, Math.PI); ctx.fill() // skirt
  ctx.fillStyle = '#84603F'
  ctx.beginPath(); ctx.ellipse(e.x + f * 11, by - 9.5, 5, 4.2, f * 0.4, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(e.x + f * 9, by - 12.5)
  ctx.lineTo(e.x + f * 10.5, by - 17)
  ctx.lineTo(e.x + f * 12.5, by - 12.5)
  ctx.closePath(); ctx.fill()
  // chamfron (face armor)
  ctx.fillStyle = '#C7CCD4'
  ctx.beginPath(); ctx.ellipse(e.x + f * 12.5, by - 9.5, 2.8, 2.2, f * 0.4, 0, Math.PI * 2); ctx.fill()
  // armored rider
  ctx.fillStyle = '#AEB4BF'
  ctx.beginPath()
  ctx.moveTo(bxr(e.x, f) - 5, by - 11)
  ctx.quadraticCurveTo(bxr(e.x, f) - 5.5, by - 19, bxr(e.x, f), by - 20)
  ctx.quadraticCurveTo(bxr(e.x, f) + 5.5, by - 19, bxr(e.x, f) + 5, by - 11)
  ctx.closePath(); ctx.fill()
  // great helm with a plume
  ctx.fillStyle = '#C7CCD4'
  ctx.beginPath(); ctx.arc(bxr(e.x, f), by - 22.5, 4.8, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#5A4632'
  rr(ctx, bxr(e.x, f) - 4.4, by - 23.4, 8.8, 1.8, 0.9); ctx.fill() // visor slit
  ctx.fillStyle = champ ? '#E9B44C' : c.main
  ctx.beginPath()
  ctx.ellipse(bxr(e.x, f) - f * 1.5, by - 28, 2, 3.2, f * -0.4, 0, Math.PI * 2)
  ctx.fill()
  // kite shield
  ctx.fillStyle = c.main
  ctx.beginPath()
  ctx.moveTo(bxr(e.x, f) - f * 7, by - 17)
  ctx.quadraticCurveTo(bxr(e.x, f) - f * 11, by - 15, bxr(e.x, f) - f * 9.5, by - 8)
  ctx.quadraticCurveTo(bxr(e.x, f) - f * 8.5, by - 6, bxr(e.x, f) - f * 6, by - 8.5)
  ctx.quadraticCurveTo(bxr(e.x, f) - f * 4.5, by - 14, bxr(e.x, f) - f * 7, by - 17)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#FBF3E4'
  ctx.beginPath(); ctx.arc(bxr(e.x, f) - f * 7.8, by - 12, 1.6, 0, Math.PI * 2); ctx.fill()
  // couched lance, dips on the charge
  const striking = e.state === 'attack' && (e.cd ?? 0) > 0.65
  ctx.save()
  ctx.translate(bxr(e.x, f) + f * 3, by - 14)
  ctx.rotate(f * (striking ? 0.32 : 0.18))
  ctx.strokeStyle = WOOD
  ctx.lineWidth = 2.4
  ctx.beginPath(); ctx.moveTo(-f * 4, 0); ctx.lineTo(f * 17, 0); ctx.stroke()
  ctx.fillStyle = '#C7CCD4'
  ctx.beginPath()
  ctx.moveTo(f * 17, -1.8); ctx.lineTo(f * 21.5, 0); ctx.lineTo(f * 17, 1.8)
  ctx.closePath(); ctx.fill()
  ctx.restore()
  ctx.restore()
}

// ---- siege engines: slow wooden machines from the workshop ----

// a wheeled catapult with a throwing spoon; the arm rocks back as it reloads
export function drawMangonel(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  const f = e.face ?? 1
  // the arm sits thrown forward just after a shot, hauled back as cd runs out
  const cdFrac = Math.min(1, Math.max(0, (e.cd ?? 0) / 4))
  const armA = -0.9 + cdFrac * 1.5 // radians from upright: back when loaded, forward when loosed
  const roll = e.stepped ? Math.sin(t * 9 + (e.phase ?? 0)) * 0.8 : 0
  shadow(ctx, e.x, e.y + 7, 16, 5)
  ctx.save()
  ctx.translate(e.x, e.y + roll * 0.4)
  ctx.scale(f, 1)
  // wheels
  for (const wx of [-9, 9]) {
    ctx.fillStyle = '#6F5238'
    ctx.beginPath(); ctx.arc(wx, 4, 5.2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#A8875F'
    ctx.beginPath(); ctx.arc(wx, 4, 2.2, 0, Math.PI * 2); ctx.fill()
  }
  // carriage bed
  ctx.fillStyle = TIMBER
  rr(ctx, -14, -4, 28, 7, 2.5); ctx.fill()
  ctx.strokeStyle = TIMBER_EDGE; ctx.lineWidth = 1.6
  rr(ctx, -14, -4, 28, 7, 2.5); ctx.stroke()
  // team-painted crossbar
  ctx.fillStyle = c.main
  rr(ctx, -14, -6.5, 28, 3, 1.5); ctx.fill()
  // upright frame
  ctx.strokeStyle = '#8B6A4A'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(0, -13); ctx.lineTo(6, -4); ctx.stroke()
  // throwing arm with its spoon
  ctx.save()
  ctx.translate(0, -12)
  ctx.rotate(armA)
  ctx.strokeStyle = '#6F5238'; ctx.lineWidth = 3.4
  ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, -14); ctx.stroke()
  ctx.fillStyle = '#8B6A4A'
  ctx.beginPath(); ctx.arc(0, -15, 3.4, 0, Math.PI * 2); ctx.fill()
  if (cdFrac < 0.25) { // loaded and ready: a boulder rests in the spoon
    ctx.fillStyle = '#A8A395'
    ctx.beginPath(); ctx.arc(0, -15, 2.4, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
  // a little pile of ammunition
  ctx.fillStyle = '#A8A395'
  ctx.beginPath(); ctx.arc(-11, -6.5, 2.2, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(-8, -7.5, 1.9, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

// the great counterweight engine: an A-frame, a long beam, a hanging weight.
// planted = frame down and ready; on the move the beam rides low.
export function drawTrebuchet(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  const f = e.face ?? 1
  const planted = (e.setup ?? 0) >= 3
  const cdFrac = Math.min(1, Math.max(0, (e.cd ?? 0) / 7))
  // beam angle: travelling it lies flat; planted it cocks back, whips forward on release
  const beamA = !planted ? 0.12 : cdFrac > 0.85 ? -1.15 : -0.35 - (1 - cdFrac) * 0.55
  shadow(ctx, e.x, e.y + 8, 18, 5.5)
  ctx.save()
  ctx.translate(e.x, e.y)
  ctx.scale(f, 1)
  // ground sled / wheels
  ctx.fillStyle = '#6F5238'
  rr(ctx, -15, 4, 30, 4, 2); ctx.fill()
  for (const wx of [-10, 10]) {
    ctx.fillStyle = '#6F5238'
    ctx.beginPath(); ctx.arc(wx, 7, 3.6, 0, Math.PI * 2); ctx.fill()
  }
  // A-frame uprights
  ctx.strokeStyle = '#8B6A4A'; ctx.lineWidth = 3.4
  ctx.beginPath()
  ctx.moveTo(-9, 5); ctx.lineTo(0, -16); ctx.lineTo(9, 5)
  ctx.moveTo(-5, -4); ctx.lineTo(5, -4)
  ctx.stroke()
  // planted stakes when set up
  if (planted) {
    ctx.strokeStyle = '#5A4632'; ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-13, 3); ctx.lineTo(-16, 8)
    ctx.moveTo(13, 3); ctx.lineTo(16, 8)
    ctx.stroke()
  }
  // the long beam on its axle
  ctx.save()
  ctx.translate(0, -16)
  ctx.rotate(beamA)
  ctx.strokeStyle = '#6F5238'; ctx.lineWidth = 3.2
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(20, 0); ctx.stroke()
  // counterweight box swings from the short end
  ctx.fillStyle = '#5A4632'
  rr(ctx, -13.5, 0.5, 8, 8, 1.8); ctx.fill()
  ctx.strokeStyle = '#4A3A28'; ctx.lineWidth = 1.2
  rr(ctx, -13.5, 0.5, 8, 8, 1.8); ctx.stroke()
  // sling trailing from the long end
  ctx.strokeStyle = '#C4A867'; ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.moveTo(20, 0); ctx.quadraticCurveTo(23, 4, 20.5, 7); ctx.stroke()
  if (planted && cdFrac < 0.2) { // a boulder waits in the sling
    ctx.fillStyle = '#A8A395'
    ctx.beginPath(); ctx.arc(20.5, 8.5, 2.6, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
  // a team pennant at the peak
  ctx.strokeStyle = '#5A4632'; ctx.lineWidth = 1.4
  ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, -23); ctx.stroke()
  ctx.fillStyle = c.main
  const wave = Math.sin(t * 3 + (e.phase ?? 0)) * 1.2
  ctx.beginPath()
  ctx.moveTo(0, -23); ctx.lineTo(7, -21.5 + wave * 0.4); ctx.lineTo(0, -19.5)
  ctx.closePath(); ctx.fill()
  ctx.restore()
}

// an open-sided timber hall where the engines are wrought
export function drawSiegeWorkshop(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 21, 38, 12)
  // open hall: heavy corner posts under a deep roof
  ctx.fillStyle = '#CDAF83'
  rr(ctx, x - 29, y - 8, 58, 30, 6); ctx.fill()
  ctx.strokeStyle = TIMBER_EDGE; ctx.lineWidth = 2
  rr(ctx, x - 29, y - 8, 58, 30, 6); ctx.stroke()
  // the dark open workfloor
  ctx.fillStyle = '#5F5343'
  rr(ctx, x - 22, y - 2, 44, 24, 4); ctx.fill()
  // a half-built engine inside: wheels and a beam on trestles
  ctx.fillStyle = '#8B6A4A'
  ctx.beginPath(); ctx.arc(x - 10, y + 12, 5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#A8875F'
  ctx.beginPath(); ctx.arc(x - 10, y + 12, 2, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#A8875F'; ctx.lineWidth = 2.6
  ctx.beginPath(); ctx.moveTo(x - 2, y + 14); ctx.lineTo(x + 17, y + 3); ctx.stroke()
  // big spoked wheel leaning on the outside wall
  ctx.fillStyle = '#6F5238'
  ctx.beginPath(); ctx.arc(x + 24, y + 14, 6.5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#CDAF83'
  ctx.beginPath(); ctx.arc(x + 24, y + 14, 4.4, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#6F5238'; ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(x + 19.6, y + 14); ctx.lineTo(x + 28.4, y + 14)
  ctx.moveTo(x + 24, y + 9.6); ctx.lineTo(x + 24, y + 18.4)
  ctx.stroke()
  ctx.fillStyle = '#6F5238'
  ctx.beginPath(); ctx.arc(x + 24, y + 14, 1.6, 0, Math.PI * 2); ctx.fill()
  // deep plank roof with a smoke-hole
  ctx.fillStyle = ROOF_DARK
  ctx.beginPath()
  ctx.moveTo(x - 36, y - 4)
  ctx.lineTo(x - 4, y - 28)
  ctx.quadraticCurveTo(x, y - 30.5, x + 4, y - 28)
  ctx.lineTo(x + 36, y - 4)
  ctx.quadraticCurveTo(x, y - 10, x - 36, y - 4)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = 'rgba(90, 70, 50, 0.35)'; ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(x - 20, y - 8.5); ctx.lineTo(x - 10, y - 23)
  ctx.moveTo(x + 20, y - 8.5); ctx.lineTo(x + 10, y - 23)
  ctx.stroke()
  // boulder pile by the door
  ctx.fillStyle = '#A8A395'
  ctx.beginPath(); ctx.arc(x - 24, y + 17, 3.4, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(x - 19, y + 18.5, 2.8, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(x - 21.5, y + 13.5, 2.5, 0, Math.PI * 2); ctx.fill()
  flag(ctx, x + 30, y - 10, e.team, t + e.seed, bannerTint(e))
}
