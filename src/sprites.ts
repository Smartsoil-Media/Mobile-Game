// Cosy storybook sprites, all drawn with canvas vector shapes.
import { Ent, TEAM_COLOR, BANNERS, KINGS_BANNER } from './data'

// The original storybook palette, retuned to the meadow's new naturalistic
// light. Keeping the names means everything still drawn the old way — fences,
// gates, sites, units, resources — moves with the redesign instead of sitting
// in it as a bright pastel island. Anything rebuilt on the architecture kit
// below uses that kit's own materials instead.
const SKIN = '#E8BC8C'
const WALL = '#D9CDB5'
const WALL_EDGE = '#B3A68C'
const ROOF = '#A98B54'
const ROOF_DARK = '#7E6438'
const WOOD = '#6B5238'
const WOOD_DARK = '#4A3722'
const TIMBER = '#B79A76'
const TIMBER_EDGE = '#8A6C49'
const STONE_FOOT = '#A9A396'
const STONE_FOOT_DOT = '#948E82'

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

// One sun for the whole meadow, sitting high in the upper left. Every shadow
// in the game leans the same way off it, which is most of why the world reads
// as lit rather than merely coloured.
export const SUN_X = 0.42 // how far a shadow slides right, per unit of height
export const SUN_Y = 0.20 // ...and down

export function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // two stacked ellipses: a wide soft penumbra and a tighter contact patch, so
  // the object looks planted instead of floating on a decal
  ctx.fillStyle = 'rgba(44, 54, 36, 0.22)'
  ctx.beginPath()
  ctx.ellipse(x + w * SUN_X * 0.3, y + h * SUN_Y * 0.5, w, h, 0, 0, Math.PI * 2)
  ctx.fill()
}



// Trees are the most numerous thing in the meadow and, sway aside, each one
// paints the same handful of arcs every frame. Bake each distinct tree once
// into a small offscreen canvas and blit it instead: a dozen arcs per tree per
// frame becomes a single drawImage, which is what buys the frame budget back.
// The sway then rides as a sub-pixel nudge of the whole sprite — at this size
// the eye reads that as wind, and the trunk's foot moving by a pixel is
// invisible.
const TREE_CACHE = new Map<string, { c: HTMLCanvasElement; ox: number; oy: number }>()
const TREE_PAD = 46

function treeSprite(e: Ent): { c: HTMLCanvasElement; ox: number; oy: number } | null {
  const felled = (e.amount ?? 0) <= 0
  // quantise size so a growing/shrinking wood reuses a handful of bakes
  const bucket = felled ? 0 : Math.round(((e.amount ?? 60) / 60) * 8)
  const key = `${e.seed % 5}:${e.seed % CANOPIES.length}:${bucket}:${felled ? 1 : 0}`
  const hit = TREE_CACHE.get(key)
  if (hit) return hit
  if (TREE_CACHE.size > 240) return null // pathological map: just paint live
  const c = document.createElement('canvas')
  c.width = TREE_PAD * 2
  c.height = TREE_PAD * 2
  const g = c.getContext('2d')
  if (!g) return null
  g.translate(TREE_PAD, TREE_PAD)
  // paint the archetype at the origin, with sway frozen at zero
  paintTree(g, { ...e, x: 0, y: 0, amount: felled ? 0 : (bucket / 8) * 60 } as Ent, 0)
  const made = { c, ox: TREE_PAD, oy: TREE_PAD }
  TREE_CACHE.set(key, made)
  return made
}

export function drawTree(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const spr = treeSprite(e)
  if (!spr) { paintTree(ctx, e, t); return }
  const sway = Math.sin(t * 0.8 + e.seed) * 1.5
  ctx.drawImage(spr.c, e.x - spr.ox + sway * 0.5, e.y - spr.oy)
}

// ------------------------------------------------------------- architecture
// Every building in the meadow is assembled from these few parts, so they all
// catch the same sun and share a vocabulary. Coordinates are always "ground
// centre-front": (x, y) is where the building meets the earth, widths run
// left-right, heights go up. The view's tilt is applied outside, by upright().
const PLASTER = '#D9CDB5'
const PLASTER_LIT = '#EADFC8'
const PLASTER_SHADE = '#B3A68C'
const BEAM = '#54402B'
const TILE_MID = '#9E4B32'
const TILE_LIT = '#BC6040'
const TILE_SHADE = '#733524'
const SLATE_MID = '#5C6970'
const SLATE_LIT = '#77858D'
const SLATE_SHADE = '#414A50'
const THATCH_MID = '#A98B54'
const THATCH_LIT = '#C6A96C'
const THATCH_SHADE = '#7E6438'
const STONE_MID = '#A9A396'
const STONE_LIT = '#C0BAAC'
const STONE_SHADE = '#847E72'

export type Mat = 'plaster' | 'stone' | 'timber'
export type RoofMat = 'tile' | 'slate' | 'thatch'
const ROOFS: Record<RoofMat, [string, string, string]> = {
  tile: [TILE_SHADE, TILE_MID, TILE_LIT],
  slate: [SLATE_SHADE, SLATE_MID, SLATE_LIT],
  thatch: [THATCH_SHADE, THATCH_MID, THATCH_LIT],
}
const WALLS: Record<Mat, [string, string, string]> = {
  plaster: [PLASTER_SHADE, PLASTER, PLASTER_LIT],
  stone: [STONE_SHADE, STONE_MID, STONE_LIT],
  timber: ['#6B5238', '#8A6C49', '#A6855D'],
}

// The trodden earth a building sits in — softens the join to the grass so
// nothing looks pasted onto the meadow.
export function plot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  // Two offset scuffs rather than one ring — a clean ellipse under every
  // building read as a spotlight, which is exactly what worn ground doesn't
  // look like.
  ctx.fillStyle = 'rgba(112, 96, 70, 0.085)'
  ctx.beginPath(); ctx.ellipse(x, y + 1, w * 0.46, w * 0.155, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(126, 110, 82, 0.065)'
  ctx.beginPath(); ctx.ellipse(x - w * 0.11, y - 1, w * 0.3, w * 0.1, 0.3, 0, Math.PI * 2); ctx.fill()
}

// A wall block standing on the ground: the face we look at, plus a shaded
// return sliding off to the right, away from the sun.
export function facade(ctx: CanvasRenderingContext2D, x: number, y: number,
                       w: number, h: number, mat: Mat = 'plaster', depth = 0.22): void {
  const [shade, mid, lit] = WALLS[mat]
  const d = w * depth
  // right-hand return, in shadow
  ctx.fillStyle = shade
  ctx.beginPath()
  ctx.moveTo(x + w / 2, y)
  ctx.lineTo(x + w / 2 + d, y - d * 0.5)
  ctx.lineTo(x + w / 2 + d, y - h - d * 0.5)
  ctx.lineTo(x + w / 2, y - h)
  ctx.closePath(); ctx.fill()
  // the face
  ctx.fillStyle = mid
  ctx.fillRect(x - w / 2, y - h, w, h)
  // Light grazing the left, shadow gathering right. Bands rather than a
  // gradient: at this size the eye can't tell, and a gradient object per wall
  // per frame is real work on a phone.
  ctx.globalAlpha = 0.5
  ctx.fillStyle = lit
  ctx.fillRect(x - w / 2, y - h, w * 0.3, h)
  ctx.fillStyle = shade
  ctx.fillRect(x + w * 0.16, y - h, w * 0.34, h)
  ctx.globalAlpha = 1
  // grime gathering where wall meets ground
  ctx.fillStyle = 'rgba(60, 52, 38, 0.16)'
  ctx.fillRect(x - w / 2, y - h * 0.16, w, h * 0.16)
  if (mat === 'stone') {
    ctx.strokeStyle = 'rgba(96, 90, 78, 0.35)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    for (let sy = y - h + 5; sy < y - 1; sy += 5) { ctx.moveTo(x - w / 2, sy); ctx.lineTo(x + w / 2, sy) }
    ctx.stroke()
  }
}

// Half-timbering: the dark bracing that reads instantly as medieval.
export function timberFrame(ctx: CanvasRenderingContext2D, x: number, y: number,
                            w: number, h: number, bays = 3): void {
  ctx.strokeStyle = BEAM
  ctx.lineWidth = Math.max(1.4, w * 0.035)
  ctx.beginPath()
  ctx.moveTo(x - w / 2, y - h); ctx.lineTo(x + w / 2, y - h)   // wall plate
  ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y)           // sill
  for (let i = 1; i < bays; i++) {
    const px = x - w / 2 + (w / bays) * i
    ctx.moveTo(px, y - h); ctx.lineTo(px, y)                    // posts
  }
  ctx.stroke()
  ctx.lineWidth = Math.max(1, w * 0.022)
  ctx.beginPath()
  for (let i = 0; i < bays; i++) {                              // braces
    const a = x - w / 2 + (w / bays) * i, b = a + w / bays
    ctx.moveTo(a, y); ctx.lineTo(b, y - h * 0.62)
  }
  ctx.stroke()
}

// A pitched roof with its ridge running left-right: we look straight at the
// front slope, so that face carries the courses and the gable ends show as
// small returns either side.
export function roof(ctx: CanvasRenderingContext2D, x: number, yEaves: number,
                     w: number, rise: number, mat: RoofMat = 'tile', over = 0.12): void {
  const [shade, mid, lit] = ROOFS[mat]
  const ow = w * (1 + over)
  const ridge = yEaves - rise
  // gable return on the shaded side
  ctx.fillStyle = shade
  ctx.beginPath()
  ctx.moveTo(x + ow / 2, yEaves)
  ctx.lineTo(x + ow / 2 + w * 0.13, yEaves - rise * 0.42)
  ctx.lineTo(x + ow / 2 - w * 0.02, ridge)
  ctx.closePath(); ctx.fill()
  // the front slope
  ctx.fillStyle = mid
  ctx.beginPath()
  ctx.moveTo(x - ow / 2, yEaves)
  ctx.lineTo(x + ow / 2, yEaves)
  ctx.lineTo(x + ow / 2 - w * 0.02, ridge)
  ctx.lineTo(x - ow / 2 + w * 0.02, ridge)
  ctx.closePath(); ctx.fill()
  // sun down the left of the slope, shade down the right
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x - ow / 2, yEaves)
  ctx.lineTo(x + ow / 2, yEaves)
  ctx.lineTo(x + ow / 2 - w * 0.02, ridge)
  ctx.lineTo(x - ow / 2 + w * 0.02, ridge)
  ctx.closePath(); ctx.clip()
  ctx.globalAlpha = 0.5
  ctx.fillStyle = lit
  ctx.fillRect(x - ow / 2, ridge, ow * 0.34, rise)
  ctx.fillStyle = shade
  ctx.fillRect(x + ow * 0.12, ridge, ow * 0.38, rise)
  ctx.globalAlpha = 1
  ctx.restore()
  if (mat === 'thatch') {
    // thatch has no courses — a combed edge and a fat ridge instead
    ctx.strokeStyle = 'rgba(92, 74, 42, 0.13)'
    ctx.lineWidth = 0.7
    ctx.beginPath()
    for (let i = 1; i < 14; i++) {
      const px = x - ow / 2 + (ow / 14) * i
      ctx.moveTo(px, yEaves); ctx.lineTo(px + w * 0.012, ridge)
    }
    ctx.stroke()
    // straw lies in courses too, just softer than tile
    ctx.strokeStyle = 'rgba(120, 96, 54, 0.16)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 1; i < 4; i++) {
      const ry = yEaves - rise * (i / 4)
      ctx.moveTo(x - ow / 2 + 1, ry); ctx.lineTo(x + ow / 2 - 1, ry)
    }
    ctx.stroke()
    ctx.fillStyle = lit
    ctx.beginPath(); ctx.ellipse(x, ridge + 1, ow * 0.5, rise * 0.10, 0, 0, Math.PI * 2); ctx.fill()
  } else {
    // tile or slate courses, tightening toward the ridge
    ctx.strokeStyle = 'rgba(38, 26, 20, 0.26)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    const rows = Math.max(3, Math.round(rise / 4))
    for (let i = 1; i < rows; i++) {
      const k = i / rows
      const ry = yEaves - rise * k
      const hw = (ow / 2) * (1 - 0.02 * k)
      ctx.moveTo(x - hw, ry); ctx.lineTo(x + hw, ry)
    }
    ctx.stroke()
    ctx.fillStyle = lit
    ctx.fillRect(x - ow / 2 + w * 0.02, ridge - 1.6, ow - w * 0.04, 2.2) // ridge cap
  }
  // eaves shadow cast onto the wall below
  ctx.fillStyle = 'rgba(40, 32, 24, 0.22)'
  ctx.fillRect(x - ow / 2, yEaves, ow, 2.4)
}

// A round tower with a conical cap — the silhouette that says "keep".
export function tower(ctx: CanvasRenderingContext2D, x: number, y: number,
                      r: number, h: number, mat: Mat = 'stone', cap: RoofMat = 'tile'): void {
  const [shade, mid, lit] = WALLS[mat]
  ctx.fillStyle = mid
  ctx.fillRect(x - r, y - h, r * 2, h)
  ctx.globalAlpha = 0.6
  ctx.fillStyle = lit
  ctx.fillRect(x - r * 0.72, y - h, r * 0.7, h)
  ctx.fillStyle = shade
  ctx.fillRect(x + r * 0.3, y - h, r * 0.7, h)
  ctx.fillStyle = shade
  ctx.fillRect(x - r, y - h, r * 0.3, h)
  ctx.globalAlpha = 1
  ctx.strokeStyle = 'rgba(96, 90, 78, 0.3)'
  ctx.lineWidth = 0.7
  ctx.beginPath()
  for (let sy = y - h + 4; sy < y - 1; sy += 4.5) { ctx.moveTo(x - r, sy); ctx.lineTo(x + r, sy) }
  ctx.stroke()
  // corbelled band under the cap
  ctx.fillStyle = lit
  ctx.fillRect(x - r * 1.16, y - h - 2, r * 2.32, 3)
  ctx.fillStyle = 'rgba(50, 44, 36, 0.25)'
  ctx.fillRect(x - r * 1.16, y - h + 1, r * 2.32, 1.2)
  // the cone
  const [cs, cm, cl] = ROOFS[cap]
  const ch = r * 2.3
  ctx.fillStyle = cm
  ctx.beginPath()
  ctx.moveTo(x - r * 1.2, y - h - 2)
  ctx.lineTo(x, y - h - 2 - ch)
  ctx.lineTo(x + r * 1.2, y - h - 2)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = cl
  ctx.beginPath()
  ctx.moveTo(x - r * 1.2, y - h - 2)
  ctx.lineTo(x, y - h - 2 - ch)
  ctx.lineTo(x - r * 0.15, y - h - 2)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = cs
  ctx.beginPath()
  ctx.moveTo(x + r * 0.45, y - h - 2)
  ctx.lineTo(x, y - h - 2 - ch)
  ctx.lineTo(x + r * 1.2, y - h - 2)
  ctx.closePath(); ctx.fill()
}

// Openings. Small, dark and deep-set — a bright window reads as a sticker.
export function windowSlot(ctx: CanvasRenderingContext2D, x: number, y: number,
                           w: number, h: number, arched = false): void {
  ctx.fillStyle = '#33291F'
  ctx.beginPath()
  if (arched) {
    ctx.moveTo(x - w / 2, y)
    ctx.lineTo(x - w / 2, y - h + w / 2)
    ctx.arc(x, y - h + w / 2, w / 2, Math.PI, 0)
    ctx.lineTo(x + w / 2, y)
  } else {
    ctx.rect(x - w / 2, y - h, w, h)
  }
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = 'rgba(226, 208, 160, 0.30)' // a little light from inside
  ctx.fillRect(x - w / 2 + 0.6, y - h * 0.55, w - 1.2, h * 0.42)
}

export function doorArch(ctx: CanvasRenderingContext2D, x: number, y: number,
                         w: number, h: number): void {
  ctx.fillStyle = '#4A3722'
  ctx.beginPath()
  ctx.moveTo(x - w / 2, y)
  ctx.lineTo(x - w / 2, y - h + w / 2)
  ctx.arc(x, y - h + w / 2, w / 2, Math.PI, 0)
  ctx.lineTo(x + w / 2, y)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#5E4830'
  ctx.fillRect(x - w / 2 + 0.8, y - h + w / 2, w - 1.6, h - w / 2)
  ctx.strokeStyle = 'rgba(30, 22, 14, 0.5)'
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.moveTo(x, y); ctx.lineTo(x, y - h + w * 0.4)
  ctx.stroke()
}

export function chimney(ctx: CanvasRenderingContext2D, x: number, y: number,
                        w: number, h: number): void {
  ctx.fillStyle = STONE_MID
  ctx.fillRect(x - w / 2, y - h, w, h)
  ctx.fillStyle = STONE_LIT
  ctx.fillRect(x - w / 2, y - h, w * 0.4, h)
  ctx.fillStyle = STONE_SHADE
  ctx.fillRect(x - w / 2 - 0.8, y - h - 2, w + 1.6, 2.4)
}

// ---------- Resources ----------

// ---------------------------------------------------------------- woodland
// The meadow turns in autumn, so the canopy palette runs from held-on green
// through gold and rust to deep maple red. Each tree picks one family from its
// seed and keeps it, so the wood looks planted rather than randomised.
type Canopy = { shade: string; mid: string; lit: string }
const CANOPIES: Canopy[] = [
  { shade: '#8E3526', mid: '#B4442E', lit: '#D26B44' }, // maple, turned hard
  { shade: '#9A5822', mid: '#C0762F', lit: '#DF9A4C' }, // orange
  { shade: '#94742A', mid: '#BE9C38', lit: '#DCC059' }, // gold
  { shade: '#4E6331', mid: '#6B8342', lit: '#8CA659' }, // still green
]
const BARK = '#4A3B2C'
const BARK_LIT = '#63503C'

// A canopy is built in three passes — shade offset away from the sun, mid
// tone, then a smaller lit cluster up toward the light. Overlapping circles
// read as foliage far better than one silhouette does.
function canopy(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number,
                c: Canopy, blobs: [number, number, number][], sway: number): void {
  ctx.fillStyle = c.shade
  for (const [ox, oy, r] of blobs) {
    ctx.beginPath()
    ctx.arc(cx + (ox + 2.2) * s + sway * 0.4, cy + (oy + 2.0) * s, r * s, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = c.mid
  for (const [ox, oy, r] of blobs) {
    ctx.beginPath()
    ctx.arc(cx + ox * s + sway * 0.5, cy + oy * s, r * 0.94 * s, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = c.lit
  for (const [ox, oy, r] of blobs) {
    if (r < 7) continue
    ctx.beginPath()
    ctx.arc(cx + (ox - 2.6) * s + sway * 0.7, cy + (oy - 2.8) * s, r * 0.52 * s, 0, Math.PI * 2)
    ctx.fill()
  }
}

// a tapering trunk with a couple of branches reaching into the crown
function trunk(ctx: CanvasRenderingContext2D, x: number, y: number, h: number,
               w: number, s: number): void {
  ctx.fillStyle = BARK
  ctx.beginPath()
  ctx.moveTo(x - w * s, y)
  ctx.quadraticCurveTo(x - w * 0.45 * s, y - h * 0.5 * s, x - w * 0.34 * s, y - h * s)
  ctx.lineTo(x + w * 0.34 * s, y - h * s)
  ctx.quadraticCurveTo(x + w * 0.45 * s, y - h * 0.5 * s, x + w * s, y)
  ctx.closePath()
  ctx.fill()
  // sunlit edge down the left flank
  ctx.strokeStyle = BARK_LIT
  ctx.lineWidth = 1.1 * s
  ctx.beginPath()
  ctx.moveTo(x - w * 0.62 * s, y - h * 0.12 * s)
  ctx.quadraticCurveTo(x - w * 0.34 * s, y - h * 0.5 * s, x - w * 0.2 * s, y - h * 0.9 * s)
  ctx.stroke()
  // branches
  ctx.strokeStyle = BARK
  ctx.lineWidth = 1.6 * s
  ctx.beginPath()
  ctx.moveTo(x, y - h * 0.62 * s); ctx.lineTo(x - w * 1.9 * s, y - h * 0.95 * s)
  ctx.moveTo(x, y - h * 0.74 * s); ctx.lineTo(x + w * 1.9 * s, y - h * 1.02 * s)
  ctx.stroke()
}

function paintTree(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  if ((e.amount ?? 0) <= 0) {
    // felled: a raw stump, pale heartwood against the weathered bark
    shadow(ctx, e.x, e.y + 3, 9, 3.6)
    ctx.fillStyle = BARK
    rr(ctx, e.x - 6, e.y - 7, 12, 11, 2.5)
    ctx.fill()
    ctx.fillStyle = '#B79A76'
    ctx.beginPath(); ctx.ellipse(e.x, e.y - 7, 6, 3.2, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(120, 96, 68, 0.7)'
    ctx.lineWidth = 0.9
    ctx.beginPath(); ctx.ellipse(e.x, e.y - 7, 3.2, 1.7, 0, 0, Math.PI * 2); ctx.stroke()
    // sawdust and a few fallen leaves round the base
    ctx.fillStyle = 'rgba(178, 150, 108, 0.5)'
    ctx.beginPath(); ctx.ellipse(e.x + 5, e.y + 3, 4.5, 2, 0.3, 0, Math.PI * 2); ctx.fill()
    return
  }
  const sway = Math.sin(t * 0.8 + e.seed) * 1.5
  const full = (e.amount ?? 60) / 60
  const s = 0.78 + 0.30 * full
  const variant = e.seed % 5
  const c = CANOPIES[e.seed % CANOPIES.length]

  if (variant === 1) {
    // conifer: holds its dark green all year, a spire among the turned crowns
    shadow(ctx, e.x, e.y + 3, 13 * s, 5 * s)
    ctx.fillStyle = BARK
    rr(ctx, e.x - 2.6 * s, e.y - 12 * s, 5.2 * s, 15 * s, 2)
    ctx.fill()
    const tiers: [number, number][] = [[-7, 15], [-16, 12.5], [-24, 9.5], [-31, 6]]
    for (let i = 0; i < tiers.length; i++) {
      const [oy, w] = tiers[i]
      const sk = sway * (0.2 + i * 0.22)
      ctx.fillStyle = ['#33452C', '#3D5235', '#33452C', '#3D5235'][i]
      ctx.beginPath()
      ctx.moveTo(e.x + sk, e.y + (oy - 12) * s)
      ctx.lineTo(e.x - w * s, e.y + oy * s)
      ctx.lineTo(e.x + w * s, e.y + oy * s)
      ctx.closePath(); ctx.fill()
      // light catching the left side of each skirt
      ctx.fillStyle = 'rgba(126, 152, 96, 0.34)'
      ctx.beginPath()
      ctx.moveTo(e.x + sk, e.y + (oy - 12) * s)
      ctx.lineTo(e.x - w * s, e.y + oy * s)
      ctx.lineTo(e.x - w * 0.35 * s, e.y + oy * s)
      ctx.closePath(); ctx.fill()
    }
    return
  }

  if (variant === 3) {
    // birch: slender pale trunk, an airy gold crown high up
    shadow(ctx, e.x, e.y + 3, 11 * s, 4.4 * s)
    ctx.fillStyle = '#D9D2C0'
    ctx.beginPath()
    ctx.moveTo(e.x - 3 * s, e.y)
    ctx.quadraticCurveTo(e.x - 1.6 * s, e.y - 12 * s, e.x - 1.5 * s, e.y - 24 * s)
    ctx.lineTo(e.x + 1.5 * s, e.y - 24 * s)
    ctx.quadraticCurveTo(e.x + 1.6 * s, e.y - 12 * s, e.x + 3 * s, e.y)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(74, 64, 50, 0.6)'
    ctx.lineWidth = 1.1 * s
    ctx.beginPath()
    ctx.moveTo(e.x - 2.2 * s, e.y - 5 * s); ctx.lineTo(e.x - 0.2 * s, e.y - 5 * s)
    ctx.moveTo(e.x + 0.6 * s, e.y - 12 * s); ctx.lineTo(e.x + 2.4 * s, e.y - 12 * s)
    ctx.moveTo(e.x - 2.4 * s, e.y - 18 * s); ctx.lineTo(e.x - 0.6 * s, e.y - 18 * s)
    ctx.stroke()
    canopy(ctx, e.x, e.y - 29 * s, s, CANOPIES[2],
      [[-7, 3, 8], [7, 2, 7.5], [0, -4, 9], [-2, 6, 7]], sway)
    return
  }

  // broadleaf — the workhorse of the wood
  shadow(ctx, e.x, e.y + 4, 15 * s, 6 * s)
  trunk(ctx, e.x, e.y, 18, 3.6, s)
  canopy(ctx, e.x, e.y - 26 * s, s, c,
    [[-10, 5, 10.5], [10, 4, 10], [0, -7, 12.5], [-4, 7, 10], [6, -3, 9]], sway)
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
  shadow(ctx, x, y + 7, 40, 14)
  plot(ctx, x, y + 6, 54)
  // a merchants' hall under a blue slate roof, its market awning out front
  facade(ctx, x, y, 46, 24, 'plaster')
  timberFrame(ctx, x, y, 46, 24, 4)
  roof(ctx, x, y - 24, 46, 20, 'slate', 0.16)
  for (const ox of [-16, 16]) windowSlot(ctx, x + ox, y - 11, 6, 9, true)
  doorArch(ctx, x, y, 12, 16)
  // the striped awning, sagging a little between its poles
  const sag = Math.sin(t * 1.4 + e.seed) * 0.6
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? '#C4443A' : '#EDE3CE'
    ctx.beginPath()
    ctx.moveTo(x - 24 + i * 8, y - 22)
    ctx.lineTo(x - 16 + i * 8, y - 22)
    ctx.lineTo(x - 16 + i * 8, y - 13 + sag)
    ctx.lineTo(x - 24 + i * 8, y - 13 + sag)
    ctx.closePath(); ctx.fill()
  }
  ctx.strokeStyle = '#6B5238'; ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(x - 24, y - 13 + sag); ctx.lineTo(x - 24, y - 1)
  ctx.moveTo(x + 24, y - 13 + sag); ctx.lineTo(x + 24, y - 1)
  ctx.stroke()
  // crates of goods under the awning
  ctx.fillStyle = '#7C6244'
  rr(ctx, x - 22, y - 9, 11, 8, 1.5); ctx.fill()
  rr(ctx, x + 12, y - 8, 10, 7, 1.5); ctx.fill()
  // the hanging coin sign
  ctx.strokeStyle = '#4A3722'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.moveTo(x + 20, y - 30); ctx.lineTo(x + 20, y - 25); ctx.stroke()
  ctx.fillStyle = '#C89A3A'
  ctx.beginPath(); ctx.arc(x + 20, y - 22, 4, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#E0BB5E'
  ctx.beginPath(); ctx.arc(x + 19, y - 23, 1.6, 0, Math.PI * 2); ctx.fill()
  fleur(ctx, x, y - 34, 7)
}

export function drawCavalrySchool(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 7, 42, 15)
  plot(ctx, x, y + 6, 58)
  // a long riding hall, its paddock railed off to one side
  facade(ctx, x - 4, y, 48, 20, 'plaster')
  timberFrame(ctx, x - 4, y, 48, 20, 4)
  roof(ctx, x - 4, y - 20, 48, 18, 'slate', 0.16)
  // the tall doors a horse and rider clear without stooping
  ctx.fillStyle = '#3A2C1C'
  ctx.fillRect(x - 12, y - 17, 24, 17)
  doorArch(ctx, x - 4, y, 20, 17)
  // paddock rails running off to the right
  ctx.strokeStyle = '#6B5238'; ctx.lineWidth = 1.8
  ctx.beginPath()
  for (const ry of [-9, -4]) { ctx.moveTo(x + 22, y + ry); ctx.lineTo(x + 44, y + ry - 2) }
  for (const rx of [24, 33, 42]) { ctx.moveTo(x + rx, y + 1); ctx.lineTo(x + rx, y - 11) }
  ctx.stroke()
  // a horse-head sign over the door
  const nod = Math.sin(t * 1.5 + e.seed) * 0.8
  ctx.save()
  ctx.translate(x - 4, y - 26 + nod)
  ctx.fillStyle = '#4A3524'
  ctx.beginPath()
  ctx.ellipse(0, 0, 4, 5.4, 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath(); ctx.ellipse(-1.8, -4, 1.3, 2.4, -0.3, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  fleur(ctx, x - 4, y - 40, 8)
}

export function drawRoyalVineyard(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 7, 40, 14)
  plot(ctx, x, y + 6, 54)
  // a stone villa above its trellis rows
  facade(ctx, x - 2, y, 40, 22, 'stone')
  roof(ctx, x - 2, y - 22, 40, 16, 'tile', 0.18)
  for (const ox of [-13, 9] as number[]) windowSlot(ctx, x + ox, y - 10, 5, 8, true)
  doorArch(ctx, x - 2, y, 10, 14)
  // trellis rows marching off downhill, heavy with fruit
  for (let row = 0; row < 3; row++) {
    const ry = y - 2 + row * 5
    const rx = x + 18 + row * 2
    ctx.strokeStyle = '#6B5238'; ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(rx, ry); ctx.lineTo(rx + 22, ry - 1)
    ctx.stroke()
    for (let i = 0; i < 4; i++) {
      const gx = rx + 3 + i * 6
      ctx.fillStyle = '#4E6331'
      ctx.beginPath(); ctx.ellipse(gx, ry - 3.5, 3.2, 2.4, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#5B3A66'
      ctx.beginPath(); ctx.arc(gx, ry - 0.5, 1.7, 0, Math.PI * 2); ctx.fill()
    }
  }
  // barrels waiting by the door
  for (const [ox, oy, r] of [[-22, -4, 5], [-27, -2, 4]] as [number, number, number][]) {
    ctx.fillStyle = '#7C6244'
    ctx.beginPath(); ctx.ellipse(x + ox, y + oy, r, r * 1.15, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#4A3722'
    ctx.fillRect(x + ox - r, y + oy - 1, r * 2, 1.3)
  }
  fleur(ctx, x - 2, y - 32, 7)
}

export function drawRedPalace(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 7, 36, 13)
  plot(ctx, x, y + 6, 50)
  // a tall brick donjon — the one red thing in a meadow of stone and thatch
  const BRICK = '#8E4436'
  const BRICK_LIT = '#A85B45'
  const BRICK_SHADE = '#6B3128'
  ctx.fillStyle = BRICK
  ctx.fillRect(x - 18, y - 56, 36, 56)
  ctx.globalAlpha = 0.6
  ctx.fillStyle = BRICK_LIT
  ctx.fillRect(x - 18, y - 56, 11, 56)
  ctx.fillStyle = BRICK_SHADE
  ctx.fillRect(x + 6, y - 56, 12, 56)
  ctx.globalAlpha = 1
  // brick courses
  ctx.strokeStyle = 'rgba(58, 26, 20, 0.28)'
  ctx.lineWidth = 0.7
  ctx.beginPath()
  for (let sy = y - 52; sy < y - 2; sy += 4.5) { ctx.moveTo(x - 18, sy); ctx.lineTo(x + 18, sy) }
  ctx.stroke()
  // machicolated head and its slate cone
  ctx.fillStyle = BRICK_LIT
  ctx.fillRect(x - 21, y - 62, 42, 6)
  ctx.fillStyle = 'rgba(50, 22, 16, 0.3)'
  ctx.fillRect(x - 21, y - 56.6, 42, 1.4)
  ctx.fillStyle = SLATE_MID
  ctx.beginPath()
  ctx.moveTo(x - 21, y - 62); ctx.lineTo(x, y - 88); ctx.lineTo(x + 21, y - 62)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = SLATE_LIT
  ctx.beginPath()
  ctx.moveTo(x - 21, y - 62); ctx.lineTo(x, y - 88); ctx.lineTo(x - 2, y - 62)
  ctx.closePath(); ctx.fill()
  // arrow loops, the source of all those bolts
  for (const [ox, oy] of [[-9, -22], [9, -22], [-9, -38], [9, -38]] as [number, number][]) {
    ctx.fillStyle = '#2C1A14'
    ctx.fillRect(x + ox - 1.4, y + oy, 2.8, 9)
    ctx.fillRect(x + ox - 4, y + oy + 2.5, 8, 2.4)
  }
  doorArch(ctx, x, y, 11, 15)
  // the fleur banner snapping from the cone
  const wave = Math.sin(t * 3 + e.seed) * 2
  ctx.strokeStyle = '#4A3722'; ctx.lineWidth = 1.3
  ctx.beginPath(); ctx.moveTo(x, y - 88); ctx.lineTo(x, y - 102); ctx.stroke()
  ctx.fillStyle = '#2F4A8B'
  ctx.beginPath()
  ctx.moveTo(x, y - 102)
  ctx.lineTo(x + 15, y - 99 + wave * 0.4)
  ctx.lineTo(x, y - 94)
  ctx.closePath(); ctx.fill()
  fleur(ctx, x + 5.5, y - 98.5, 4.5)
}

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
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  shadow(ctx, x, y + 8, 46, 15)
  plot(ctx, x, y + 6, 60)

  // A hall grows into a keep as the age turns: timber and thatch in the Dark
  // Age, plaster with a tiled roof in the Feudal, flanking stone towers in the
  // Castle. Same footprint throughout, so the village silhouette stays legible.
  const stone = age >= 3
  if (stone) {
    tower(ctx, x - 30, y - 2, 7, 30, 'stone', 'tile')
    tower(ctx, x + 30, y - 2, 7, 30, 'stone', 'tile')
  }
  const wallMat: Mat = age >= 3 ? 'stone' : age >= 2 ? 'plaster' : 'timber'
  const roofMat: RoofMat = age >= 2 ? 'tile' : 'thatch'
  facade(ctx, x, y, 52, 26, wallMat)
  if (age === 2) timberFrame(ctx, x, y, 52, 26, 4)
  roof(ctx, x, y - 26, 52, 24, roofMat, 0.16)

  doorArch(ctx, x, y, 12, 17)
  windowSlot(ctx, x - 17, y - 9, 5, 7, age >= 2)
  windowSlot(ctx, x + 17, y - 9, 5, 7, age >= 2)
  chimney(ctx, x + 20, y - 40, 6, 12)
  chimneySmoke(ctx, x + 20, y - 52, t, e.seed)

  // the bell in its gable cote, swinging while villagers shelter inside
  const ringing = (e.garrison ?? 0) > 0
  const swing = ringing ? Math.sin(t * 9) * 0.5 : 0
  ctx.fillStyle = STONE_LIT
  ctx.beginPath(); ctx.arc(x, y - 42, 5.5, Math.PI, 0); ctx.fill()
  ctx.save()
  ctx.translate(x, y - 44)
  ctx.rotate(swing)
  ctx.fillStyle = '#C89A3A'
  ctx.beginPath()
  ctx.moveTo(-3, 4.5); ctx.lineTo(-1.6, -1); ctx.lineTo(1.6, -1); ctx.lineTo(3, 4.5)
  ctx.closePath(); ctx.fill()
  ctx.restore()

  // the team's colours hung from the wall plate
  ctx.fillStyle = c.main
  ctx.fillRect(x - 30, y - 26, 60, 2.6)
  ctx.fillStyle = c.dark
  ctx.fillRect(x - 30, y - 23.6, 60, 1.2)
}

export function drawHouse(ctx: CanvasRenderingContext2D, e: Ent, t: number, age = 2): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 5, 24, 8)
  plot(ctx, x, y + 4, 32)
  // cottages vary a little by seed so a street of them isn't a row of clones
  const wide = 26 + (e.seed % 3) * 3
  const wallMat: Mat = age >= 2 ? 'plaster' : 'timber'
  const roofMat: RoofMat = age >= 2 ? 'tile' : 'thatch'
  facade(ctx, x, y, wide, 15, wallMat)
  if (age >= 2) timberFrame(ctx, x, y, wide, 15, 2 + (e.seed % 2))
  roof(ctx, x, y - 15, wide, 15, roofMat, 0.18)
  doorArch(ctx, x - wide * 0.18, y, 6, 9)
  windowSlot(ctx, x + wide * 0.24, y - 6, 4.5, 5, age >= 2)
  chimney(ctx, x + wide * 0.34, y - 27, 4, 8)
  chimneySmoke(ctx, x + wide * 0.34, y - 35, t, e.seed)
}

export function drawBarracks(ctx: CanvasRenderingContext2D, e: Ent, t: number, age = 2): void {
  const x = e.x, y = e.y
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  shadow(ctx, x, y + 6, 38, 13)
  plot(ctx, x, y + 5, 50)
  const wallMat: Mat = age >= 3 ? 'stone' : age >= 2 ? 'plaster' : 'timber'
  facade(ctx, x, y, 46, 22, wallMat)
  if (age >= 2) timberFrame(ctx, x, y, 46, 22, 3)
  roof(ctx, x, y - 22, 46, 19, age >= 2 ? 'tile' : 'thatch', 0.15)
  // the hall wears its team's colours along the wall plate
  ctx.fillStyle = c.main
  ctx.fillRect(x - 26, y - 22, 52, 2.4)
  doorArch(ctx, x, y, 11, 15)
  windowSlot(ctx, x - 15, y - 8, 4.5, 6, age >= 2)
  windowSlot(ctx, x + 15, y - 8, 4.5, 6, age >= 2)
  // crossed swords hung above the door
  ctx.strokeStyle = '#B9BFC7'; ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(x - 6, y - 26); ctx.lineTo(x + 6, y - 34)
  ctx.moveTo(x + 6, y - 26); ctx.lineTo(x - 6, y - 34)
  ctx.stroke()
  flag(ctx, x + 25, y - 40, e.team, t + e.seed, bannerTint(e))
}

export function drawLumberCamp(ctx: CanvasRenderingContext2D, e: Ent): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 5, 26, 9)
  plot(ctx, x, y + 4, 34)
  // an open-sided lean-to: four posts and a single sloping roof, so the
  // stacked timber underneath stays visible
  ctx.strokeStyle = BEAM
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x - 17, y + 3); ctx.lineTo(x - 17, y - 16)
  ctx.moveTo(x + 17, y + 3); ctx.lineTo(x + 17, y - 11)
  ctx.stroke()
  // the sloping roof plane, lit along its upper edge
  ctx.fillStyle = THATCH_MID
  ctx.beginPath()
  ctx.moveTo(x - 22, y - 15)
  ctx.lineTo(x + 22, y - 10)
  ctx.lineTo(x + 22, y - 6)
  ctx.lineTo(x - 22, y - 11)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = THATCH_LIT
  ctx.beginPath()
  ctx.moveTo(x - 22, y - 15)
  ctx.lineTo(x + 22, y - 10)
  ctx.lineTo(x + 22, y - 8.5)
  ctx.lineTo(x - 22, y - 13.5)
  ctx.closePath(); ctx.fill()
  // cut logs stacked end-on under the shelter
  for (const [ox, oy] of [[-9, 2], [-1, 2], [7, 2], [-5, -3], [3, -3]]) {
    ctx.fillStyle = BARK
    ctx.beginPath(); ctx.arc(x + ox, y + oy, 4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#B79A76'
    ctx.beginPath(); ctx.arc(x + ox, y + oy, 2.1, 0, Math.PI * 2); ctx.fill()
  }
  // an axe left in the chopping block
  ctx.fillStyle = BARK
  rr(ctx, x + 21, y - 1, 9, 7, 2); ctx.fill()
  ctx.save()
  ctx.translate(x + 25.5, y - 1)
  ctx.rotate(-0.6)
  ctx.strokeStyle = '#6B5238'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -9); ctx.stroke()
  ctx.fillStyle = '#B9BFC7'
  rr(ctx, -0.5, -12, 5, 3.4, 1.5); ctx.fill()
  ctx.restore()
}

export function drawMiningCamp(ctx: CanvasRenderingContext2D, e: Ent): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 5, 26, 9)
  plot(ctx, x, y + 4, 34)
  // a squat drystone hut — the miners' shelter is the crudest thing they build
  facade(ctx, x, y, 32, 14, 'stone')
  roof(ctx, x, y - 14, 32, 11, 'slate', 0.2)
  doorArch(ctx, x - 2, y, 8, 10)
  // the ore crate beside the door
  ctx.fillStyle = '#5B4630'
  rr(ctx, x + 18, y - 8, 13, 9, 1.5); ctx.fill()
  ctx.fillStyle = '#4A3722'
  ctx.fillRect(x + 18, y - 5, 13, 1.2)
  ctx.fillStyle = '#C89A3A'
  for (const [ox, oy] of [[3, -3], [7, -4.5], [9.5, -2.5]]) {
    ctx.beginPath(); ctx.arc(x + 18 + ox, y - 8 + oy, 2.2, 0, Math.PI * 2); ctx.fill()
  }
  // a pick leaning on the wall
  ctx.strokeStyle = '#6B5238'; ctx.lineWidth = 1.8
  ctx.beginPath(); ctx.moveTo(x - 14, y - 1); ctx.lineTo(x - 11, y - 13); ctx.stroke()
  ctx.strokeStyle = '#B9BFC7'; ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.arc(x - 10.6, y - 14, 4, 2.5, 4.4); ctx.stroke()
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

// A gate lies along its fence, but its posts still STAND UP: rotating the whole
// sprite tipped them over on steep runs, which is why angled gates looked so
// odd. Only the ground plan turns — each upright is drawn vertical at its own
// spot along the run, nearest last so it overlaps properly.
export function drawGate(ctx: CanvasRenderingContext2D, e: Ent, t: number, open = false): void {
  const a = e.angle ?? 0
  const ux = Math.cos(a), uy = Math.sin(a)
  const at = (u: number): [number, number] => [e.x + ux * u, e.y + uy * u]
  // shadow pooled along the run
  ctx.save()
  ctx.fillStyle = 'rgba(70, 92, 48, 0.18)'
  ctx.beginPath()
  ctx.ellipse(e.x, e.y + 9, 17, 5.5, a, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  const [ax, ay] = at(-13), [bx, by] = at(13)
  // lintel beam bridging the post tops, drawn before the posts it rests on
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(ax, ay - 19); ctx.lineTo(bx, by - 19); ctx.stroke()
  // the doors, hung between the posts
  const doors: [number, number][] = open ? [[-11, 4], [11, 4]] : [[-5.5, 9.4], [5.5, 9.4]]
  for (const [u, w] of doors) {
    const [dx2, dy2] = at(u)
    ctx.fillStyle = '#A9855C'
    rr(ctx, dx2 - w / 2, dy2 - 9, w, 19, 2); ctx.fill()
    if (!open) {
      ctx.strokeStyle = WOOD_DARK; ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(dx2 - w / 2 + 1, dy2 - 7.5); ctx.lineTo(dx2 + w / 2 - 1, dy2 + 8.5)
      ctx.moveTo(dx2 + w / 2 - 1, dy2 - 7.5); ctx.lineTo(dx2 - w / 2 + 1, dy2 + 8.5)
      ctx.stroke()
    }
  }
  // The two heavy gateposts, upright wherever the run points, far one first.
  // They stand taller than fence posts and carry a pennant, so a gateway is
  // obvious even on a run pointing straight at you, where the doors stack up
  // and all but disappear.
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  const posts: [number, number][] = ay <= by ? [[ax, ay], [bx, by]] : [[bx, by], [ax, ay]]
  posts.forEach(([px, py], i) => {
    ctx.fillStyle = WOOD
    rr(ctx, px - 4, py - 21, 8, 32, 2.5); ctx.fill()
    ctx.beginPath()
    ctx.moveTo(px - 4, py - 20)
    ctx.lineTo(px, py - 26)
    ctx.lineTo(px + 4, py - 26 + 6)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = WOOD_DARK
    rr(ctx, px - 5, py - 20.5, 10, 3, 1.5); ctx.fill() // capping band
    if (i === 1) { // one pennant, on the near post
      ctx.strokeStyle = WOOD_DARK; ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.moveTo(px, py - 25); ctx.lineTo(px, py - 34); ctx.stroke()
      ctx.fillStyle = c.main
      ctx.beginPath()
      ctx.moveTo(px, py - 34)
      ctx.lineTo(px + 8, py - 31.5)
      ctx.lineTo(px, py - 29)
      ctx.closePath(); ctx.fill()
    }
  })
}

// ---------- Landmarks ----------

export function drawAbbeyMill(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 7, 40, 14)
  plot(ctx, x, y + 6, 54)
  // an abbey range with the mill leat running under its gable end
  facade(ctx, x - 4, y, 46, 24, 'stone')
  roof(ctx, x - 4, y - 24, 46, 19, 'slate', 0.14)
  for (const ox of [-20, -10, 2, 12]) windowSlot(ctx, x + ox, y - 8, 5, 11, true)
  doorArch(ctx, x - 4, y, 11, 15)
  // a little bellcote on the ridge
  ctx.fillStyle = STONE_LIT
  ctx.beginPath()
  ctx.moveTo(x - 12, y - 43); ctx.lineTo(x - 4, y - 52); ctx.lineTo(x + 4, y - 43)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#2C241A'
  ctx.fillRect(x - 7, y - 45, 6, 5)
  // the mill leat and its wheel
  ctx.fillStyle = 'rgba(96, 124, 132, 0.5)'
  ctx.beginPath(); ctx.ellipse(x + 26, y - 1, 13, 5, 0, 0, Math.PI * 2); ctx.fill()
  const hub = { x: x + 26, y: y - 11 }
  ctx.save()
  ctx.translate(hub.x, hub.y)
  ctx.rotate(t * 0.6)
  ctx.strokeStyle = '#5B4630'
  ctx.lineWidth = 2
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4)
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -11); ctx.stroke()
    ctx.fillStyle = '#7C6244'
    ctx.fillRect(-3, -12.5, 6, 3)
  }
  ctx.restore()
  ctx.strokeStyle = '#4A3722'; ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.arc(hub.x, hub.y, 11.5, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#3A2C1C'
  ctx.beginPath(); ctx.arc(hub.x, hub.y, 2.4, 0, Math.PI * 2); ctx.fill()
}

export function drawKingsBarracks(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  shadow(ctx, x, y + 7, 42, 15)
  plot(ctx, x, y + 6, 58)
  // the King's own hall: a stone range with a drum tower at each shoulder
  tower(ctx, x - 30, y - 2, 8, 34, 'stone', 'slate')
  tower(ctx, x + 30, y - 2, 8, 34, 'stone', 'slate')
  facade(ctx, x, y, 50, 26, 'stone')
  roof(ctx, x, y - 26, 50, 20, 'slate', 0.14)
  for (const ox of [-17, 17]) windowSlot(ctx, x + ox, y - 9, 5, 10, true)
  doorArch(ctx, x, y, 14, 19)
  // a battlemented parapet along the wall head
  ctx.fillStyle = STONE_LIT
  for (const ox of [-24, -16, -8, 0, 8, 16]) ctx.fillRect(x + ox, y - 30, 5, 4.4)
  ctx.fillStyle = c.main
  ctx.fillRect(x - 26, y - 26, 52, 2.6)
  // crossed swords over the door
  ctx.strokeStyle = '#C4CAD2'; ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x - 7, y - 30); ctx.lineTo(x + 7, y - 40)
  ctx.moveTo(x + 7, y - 30); ctx.lineTo(x - 7, y - 40)
  ctx.stroke()
  flag(ctx, x, y - 52, e.team, t + e.seed + 2, bannerTint(e))
}

export function drawGuildhall(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 7, 40, 14)
  plot(ctx, x, y + 6, 54)
  // a wealthy merchants' hall: jettied upper floor oversailing the ground
  // storey, the way a guildhall shows off its money
  facade(ctx, x, y, 42, 15, 'plaster')
  facade(ctx, x, y - 15, 50, 16, 'plaster')
  timberFrame(ctx, x, y - 15, 50, 16, 4)
  ctx.fillStyle = 'rgba(48, 40, 30, 0.2)' // the jetty's underside shadow
  ctx.fillRect(x - 25, y - 15, 50, 2)
  roof(ctx, x, y - 31, 50, 20, 'tile', 0.16)
  doorArch(ctx, x, y, 12, 14)
  for (const ox of [-16, 16]) windowSlot(ctx, x + ox, y - 4, 6, 7, false)
  for (const ox of [-18, -6, 6, 18]) windowSlot(ctx, x + ox, y - 19, 5, 8, false)
  chimney(ctx, x + 19, y - 48, 6, 12)
  chimneySmoke(ctx, x + 19, y - 60, t, e.seed)
  // the guild's scales hung above the door
  ctx.strokeStyle = '#C89A3A'; ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.moveTo(x - 7, y - 34); ctx.lineTo(x + 7, y - 34)
  ctx.moveTo(x, y - 34); ctx.lineTo(x, y - 38)
  ctx.moveTo(x - 7, y - 34); ctx.lineTo(x - 7, y - 31)
  ctx.moveTo(x + 7, y - 34); ctx.lineTo(x + 7, y - 31)
  ctx.stroke()
  ctx.fillStyle = '#C89A3A'
  ctx.beginPath(); ctx.ellipse(x - 7, y - 30.5, 3, 1.4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(x + 7, y - 30.5, 3, 1.4, 0, 0, Math.PI * 2); ctx.fill()
}

export function drawWhiteKeep(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 7, 38, 14)
  plot(ctx, x, y + 6, 52)
  // a great square keep in pale ashlar, corner turrets, no roof to speak of —
  // the silhouette is all mass and battlement
  ctx.fillStyle = '#C8C2B2'
  ctx.fillRect(x - 22, y - 52, 44, 52)
  ctx.globalAlpha = 0.6
  ctx.fillStyle = '#DED8C8'
  ctx.fillRect(x - 22, y - 52, 13, 52)
  ctx.fillStyle = '#A29C8C'
  ctx.fillRect(x + 8, y - 52, 14, 52)
  ctx.globalAlpha = 1
  ctx.strokeStyle = 'rgba(120, 114, 100, 0.3)'
  ctx.lineWidth = 0.7
  ctx.beginPath()
  for (let sy = y - 47; sy < y - 2; sy += 5) { ctx.moveTo(x - 22, sy); ctx.lineTo(x + 22, sy) }
  ctx.stroke()
  // corner turrets standing proud of the wall head
  for (const ox of [-25, 25]) {
    ctx.fillStyle = '#C8C2B2'
    ctx.fillRect(x + ox - 5, y - 60, 10, 60)
    ctx.fillStyle = ox < 0 ? '#DED8C8' : '#A29C8C'
    ctx.fillRect(x + ox - 5, y - 60, 3.4, 60)
    ctx.fillStyle = '#DED8C8'
    for (const mx of [-5, -0.5, 4]) ctx.fillRect(x + ox + mx, y - 64, 3, 4.4)
  }
  // battlements along the main wall
  ctx.fillStyle = '#DED8C8'
  for (const ox of [-19, -12, -5, 2, 9, 16]) ctx.fillRect(x + ox, y - 56, 4.6, 4.6)
  // forebuilding and the stair up to the great door
  ctx.fillStyle = '#B8B2A2'
  ctx.fillRect(x - 9, y - 18, 18, 18)
  doorArch(ctx, x, y, 11, 15)
  for (const [ox, oy] of [[-13, -26], [13, -26], [-13, -40], [13, -40]] as [number, number][]) {
    windowSlot(ctx, x + ox, y + oy, 3.4, 8, true)
  }
  // a pennant snapping from the left turret
  const wave = Math.sin(t * 3 + e.seed) * 2
  ctx.strokeStyle = '#6B5238'; ctx.lineWidth = 1.4
  ctx.beginPath(); ctx.moveTo(x - 25, y - 64); ctx.lineTo(x - 25, y - 78); ctx.stroke()
  ctx.fillStyle = '#B4432E'
  ctx.beginPath()
  ctx.moveTo(x - 25, y - 78)
  ctx.lineTo(x - 25 + 14, y - 75 + wave * 0.4)
  ctx.lineTo(x - 25, y - 71)
  ctx.closePath(); ctx.fill()
}

export function drawStable(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  shadow(ctx, x, y + 6, 38, 13)
  plot(ctx, x, y + 5, 50)
  // long and low, with the big doors a horse can actually get through
  facade(ctx, x, y, 46, 18, 'timber')
  timberFrame(ctx, x, y, 46, 18, 4)
  roof(ctx, x, y - 18, 46, 16, 'thatch', 0.16)
  // the stable door, split so the top half stands open
  ctx.fillStyle = '#3A2C1C'
  ctx.fillRect(x - 8, y - 15, 16, 8)
  doorArch(ctx, x, y, 16, 8)
  // a horse looking out over the bottom half, nodding
  const nod = Math.sin(t * 1.6 + e.seed) * 1.2
  ctx.save()
  ctx.translate(x, y - 11 + nod)
  ctx.fillStyle = '#6B4E33'
  ctx.beginPath()
  ctx.ellipse(0, 0, 3.4, 4.6, 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#4A3524'
  ctx.beginPath(); ctx.ellipse(-1.4, -3.4, 1.2, 2.2, -0.3, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#2A1F14'
  ctx.beginPath(); ctx.arc(1.4, -0.4, 0.7, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  // a hay rack against the gable end
  ctx.fillStyle = '#B39A5E'
  ctx.beginPath()
  ctx.moveTo(x + 20, y - 2); ctx.lineTo(x + 30, y - 2); ctx.lineTo(x + 27, y - 9); ctx.lineTo(x + 23, y - 9)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = c.main
  ctx.fillRect(x - 26, y - 18, 52, 2.2)
  flag(ctx, x + 26, y - 34, e.team, t + e.seed, bannerTint(e))
}

export function drawBlacksmith(ctx: CanvasRenderingContext2D, e: Ent, t: number): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 5, 30, 11)
  plot(ctx, x, y + 4, 40)
  facade(ctx, x, y, 36, 17, 'stone')
  roof(ctx, x, y - 17, 36, 14, 'slate', 0.16)
  chimney(ctx, x + 13, y - 31, 6, 11)
  // the forge mouth, breathing
  const glow = 0.55 + Math.sin(t * 5 + e.seed) * 0.18
  ctx.fillStyle = '#241A12'
  ctx.beginPath()
  ctx.moveTo(x - 11, y); ctx.lineTo(x - 11, y - 9); ctx.arc(x - 5, y - 9, 6, Math.PI, 0); ctx.lineTo(x + 1, y)
  ctx.closePath(); ctx.fill()
  ctx.globalAlpha = glow
  ctx.fillStyle = '#E0722A'
  ctx.beginPath(); ctx.ellipse(x - 5, y - 4, 4.6, 4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#F5C24A'
  ctx.beginPath(); ctx.ellipse(x - 5, y - 3, 2.4, 2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  // the anvil out front, catching the same light
  ctx.fillStyle = '#4C525A'
  ctx.beginPath()
  ctx.moveTo(x + 9, y - 1); ctx.lineTo(x + 20, y - 1); ctx.lineTo(x + 18, y - 5)
  ctx.lineTo(x + 21, y - 7); ctx.lineTo(x + 8, y - 7); ctx.lineTo(x + 11, y - 5)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#666D76'
  ctx.fillRect(x + 8, y - 7.6, 13, 1.2)
}

export function drawMill(ctx: CanvasRenderingContext2D, e: Ent, t: number, age = 2): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 5, 26, 10)
  plot(ctx, x, y + 4, 36)
  // a tower mill: a tapering stone body under a cap, sails turning on the front
  ctx.fillStyle = STONE_MID
  ctx.beginPath()
  ctx.moveTo(x - 13, y)
  ctx.lineTo(x - 9, y - 30)
  ctx.lineTo(x + 9, y - 30)
  ctx.lineTo(x + 13, y)
  ctx.closePath(); ctx.fill()
  ctx.globalAlpha = 0.55
  ctx.fillStyle = STONE_LIT
  ctx.beginPath()
  ctx.moveTo(x - 13, y); ctx.lineTo(x - 9, y - 30); ctx.lineTo(x - 3, y - 30); ctx.lineTo(x - 6, y)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = STONE_SHADE
  ctx.beginPath()
  ctx.moveTo(x + 5, y); ctx.lineTo(x + 4, y - 30); ctx.lineTo(x + 9, y - 30); ctx.lineTo(x + 13, y)
  ctx.closePath(); ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = 'rgba(96, 90, 78, 0.32)'
  ctx.lineWidth = 0.7
  ctx.beginPath()
  for (let sy = y - 26; sy < y - 2; sy += 5) { ctx.moveTo(x - 12.5, sy); ctx.lineTo(x + 12.5, sy) }
  ctx.stroke()
  doorArch(ctx, x, y, 8, 11)
  windowSlot(ctx, x, y - 18, 4, 5, true)
  // the cap
  const [cs, cm, cl] = ['#4A3722', '#63482D', '#7C5C3A']
  ctx.fillStyle = cm
  ctx.beginPath()
  ctx.moveTo(x - 12, y - 30); ctx.quadraticCurveTo(x, y - 42, x + 12, y - 30)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = cl
  ctx.beginPath()
  ctx.moveTo(x - 12, y - 30); ctx.quadraticCurveTo(x - 5, y - 40, x - 1, y - 39)
  ctx.lineTo(x - 3, y - 30)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = cs
  ctx.beginPath()
  ctx.moveTo(x + 4, y - 30); ctx.quadraticCurveTo(x + 8, y - 37, x + 12, y - 30)
  ctx.closePath(); ctx.fill()
  // sails, turning
  ctx.save()
  ctx.translate(x, y - 33)
  ctx.rotate(t * 0.45 + (e.seed % 7))
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2)
    ctx.strokeStyle = '#4A3722'
    ctx.lineWidth = 1.8
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -17); ctx.stroke()
    ctx.fillStyle = 'rgba(226, 216, 192, 0.85)'
    ctx.fillRect(0.8, -16, 4.2, 12)
    ctx.strokeStyle = 'rgba(90, 74, 52, 0.5)'
    ctx.lineWidth = 0.6
    ctx.beginPath(); ctx.moveTo(0.8, -10); ctx.lineTo(5, -10); ctx.stroke()
  }
  ctx.restore()
  ctx.fillStyle = '#3A2C1C'
  ctx.beginPath(); ctx.arc(x, y - 33, 2, 0, Math.PI * 2); ctx.fill()
  // sacks of meal at the door
  ctx.fillStyle = '#B8A57C'
  for (const [ox, oy, r] of [[-17, -3, 4], [-21, -2, 3.2]]) {
    ctx.beginPath(); ctx.ellipse(x + ox, y + oy, r, r * 0.85, 0.2, 0, Math.PI * 2); ctx.fill()
  }
}

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
  shadow(ctx, x, y + 4, 20, 8)
  plot(ctx, x, y + 3, 30)
  // a stone shaft with a battlemented head — no cap, so the garrison can shoot
  ctx.fillStyle = STONE_MID
  ctx.beginPath()
  ctx.moveTo(x - 13, y); ctx.lineTo(x - 10, y - 34); ctx.lineTo(x + 10, y - 34); ctx.lineTo(x + 13, y)
  ctx.closePath(); ctx.fill()
  ctx.globalAlpha = 0.55
  ctx.fillStyle = STONE_LIT
  ctx.beginPath()
  ctx.moveTo(x - 13, y); ctx.lineTo(x - 10, y - 34); ctx.lineTo(x - 4, y - 34); ctx.lineTo(x - 6, y)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = STONE_SHADE
  ctx.beginPath()
  ctx.moveTo(x + 5, y); ctx.lineTo(x + 4, y - 34); ctx.lineTo(x + 10, y - 34); ctx.lineTo(x + 13, y)
  ctx.closePath(); ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = 'rgba(96, 90, 78, 0.3)'
  ctx.lineWidth = 0.7
  ctx.beginPath()
  for (let sy = y - 30; sy < y - 2; sy += 4.5) { ctx.moveTo(x - 12.5, sy); ctx.lineTo(x + 12.5, sy) }
  ctx.stroke()
  doorArch(ctx, x, y, 7, 10)
  windowSlot(ctx, x, y - 20, 3, 6, true)
  // the machicolated gallery, jutting out over the wall below
  ctx.fillStyle = STONE_LIT
  ctx.fillRect(x - 16, y - 40, 32, 6)
  ctx.fillStyle = 'rgba(48, 42, 34, 0.28)'
  ctx.fillRect(x - 16, y - 34.6, 32, 1.4)
  // merlons along the top
  ctx.fillStyle = STONE_MID
  for (const ox of [-16, -9, -2, 5, 12]) ctx.fillRect(x + ox, y - 45, 4.6, 5.4)
  ctx.fillStyle = STONE_LIT
  for (const ox of [-16, -9, -2, 5, 12]) ctx.fillRect(x + ox, y - 45, 1.6, 5.4)
  // garrison watching from between the merlons
  const inside = Math.min(e.garrison ?? 0, 3)
  for (let i = 0; i < inside; i++) {
    const hx = x - 8 + i * 8
    ctx.fillStyle = SKIN
    ctx.beginPath(); ctx.arc(hx, y - 43, 2.6, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = c.main
    ctx.beginPath(); ctx.arc(hx, y - 44.4, 2.7, Math.PI, 0); ctx.fill()
  }
  flag(ctx, x + 14, y - 52, e.team, t + e.seed)
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
  shadow(ctx, x, y + 6, 34, 12)
  plot(ctx, x, y + 5, 46)
  // nave and a west tower — the plainest thing in the meadow that still
  // reads instantly as a church
  facade(ctx, x + 4, y, 38, 20, 'stone')
  roof(ctx, x + 4, y - 20, 38, 16, 'slate', 0.14)
  // the tower, taller than the ridge, with a spire
  ctx.fillStyle = STONE_MID
  ctx.fillRect(x - 24, y - 40, 17, 40)
  ctx.globalAlpha = 0.55
  ctx.fillStyle = STONE_LIT
  ctx.fillRect(x - 24, y - 40, 5.5, 40)
  ctx.fillStyle = STONE_SHADE
  ctx.fillRect(x - 12, y - 40, 5, 40)
  ctx.globalAlpha = 1
  ctx.strokeStyle = 'rgba(96, 90, 78, 0.3)'
  ctx.lineWidth = 0.7
  ctx.beginPath()
  for (let sy = y - 36; sy < y - 2; sy += 5) { ctx.moveTo(x - 24, sy); ctx.lineTo(x - 7, sy) }
  ctx.stroke()
  // the belfry opening and the bell inside it
  ctx.fillStyle = '#2C241A'
  ctx.beginPath()
  ctx.moveTo(x - 20, y - 28); ctx.lineTo(x - 20, y - 34); ctx.arc(x - 15.5, y - 34, 4.5, Math.PI, 0)
  ctx.lineTo(x - 11, y - 28)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#C89A3A'
  ctx.beginPath()
  ctx.moveTo(x - 18, y - 30); ctx.lineTo(x - 17, y - 34); ctx.lineTo(x - 14, y - 34); ctx.lineTo(x - 13, y - 30)
  ctx.closePath(); ctx.fill()
  // the spire
  ctx.fillStyle = SLATE_MID
  ctx.beginPath()
  ctx.moveTo(x - 26, y - 40); ctx.lineTo(x - 15.5, y - 60); ctx.lineTo(x - 5, y - 40)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = SLATE_LIT
  ctx.beginPath()
  ctx.moveTo(x - 26, y - 40); ctx.lineTo(x - 15.5, y - 60); ctx.lineTo(x - 15.5, y - 40)
  ctx.closePath(); ctx.fill()
  // a cross on the ridge
  ctx.strokeStyle = '#C89A3A'; ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(x - 15.5, y - 60); ctx.lineTo(x - 15.5, y - 67)
  ctx.moveTo(x - 18.5, y - 64); ctx.lineTo(x - 12.5, y - 64)
  ctx.stroke()
  // the great window over the door
  ctx.fillStyle = '#2C241A'
  ctx.beginPath()
  ctx.moveTo(x - 2, y - 12); ctx.lineTo(x - 2, y - 20); ctx.arc(x + 3, y - 20, 5, Math.PI, 0)
  ctx.lineTo(x + 8, y - 12)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = 'rgba(196, 150, 92, 0.5)'
  ctx.beginPath(); ctx.arc(x + 3, y - 19, 3.2, 0, Math.PI * 2); ctx.fill()
  doorArch(ctx, x + 3, y, 10, 14)
  relicPips(ctx, x + 4, y + 3, relics)
}

export function drawMinistry(ctx: CanvasRenderingContext2D, e: Ent, t: number, relics = 0): void {
  const x = e.x, y = e.y
  shadow(ctx, x, y + 7, 40, 14)
  plot(ctx, x, y + 6, 54)
  // a grander house of record: a long stone range with a domed lantern and
  // banners either side of the door
  facade(ctx, x, y, 50, 24, 'stone')
  roof(ctx, x, y - 24, 50, 17, 'slate', 0.14)
  // the lantern riding the ridge
  ctx.fillStyle = STONE_LIT
  ctx.fillRect(x - 8, y - 52, 16, 11)
  ctx.fillStyle = STONE_SHADE
  ctx.fillRect(x + 3, y - 52, 5, 11)
  ctx.fillStyle = '#2C241A'
  ctx.fillRect(x - 5, y - 49, 4, 6)
  ctx.fillRect(x + 1, y - 49, 4, 6)
  // the dome
  ctx.fillStyle = '#5E7B6E'
  ctx.beginPath(); ctx.ellipse(x, y - 52, 11, 9, 0, Math.PI, 0); ctx.fill()
  ctx.fillStyle = '#7A9A8A'
  ctx.beginPath(); ctx.ellipse(x - 3, y - 52, 6, 7, 0, Math.PI, Math.PI * 1.6); ctx.fill()
  ctx.fillStyle = '#C89A3A'
  ctx.beginPath(); ctx.arc(x, y - 62, 2, 0, Math.PI * 2); ctx.fill()
  // tall windows down the front
  for (const ox of [-19, -11, 11, 19]) windowSlot(ctx, x + ox, y - 7, 5, 11, true)
  doorArch(ctx, x, y, 13, 18)
  // hanging banners either side of the door, stirring
  const wave = Math.sin(t * 3 + e.seed) * 1.6
  for (const [ox, col] of [[-9, '#8E3526'], [9, '#2F4A6B']] as [number, string][]) {
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.moveTo(x + ox - 3, y - 22)
    ctx.lineTo(x + ox + 3, y - 22)
    ctx.lineTo(x + ox + 3 + wave * 0.4, y - 9)
    ctx.lineTo(x + ox + wave * 0.5, y - 6)
    ctx.lineTo(x + ox - 3 + wave * 0.4, y - 9)
    ctx.closePath(); ctx.fill()
  }
  relicPips(ctx, x, y + 0, relics)
}

// ---------- the people ----------
// Everyone in the meadow wears the same cut of tunic, so it is shaped once
// here and, more importantly, lit once here: the sun catches the left shoulder
// and the right side falls away. Flat fills are what made a crowd of these
// read as pawns on a board rather than people standing in a field.
const SKIN_SHADE = '#C89A6E'

// Feet alone, tucked straight under a rounded tunic, make an egg with boots.
// A pair of short legs between hem and foot is the whole difference between a
// pawn and a person at this size.
function legs(ctx: CanvasRenderingContext2D, bx: number, groundY: number, by: number,
              spread: number, walk: number, hose: string): void {
  ctx.strokeStyle = hose
  ctx.lineWidth = 2.6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(bx - spread, by + 4); ctx.lineTo(bx - spread, groundY + 3 + walk * 1.2)
  ctx.moveTo(bx + spread, by + 4); ctx.lineTo(bx + spread, groundY + 3 - walk * 1.2)
  ctx.stroke()
}

function tunicPath(ctx: CanvasRenderingContext2D, cx: number, by: number, hw: number): void {
  ctx.beginPath()
  ctx.moveTo(cx - hw * 0.98, by + 5.4)
  ctx.quadraticCurveTo(cx - hw * 0.92, by - 6.4, cx, by - 7.8)
  ctx.quadraticCurveTo(cx + hw * 0.92, by - 6.4, cx + hw * 0.98, by + 5.4)
  ctx.quadraticCurveTo(cx, by + 7.6, cx - hw * 0.98, by + 5.4)
  ctx.closePath()
}

function tunic(ctx: CanvasRenderingContext2D, cx: number, by: number, hw: number,
               fill: string, shade: string, lit?: string): void {
  tunicPath(ctx, cx, by, hw)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.save()
  tunicPath(ctx, cx, by, hw)
  ctx.clip()
  ctx.globalAlpha = 0.42
  ctx.fillStyle = shade
  ctx.fillRect(cx + hw * 0.1, by - 12, hw * 1.2, 24)
  if (lit) {
    ctx.globalAlpha = 0.3
    ctx.fillStyle = lit
    ctx.fillRect(cx - hw * 1.2, by - 12, hw * 0.62, 24)
  }
  ctx.globalAlpha = 1
  ctx.restore()
}

// A head, with the same light on it. No eyes: two dots at this size read as a
// toy, and the meadow is not that kind of place any more.
function headBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  // A shade smaller than the old storybook head. Hats and helms keep their own
  // radii, which is right: a brim should oversail the face it shades.
  r *= 0.88
  ctx.fillStyle = SKIN
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
  ctx.save()
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip()
  ctx.globalAlpha = 0.5
  ctx.fillStyle = SKIN_SHADE
  ctx.fillRect(cx + r * 0.15, cy - r, r, r * 2)
  ctx.globalAlpha = 0.35
  ctx.fillRect(cx - r, cy - r, r * 2, r * 0.5) // brow shadow under hat or helm
  ctx.globalAlpha = 1
  ctx.restore()
}

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
  legs(ctx, bx, e.y + 4, by, 3.5, walk, '#5A4632')
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath(); ctx.ellipse(bx - 3.5, e.y + 4 + walk * 1.2, 2.6, 1.8, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(bx + 3.5, e.y + 4 - walk * 1.2, 2.6, 1.8, 0, 0, Math.PI * 2); ctx.fill()
  // body: rounded tunic in team color
  tunic(ctx, bx, by, 6.5, c.main, c.dark, c.pale)
  // head
  headBall(ctx, bx, by - 11, 6)
  // straw hat
  ctx.fillStyle = '#E8C97A'
  ctx.beginPath(); ctx.ellipse(bx, by - 14.5, 8, 3, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(bx, by - 15.5, 4.4, Math.PI, 0); ctx.fill()
  // a single soft eye-line rather than two dots — enough to say which
  // way the face is turned without reading as a doll
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = '#5A4632'
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.moveTo(bx + f * 2, by - 10.5)
  ctx.lineTo(bx + f * 4.5, by - 10.5)
  ctx.stroke()
  ctx.globalAlpha = 1
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
  legs(ctx, bx, e.y + 4, by, 3.2, walk, '#5A4632')
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath(); ctx.ellipse(bx - 3.2, e.y + 4 + walk * 1.2, 2.5, 1.7, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(bx + 3.2, e.y + 4 - walk * 1.2, 2.5, 1.7, 0, 0, Math.PI * 2); ctx.fill()
  // the long brown habit, hem swaying
  tunic(ctx, bx, by, 7, '#7A5C42', '#4E3A29', '#9B7A5A')
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
  legs(ctx, bx, e.y + 4.4, by, 3.8, walk, '#5A4632')
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath(); ctx.ellipse(bx - 3.8, e.y + 4.4 + walk * 1.2, 2.8, 2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(bx + 3.8, e.y + 4.4 - walk * 1.2, 2.8, 2, 0, 0, Math.PI * 2); ctx.fill()
  // body
  tunic(ctx, bx + lunge, by, 7.5, c.main, c.dark, c.pale)
  // belt
  ctx.fillStyle = c.dark
  rr(ctx, bx - 7 + lunge, by + 0.5, 14, 3, 1.5); ctx.fill()
  // head + round helmet
  headBall(ctx, bx + lunge, by - 12, 6.2)
  ctx.fillStyle = '#C7CCD4'
  ctx.beginPath(); ctx.arc(bx + lunge, by - 13.5, 6.4, Math.PI * 0.98, Math.PI * 2.02); ctx.fill()
  ctx.fillStyle = '#AEB4BF'
  rr(ctx, bx - 6.6 + lunge, by - 14.2, 13.2, 2.4, 1.2); ctx.fill()
  // plume — champions wear the gold
  ctx.fillStyle = champ ? '#E9B44C' : c.main
  ctx.beginPath(); ctx.arc(bx + lunge, by - 19.5, champ ? 3.1 : 2.6, 0, Math.PI * 2); ctx.fill()
  // a single soft eye-line rather than two dots — enough to say which
  // way the face is turned without reading as a doll
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = '#5A4632'
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.moveTo(bx + f * 2 + lunge, by - 11)
  ctx.lineTo(bx + f * 4.6 + lunge, by - 11)
  ctx.stroke()
  ctx.globalAlpha = 1
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
  legs(ctx, bx, e.y + 4.2, by, 3.6, walk, '#5A4632')
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath(); ctx.ellipse(bx - 3.6, e.y + 4.2 + walk * 1.2, 2.6, 1.9, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(bx + 3.6, e.y + 4.2 - walk * 1.2, 2.6, 1.9, 0, 0, Math.PI * 2); ctx.fill()
  // body
  tunic(ctx, bx + lunge, by, 6.5, c.main, c.dark, c.pale)
  // small buckler on the off-hand
  ctx.fillStyle = WOOD
  ctx.beginPath(); ctx.arc(bx - f * 7 + lunge, by - 1.5, 4.2, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#C7CCD4'
  ctx.beginPath(); ctx.arc(bx - f * 7 + lunge, by - 1.5, 1.6, 0, Math.PI * 2); ctx.fill()
  // head + conical cap
  headBall(ctx, bx + lunge, by - 11.5, 6)
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
  // a single soft eye-line rather than two dots — enough to say which
  // way the face is turned without reading as a doll
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = '#5A4632'
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.moveTo(bx + f * 1.8 + lunge, by - 10.8)
  ctx.lineTo(bx + f * 4.2 + lunge, by - 10.8)
  ctx.stroke()
  ctx.globalAlpha = 1
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
  legs(ctx, bx, e.y + 4, by, 3.4, walk, '#5A4632')
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath(); ctx.ellipse(bx - 3.4, e.y + 4 + walk * 1.2, 2.5, 1.8, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(bx + 3.4, e.y + 4 - walk * 1.2, 2.5, 1.8, 0, 0, Math.PI * 2); ctx.fill()
  // body: slim tunic
  tunic(ctx, bx, by, 6, c.main, c.dark, c.pale)
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
  headBall(ctx, bx, by - 11.5, 5.8)
  ctx.fillStyle = champ ? '#C98F2B' : c.dark // champion longbows hood in gold-braid
  ctx.beginPath(); ctx.arc(bx, by - 12.5, 6, Math.PI * 0.9, Math.PI * 2.1); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(bx - f * 2, by - 18)
  ctx.quadraticCurveTo(bx - f * 7, by - 17, bx - f * 8, by - 13)
  ctx.quadraticCurveTo(bx - f * 5, by - 15.5, bx - f * 2.5, by - 16.5)
  ctx.closePath(); ctx.fill()
  // a single soft eye-line rather than two dots — enough to say which
  // way the face is turned without reading as a doll
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = '#5A4632'
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.moveTo(bx + f * 1.8, by - 10.8)
  ctx.lineTo(bx + f * 4.2, by - 10.8)
  ctx.stroke()
  ctx.globalAlpha = 1
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
  shadow(ctx, x, y + 6, 38, 13)
  plot(ctx, x, y + 5, 50)
  facade(ctx, x, y, 44, 18, 'timber')
  timberFrame(ctx, x, y, 44, 18, 3)
  roof(ctx, x, y - 18, 44, 15, 'thatch', 0.16)
  ctx.fillStyle = c.main
  ctx.fillRect(x - 25, y - 18, 50, 2.2)
  doorArch(ctx, x - 6, y, 10, 13)
  // the butts: a straw target on a trestle, arrows in the gold
  ctx.fillStyle = '#6B5238'
  ctx.fillRect(x + 20, y - 9, 2, 9)
  ctx.fillStyle = '#C4AC72'
  ctx.beginPath(); ctx.arc(x + 21, y - 14, 7, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#E4DCC4'
  ctx.beginPath(); ctx.arc(x + 21, y - 14, 4.4, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#B4432E'
  ctx.beginPath(); ctx.arc(x + 21, y - 14, 1.8, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#4A3722'; ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x + 21, y - 14); ctx.lineTo(x + 28, y - 18)
  ctx.moveTo(x + 19, y - 12); ctx.lineTo(x + 26, y - 9)
  ctx.stroke()
  // a rack of staves against the wall
  ctx.strokeStyle = '#6B5238'; ctx.lineWidth = 1.4
  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(x - 20 + i * 3, y - 2); ctx.lineTo(x - 22 + i * 3, y - 15)
  }
  ctx.stroke()
  flag(ctx, x - 24, y - 34, e.team, t + e.seed, bannerTint(e))
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
  headBall(ctx, bxr(e.x, f), by - 20.5, 4.6)
  // feathered cap
  ctx.fillStyle = c.dark
  ctx.beginPath(); ctx.arc(bxr(e.x, f), by - 22, 4.8, Math.PI * 0.95, Math.PI * 2.05); ctx.fill()
  ctx.strokeStyle = '#85B168'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(bxr(e.x, f) - f * 3, by - 25)
  ctx.quadraticCurveTo(bxr(e.x, f) - f * 6, by - 28, bxr(e.x, f) - f * 8, by - 26)
  ctx.stroke()
  // a single soft eye-line rather than two dots — enough to say which
  // way the face is turned without reading as a doll
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = '#5A4632'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(bxr(e.x, f) + f * 1.5, by - 20)
  ctx.lineTo(bxr(e.x, f) + f * 3.4, by - 20)
  ctx.stroke()
  ctx.globalAlpha = 1
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
  // great helm with a plume — steel takes the sun harder than skin does, so
  // it gets a bright edge as well as a shaded side
  ctx.fillStyle = '#AEB4BF'
  ctx.beginPath(); ctx.arc(bxr(e.x, f), by - 22.5, 4.8, 0, Math.PI * 2); ctx.fill()
  ctx.save()
  ctx.beginPath(); ctx.arc(bxr(e.x, f), by - 22.5, 4.8, 0, Math.PI * 2); ctx.clip()
  ctx.fillStyle = '#E4E8EE'
  ctx.fillRect(bxr(e.x, f) - 4.8, by - 27.3, 3.2, 9.6)
  ctx.fillStyle = '#7E858F'
  ctx.fillRect(bxr(e.x, f) + 1.2, by - 27.3, 3.6, 9.6)
  ctx.restore()
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
  const c = TEAM_COLOR[e.team] ?? TEAM_COLOR[0]
  shadow(ctx, x, y + 6, 40, 14)
  plot(ctx, x, y + 5, 54)
  // a great open shed — the work is too big to fit indoors, so the frame is
  // the building and the half-built engine is the sign
  ctx.strokeStyle = BEAM
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(x - 24, y + 2); ctx.lineTo(x - 24, y - 22)
  ctx.moveTo(x + 24, y + 2); ctx.lineTo(x + 24, y - 22)
  ctx.stroke()
  facade(ctx, x, y, 44, 12, 'timber', 0.16)
  roof(ctx, x, y - 22, 52, 16, 'thatch', 0.1)
  ctx.fillStyle = c.main
  ctx.fillRect(x - 28, y - 22, 56, 2.2)
  // a trebuchet frame under the roof, part-raised
  ctx.strokeStyle = '#5B4630'; ctx.lineWidth = 2.6
  ctx.beginPath()
  ctx.moveTo(x - 10, y - 1); ctx.lineTo(x + 2, y - 17)
  ctx.moveTo(x + 12, y - 1); ctx.lineTo(x + 2, y - 17)
  ctx.stroke()
  ctx.strokeStyle = '#6B5238'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x - 8, y - 21); ctx.lineTo(x + 14, y - 12); ctx.stroke()
  ctx.fillStyle = '#4C4238'
  ctx.beginPath(); ctx.arc(x - 9, y - 21.5, 3.4, 0, Math.PI * 2); ctx.fill()
  // timber and a barrel of pitch stacked at the end
  ctx.fillStyle = BARK
  for (const [ox, oy] of [[-19, -3], [-19, -8]]) {
    ctx.beginPath(); ctx.ellipse(x + ox, y + oy, 4.6, 3, 0, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = '#5B4630'
  rr(ctx, x + 18, y - 10, 11, 10, 2); ctx.fill()
  ctx.fillStyle = '#3A2C1C'
  ctx.fillRect(x + 18, y - 6.5, 11, 1.4)
  flag(ctx, x + 27, y - 38, e.team, t + e.seed, bannerTint(e))
}
