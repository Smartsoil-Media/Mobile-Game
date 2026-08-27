// Camera + world rendering.
import { Game, Ent, BUILDINGS, BANNERS, PLACE_SNAP, TILE, TILT, dist, isUnit, isBuilding } from './data'
import { isVisibleToPlayer, canPlaceAt, placementCells, wallLinePoints, fogIndex } from './world'
import { inWater } from './nav'
import {
  drawTree, drawMine, drawBush, drawQuarry, drawDeer, drawCrag, drawCroc, drawTC, drawHouse, drawBarracks,
  drawLumberCamp, drawMiningCamp, drawMill, drawStable, drawFarm, drawWatchtower, drawArcheryRange, drawSite,
  drawWall, drawGate, groundDecal, setDecals, baseSkirt,
  drawAbbeyMill, drawKingsBarracks, drawGuildhall, drawWhiteKeep,
  drawChamberOfCommerce, drawCavalrySchool, drawRoyalVineyard, drawRedPalace,
  drawVillager, drawSwordsman, drawSpearman, drawArcher, drawScout, drawKnight,
  drawRelic, drawChurch, drawMinistry, drawMonk,
  drawSiegeWorkshop, drawMangonel, drawTrebuchet, drawMuster,
} from './sprites'

let groundPattern: CanvasPattern | null = null
let fogCanvas: HTMLCanvasElement | null = null

// Fog overlay drawn from a tiny grid canvas, scaled up so the bilinear
// filtering gives soft cloudy edges. Cosy deep-forest dark, not pure black.
let fogImg: ImageData | null = null
let fogSeenT = -1

function drawFog(ctx: CanvasRenderingContext2D, g: Game): void {
  const { w, h, explored, visible } = g.fog
  if (!fogCanvas || fogCanvas.width !== w || fogCanvas.height !== h) {
    fogCanvas = document.createElement('canvas')
    fogCanvas.width = w
    fogCanvas.height = h
    fogImg = null
    fogSeenT = -1
  }
  const fctx = fogCanvas.getContext('2d')!
  // Vision is recomputed four times a second, but this ran every frame —
  // allocating a fresh ImageData and walking every cell sixty times a second to
  // produce the same picture fifteen times over. g.visionT counts down and is
  // reset on each recompute, so it going UP is the tell that the fog actually
  // moved and the bitmap is worth rebuilding.
  if (!fogImg || g.visionT > fogSeenT) {
    if (!fogImg) fogImg = fctx.createImageData(w, h)
    const d = fogImg.data
    for (let i = 0; i < w * h; i++) {
      const o = i * 4
      d[o] = 74; d[o + 1] = 86; d[o + 2] = 82
      d[o + 3] = explored[i] ? (visible[i] ? 0 : 112) : 244
    }
    fctx.putImageData(fogImg, 0, 0)
  }
  fogSeenT = g.visionT
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(fogCanvas, 0, 0, w, h, 0, 0, w * 32, h * 32)
}

function makeGroundPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  const c = document.createElement('canvas')
  c.width = c.height = 384
  const g = c.getContext('2d')!
  // A real meadow is not one green. It's a mid, slightly grey green broken up
  // by drier and lusher drifts — saturation is what made the old ground read
  // as illustration rather than land, so this palette stays deliberately muted.
  g.fillStyle = '#7C8E55'
  g.fillRect(0, 0, 384, 384)
  const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } })()
  // broad drifts of lusher and drier grass
  for (let i = 0; i < 26; i++) {
    const dry = i % 3 === 0
    g.fillStyle = dry ? 'rgba(154, 145, 96, 0.34)'
      : i % 2 ? 'rgba(139, 156, 96, 0.42)' : 'rgba(106, 126, 72, 0.38)'
    g.beginPath()
    g.ellipse(rnd() * 384, rnd() * 384, 26 + rnd() * 54, 18 + rnd() * 34, rnd() * 3, 0, Math.PI * 2)
    g.fill()
  }
  // fine blade texture, lit from the upper left so the ground has a grain
  for (let i = 0; i < 300; i++) {
    const x = rnd() * 384, y = rnd() * 384
    const lit = rnd() > 0.62
    g.strokeStyle = lit ? 'rgba(168, 184, 118, 0.42)' : 'rgba(84, 100, 56, 0.40)'
    g.lineWidth = rnd() > 0.7 ? 1.2 : 0.8
    const h = 2.5 + rnd() * 3.5
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + 0.8, y - h * 0.6, x + 1.8 + rnd(), y - h)
    g.stroke()
  }
  // scattered dry stalks and seed heads catching the light
  for (let i = 0; i < 34; i++) {
    const x = rnd() * 384, y = rnd() * 384
    g.strokeStyle = 'rgba(186, 172, 112, 0.5)'
    g.lineWidth = 0.9
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1.2, y - 5.5); g.stroke()
    g.fillStyle = 'rgba(198, 184, 124, 0.55)'
    g.beginPath(); g.ellipse(x + 1.3, y - 6.2, 0.9, 1.6, 0.2, 0, Math.PI * 2); g.fill()
  }
  // the odd wildflower — sparse enough to read as chance, not decoration
  for (let i = 0; i < 7; i++) {
    const x = rnd() * 384, y = rnd() * 384
    g.fillStyle = i % 3 === 0 ? 'rgba(214, 206, 186, 0.75)' : 'rgba(198, 176, 96, 0.6)'
    g.beginPath(); g.arc(x, y, 1.3, 0, Math.PI * 2); g.fill()
  }
  return ctx.createPattern(c, 'repeat')!
}

interface View { x0: number; y0: number; x1: number; y1: number }

// ---- terrain character: broad, soft ground zones so the land reads as
// PLACES — lush hollows, dry golden grass, mossy shade, scree aprons, and
// gentle rises — instead of one repeating meadow tile ----
interface Zone { x: number; y: number; r: number; kind: 'lush' | 'dry' | 'moss' | 'scree' | 'rise'; seed: number }
let zones: Zone[] | null = null
let zoneKey = ''
function makeZones(g: Game): Zone[] {
  const rnd = (() => {
    let s = 91 + ((g.mapSeed >>> 0) % 1000000)
    return () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  })()
  const out: Zone[] = []
  const count = Math.round(26 * (g.world.w * g.world.h) / (1920 * 1280))
  const kinds: Zone['kind'][] = ['lush', 'lush', 'dry', 'dry', 'moss', 'scree', 'rise', 'rise']
  for (let i = 0; i < count; i++) {
    out.push({
      x: 120 + rnd() * (g.world.w - 240),
      y: 120 + rnd() * (g.world.h - 240),
      r: 90 + rnd() * 130,
      kind: kinds[Math.floor(rnd() * kinds.length)],
      seed: Math.floor(rnd() * 1000),
    })
  }
  return out
}

function drawZones(ctx: CanvasRenderingContext2D, g: Game, view: View): void {
  const key = `${g.mapSeed}:${g.world.w}x${g.world.h}`
  if (!zones || zoneKey !== key) { zones = makeZones(g); zoneKey = key }
  for (const z of zones) {
    if (z.x + z.r * 1.6 < view.x0 || z.x - z.r * 1.6 > view.x1 ||
      z.y + z.r * 1.2 < view.y0 || z.y - z.r * 1.2 > view.y1) continue
    const blob = (ox: number, oy: number, rx: number, ry: number, fill: string) => {
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.ellipse(z.x + ox, z.y + oy, rx, ry, (z.seed + ox) * 0.1, 0, Math.PI * 2)
      ctx.fill()
    }
    const o = (k: number) => ((z.seed >> k) % 5 - 2) * z.r * 0.14
    if (z.kind === 'lush') {
      blob(o(0), o(1), z.r, z.r * 0.66, 'rgba(126, 152, 82, 0.10)')
      blob(o(2) + z.r * 0.3, o(3), z.r * 0.7, z.r * 0.5, 'rgba(126, 152, 82, 0.08)')
      blob(o(4) - z.r * 0.3, o(5) + z.r * 0.2, z.r * 0.55, z.r * 0.4, 'rgba(140, 164, 96, 0.08)')
    } else if (z.kind === 'dry') {
      blob(o(0), o(1), z.r, z.r * 0.62, 'rgba(176, 164, 106, 0.12)')
      blob(o(2) - z.r * 0.25, o(3) + z.r * 0.15, z.r * 0.6, z.r * 0.42, 'rgba(184, 170, 112, 0.09)')
      // a few straw tufts
      ctx.strokeStyle = 'rgba(162, 148, 92, 0.34)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        const a = z.seed + i * 2.3
        const tx = z.x + Math.cos(a) * z.r * 0.5, ty = z.y + Math.sin(a) * z.r * 0.35
        ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + 2, ty - 6, tx + 4, ty - 9)
        ctx.moveTo(tx + 4, ty); ctx.quadraticCurveTo(tx + 5, ty - 5, tx + 8, ty - 7)
      }
      ctx.stroke()
    } else if (z.kind === 'moss') {
      blob(o(0), o(1), z.r * 0.9, z.r * 0.6, 'rgba(84, 116, 76, 0.09)')
      blob(o(2) + z.r * 0.2, o(3) + z.r * 0.1, z.r * 0.55, z.r * 0.4, 'rgba(74, 104, 70, 0.07)')
    } else if (z.kind === 'scree') {
      blob(o(0), o(1), z.r * 0.8, z.r * 0.5, 'rgba(158, 152, 136, 0.11)')
      for (let i = 0; i < 6; i++) {
        const a = z.seed * 0.7 + i * 1.9
        ctx.fillStyle = i % 2 ? 'rgba(150, 144, 126, 0.55)' : 'rgba(190, 184, 166, 0.6)'
        ctx.beginPath()
        ctx.ellipse(z.x + Math.cos(a) * z.r * 0.45, z.y + Math.sin(a) * z.r * 0.3,
          3.6 - (i % 3), 2.4 - (i % 3) * 0.5, a, 0, Math.PI * 2)
        ctx.fill()
      }
    } else { // rise: a gentle hill swell — soft light on its brow, soft shade below
      blob(0, z.r * 0.12, z.r, z.r * 0.62, 'rgba(66, 84, 44, 0.10)')
      blob(-z.r * 0.08, -z.r * 0.1, z.r * 0.88, z.r * 0.52, 'rgba(255, 252, 235, 0.13)')
      blob(-z.r * 0.16, -z.r * 0.22, z.r * 0.5, z.r * 0.3, 'rgba(255, 252, 235, 0.12)')
    }
  }
}

// ---- streams: winding water with sandy fords, drifting glints, bank reeds ----
function drawStreams(ctx: CanvasRenderingContext2D, g: Game, time: number): void {
  if (!g.streams.length) return
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const s of g.streams) {
    const path = () => {
      ctx.beginPath()
      ctx.moveTo(s.pts[0].x, s.pts[0].y)
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y)
    }
    path(); ctx.strokeStyle = '#C9BC94'; ctx.lineWidth = s.w + 16; ctx.stroke() // muddy banks
    path(); ctx.strokeStyle = '#6D9DC5'; ctx.lineWidth = s.w; ctx.stroke()
    path(); ctx.strokeStyle = '#7FB2D6'; ctx.lineWidth = Math.max(8, s.w - 14); ctx.stroke()
    // glints drifting downstream
    path(); ctx.strokeStyle = 'rgba(232, 244, 252, 0.7)'; ctx.lineWidth = 2.4
    ctx.setLineDash([14, 96]); ctx.lineDashOffset = -time * 26; ctx.stroke()
    ctx.lineWidth = 1.8
    ctx.setLineDash([9, 138]); ctx.lineDashOffset = -time * 18 + 60; ctx.stroke()
    ctx.setLineDash([])
  }
  // one clump of reeds with cattail heads (shared by banks and ford framing)
  const reedClump = (bx: number, by: number, seed: number, sc = 1) => {
    const sway = Math.sin(time * 1.1 + seed) * 1.6 * sc
    ctx.strokeStyle = '#5E8A4E'
    ctx.lineWidth = 1.6 * sc
    ctx.beginPath()
    ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - 2 * sc, by - 9 * sc, bx - 3 * sc + sway, by - 15 * sc)
    ctx.moveTo(bx + 3 * sc, by); ctx.quadraticCurveTo(bx + 3 * sc, by - 10 * sc, bx + 5 * sc + sway, by - 17 * sc)
    ctx.moveTo(bx - 3 * sc, by); ctx.quadraticCurveTo(bx - 5 * sc, by - 7 * sc, bx - 8 * sc + sway, by - 11 * sc)
    ctx.stroke()
    ctx.fillStyle = '#8B6A4A'
    ctx.beginPath(); ctx.ellipse(bx - 3 * sc + sway, by - 15 * sc, 1.6 * sc, 3.4 * sc, 0.15, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(bx + 5 * sc + sway, by - 17 * sc, 1.4 * sc, 3 * sc, -0.1, 0, Math.PI * 2); ctx.fill()
  }
  // the stream's direction where it passes a point (for framing the fords)
  const tangentAt = (x: number, y: number): { tx: number; ty: number } => {
    let best = Infinity, tx = 0, ty = 1
    for (const s of g.streams) {
      for (let i = 0; i + 1 < s.pts.length; i++) {
        const p = s.pts[i], q = s.pts[i + 1]
        const d = Math.hypot(x - (p.x + q.x) / 2, y - (p.y + q.y) / 2)
        if (d < best) {
          best = d
          const dl = Math.hypot(q.x - p.x, q.y - p.y) || 1
          tx = (q.x - p.x) / dl; ty = (q.y - p.y) / dl
        }
      }
    }
    return { tx, ty }
  }
  // fords: the stream itself turns shallow — the sandy bed glows up through
  // clear pale water (no land bridge), and stepping stones march across
  for (const f of g.fords) {
    const { tx: ftx, ty: fty } = tangentAt(f.x, f.y)
    const sw = g.streams[0]?.w ?? 46
    const seg = (len: number) => {
      ctx.beginPath()
      ctx.moveTo(f.x - ftx * len, f.y - fty * len)
      ctx.lineTo(f.x + ftx * len, f.y + fty * len)
    }
    ctx.lineCap = 'round'
    // layered bed strokes feather the shallows into the deep water at each end
    ctx.strokeStyle = 'rgba(219, 205, 162, 0.35)'
    ctx.lineWidth = sw - 2
    seg(f.r * 1.2); ctx.stroke()
    ctx.strokeStyle = 'rgba(219, 205, 162, 0.55)'
    seg(f.r * 0.95); ctx.stroke()
    ctx.strokeStyle = 'rgba(224, 211, 168, 0.65)'
    ctx.lineWidth = sw - 6
    seg(f.r * 0.72); ctx.stroke()
    // and a wash of pale water so the crossing still reads wet
    ctx.strokeStyle = 'rgba(168, 208, 228, 0.4)'
    ctx.lineWidth = sw - 4
    seg(f.r * 1.05); ctx.stroke()
    // stepping stones in a line across the current
    const nx = -fty, ny = ftx
    for (let i = -2; i <= 2; i++) {
      const jig = Math.sin(f.x * 0.11 + i * 3.7)
      const sx = f.x + nx * i * sw * 0.18 + ftx * jig * 5
      const sy = f.y + ny * i * sw * 0.18 + fty * jig * 5
      ctx.fillStyle = (i + 2) % 2 ? '#B8B2A0' : '#CFC9B8'
      ctx.beginPath()
      ctx.ellipse(sx, sy, 5.4, 3.8, jig * 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)' // a wet glint on each stone
      ctx.beginPath()
      ctx.ellipse(sx - 1.2, sy - 1.2, 2, 1.1, jig * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    // ripple feathers where the current meets the shallows
    ctx.strokeStyle = 'rgba(240, 248, 252, 0.5)'
    ctx.lineWidth = 1.3
    for (const dir of [-1, 1]) {
      const cx = f.x + ftx * dir * f.r * 0.8
      const cy = f.y + fty * dir * f.r * 0.8
      ctx.beginPath()
      ctx.moveTo(cx - nx * sw * 0.24, cy - ny * sw * 0.24)
      ctx.quadraticCurveTo(cx + ftx * dir * 5, cy + fty * dir * 5, cx + nx * sw * 0.24, cy + ny * sw * 0.24)
      ctx.stroke()
    }
    // rich reed beds frame the crossing up- and downstream, where the
    // shallows meet deep water — the walking lane between stays open
    const { tx, ty } = tangentAt(f.x, f.y)
    for (const dir of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const along = f.r * (0.72 + k * 0.3)
        const aside = (k - 1) * 14
        reedClump(
          f.x + tx * dir * along - ty * aside,
          f.y + ty * dir * along + tx * aside,
          f.x * 0.03 + dir * 7 + k, 1 + (k === 1 ? 0.25 : 0))
      }
      // a lily pad or two resting just off the shallows
      const lx = f.x + tx * dir * f.r * 1.15 + ty * dir * 6
      const ly = f.y + ty * dir * f.r * 1.15 - tx * dir * 6
      const bob = Math.sin(time * 0.9 + dir + f.x * 0.01) * 1.2
      ctx.fillStyle = '#6F9C55'
      ctx.beginPath()
      ctx.ellipse(lx + bob, ly, 6.5, 4.2, 0.3 * dir, 0.35, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#82AF66'
      ctx.beginPath()
      ctx.ellipse(lx + bob - 4, ly + 5, 4.6, 3, -0.2 * dir, 0.35, Math.PI * 2)
      ctx.fill()
      if (dir > 0) { // one shy blossom
        ctx.fillStyle = '#F0C9CF'
        ctx.beginPath(); ctx.arc(lx + bob + 2, ly - 2, 2, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#E9B44C'
        ctx.beginPath(); ctx.arc(lx + bob + 2, ly - 2, 0.9, 0, Math.PI * 2); ctx.fill()
      }
    }
  }
  // reeds and cattails scattered along the banks between crossings
  for (const s of g.streams) {
    for (let i = 2; i + 1 < s.pts.length; i += 3) {
      const p = s.pts[i], q = s.pts[i + 1]
      const dl = Math.hypot(q.x - p.x, q.y - p.y) || 1
      const nx = -(q.y - p.y) / dl, ny = (q.x - p.x) / dl
      const side = i % 2 ? 1 : -1
      const bx = p.x + nx * side * (s.w / 2 + 10)
      const by = p.y + ny * side * (s.w / 2 + 10)
      if (g.fords.some(f => Math.hypot(bx - f.x, by - f.y) < f.r + 30)) continue
      reedClump(bx, by, i)
    }
  }
}

// Little touches of life scattered over the meadow: pebble clusters, toadstool
// rings, clover patches. Purely decorative, fixed per map, drawn under everything.
interface Decor { x: number; y: number; kind: 'pebbles' | 'mushrooms' | 'clover'; seed: number }
let decor: Decor[] | null = null
let decorKey = ''
function makeDecor(g: Game): Decor[] {
  const rnd = (() => { let s = 4242; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } })()
  const out: Decor[] = []
  const kinds: Decor['kind'][] = ['pebbles', 'mushrooms', 'clover']
  const count = Math.round(46 * (g.world.w * g.world.h) / (1920 * 1280)) // same density on any map
  for (let i = 0; i < count; i++) {
    out.push({
      x: 70 + rnd() * (g.world.w - 140),
      y: 70 + rnd() * (g.world.h - 140),
      kind: kinds[Math.floor(rnd() * 3)],
      seed: Math.floor(rnd() * 1000),
    })
  }
  return out
}

function drawDecor(ctx: CanvasRenderingContext2D, g: Game, view: View): void {
  const key = `${g.world.w}x${g.world.h}`
  if (!decor || decorKey !== key) { decor = makeDecor(g); decorKey = key }
  for (const d of decor) {
    if (d.x < view.x0 - 30 || d.x > view.x1 + 30 || d.y < view.y0 - 30 || d.y > view.y1 + 30) continue
    if (d.kind === 'pebbles') {
      ctx.fillStyle = 'rgba(160, 152, 130, 0.8)'
      for (let i = 0; i < 3; i++) {
        const a = (d.seed + i * 2.2)
        ctx.beginPath()
        ctx.ellipse(d.x + Math.cos(a) * 7, d.y + Math.sin(a) * 4, 3.4 - i * 0.6, 2.4 - i * 0.4, a, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = 'rgba(206, 198, 176, 0.85)'
      ctx.beginPath(); ctx.ellipse(d.x + 2, d.y - 1.5, 2, 1.4, 0.4, 0, Math.PI * 2); ctx.fill()
    } else if (d.kind === 'mushrooms') {
      for (let i = 0; i < 3; i++) {
        const mx = d.x + Math.cos(d.seed + i * 2.1) * 6
        const my = d.y + Math.sin(d.seed + i * 2.1) * 4
        ctx.fillStyle = '#EFE6D2'
        ctx.fillRect(mx - 1, my - 3, 2, 3.4)
        ctx.fillStyle = i % 2 ? '#C9525E' : '#D98E4A'
        ctx.beginPath(); ctx.ellipse(mx, my - 3.4, 3, 1.9, 0, Math.PI, 0); ctx.fill()
        ctx.fillStyle = 'rgba(251, 243, 228, 0.9)'
        ctx.beginPath(); ctx.arc(mx - 1, my - 4.2, 0.55, 0, Math.PI * 2); ctx.fill()
      }
    } else {
      ctx.fillStyle = 'rgba(122, 160, 88, 0.6)'
      for (let i = 0; i < 5; i++) {
        const a = d.seed + i * 1.3
        ctx.beginPath()
        ctx.ellipse(d.x + Math.cos(a) * 8, d.y + Math.sin(a) * 5, 2.6, 1.7, a, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#F7F1DE'
      ctx.beginPath(); ctx.arc(d.x + 3, d.y - 2, 1.3, 0, Math.PI * 2); ctx.fill()
    }
  }
}

// worn earth under the village: buildings press a ring of trodden dirt into
// the grass, so a settlement reads as lived-in rather than dropped-on
// a few butterflies looping lazily over the meadow — pure ambience
function drawButterflies(ctx: CanvasRenderingContext2D, g: Game, time: number): void {
  const anchors = [
    { fx: 0.29, fy: 0.65, c: '#F7F1DE' }, { fx: 0.51, fy: 0.44, c: '#F0C9CF' },
    { fx: 0.75, fy: 0.33, c: '#F7F1DE' }, { fx: 0.4, fy: 0.84, c: '#E9B44C' },
    { fx: 0.65, fy: 0.69, c: '#F0C9CF' }, { fx: 0.18, fy: 0.22, c: '#F7F1DE' },
    { fx: 0.86, fy: 0.8, c: '#F0C9CF' },
  ]
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]
    const t = time * 0.5 + i * 2.1
    const x = a.fx * g.world.w + Math.sin(t) * 60 + Math.sin(t * 2.3) * 22
    const y = a.fy * g.world.h + Math.cos(t * 0.8) * 42 + Math.sin(t * 3.1) * 10
    if (g.fog.visible[fogIndex(g, x, y)] !== 1) continue // they live in the sunlight
    const flap = Math.abs(Math.sin(time * 10 + i))
    ctx.fillStyle = a.c
    ctx.beginPath()
    ctx.ellipse(x - 1.6, y, 2.6 * (0.35 + 0.65 * flap), 1.8, -0.4, 0, Math.PI * 2)
    ctx.ellipse(x + 1.6, y, 2.6 * (0.35 + 0.65 * flap), 1.8, 0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(90, 70, 50, 0.8)'
    ctx.fillRect(x - 0.5, y - 1.6, 1, 3.2)
  }
}

// The meadow fades into fog-dark at the world's rim, so the edge of the map
// reads as unexplored gloom rolling in — never a hard border.
function drawEdgeFade(ctx: CanvasRenderingContext2D, g: Game): void {
  const { w: WW, h: WH } = g.world
  const F = 46
  const dark = (a: number) => `rgba(30, 42, 26, ${a})`
  let gr = ctx.createLinearGradient(0, 0, 0, F)
  gr.addColorStop(0, dark(1)); gr.addColorStop(1, dark(0))
  ctx.fillStyle = gr; ctx.fillRect(0, 0, WW, F)
  gr = ctx.createLinearGradient(0, WH, 0, WH - F)
  gr.addColorStop(0, dark(1)); gr.addColorStop(1, dark(0))
  ctx.fillStyle = gr; ctx.fillRect(0, WH - F, WW, F)
  gr = ctx.createLinearGradient(0, 0, F, 0)
  gr.addColorStop(0, dark(1)); gr.addColorStop(1, dark(0))
  ctx.fillStyle = gr; ctx.fillRect(0, 0, F, WH)
  gr = ctx.createLinearGradient(WW, 0, WW - F, 0)
  gr.addColorStop(0, dark(1)); gr.addColorStop(1, dark(0))
  ctx.fillStyle = gr; ctx.fillRect(WW - F, 0, F, WH)
  // opaque frame overlapping the boundary — buries the meadow's antialiased
  // edge so not even a hairline of the world rect survives
  const M = 600
  ctx.fillStyle = dark(1)
  ctx.fillRect(-M, -M, WW + M * 2, M + 2)
  ctx.fillRect(-M, WH - 2, WW + M * 2, M + 2)
  ctx.fillRect(-M, -M, M + 2, WH + M * 2)
  ctx.fillRect(WW - 2, -M, M + 2, WH + M * 2)
}

// Stand a sprite up out of the tilted ground. Undo the view's squash, then
// shift so the sprite's own y still lands on the ground point it was drawn
// for — which is why every sprite function could stay exactly as it was.
function upright(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.scale(1, 1 / TILT)
  ctx.translate(0, y * (TILT - 1))
}

export function render(g: Game, canvas: HTMLCanvasElement, time: number): void {
  const ctx = canvas.getContext('2d')!
  const dpr = window.devicePixelRatio || 1
  const vw = canvas.width / dpr, vh = canvas.height / dpr
  ctx.save()
  ctx.scale(dpr, dpr)

  // beyond-the-map backdrop matches the fog dark so unexplored map blends out
  ctx.fillStyle = '#4A5450'
  ctx.fillRect(0, 0, vw, vh)

  const cam = g.camera
  ctx.translate(vw / 2, vh / 2)
  ctx.scale(cam.zoom, cam.zoom)
  // From here on the context is *ground space*: the world plane laid down flat
  // and squashed. Anything that genuinely lies on the ground — fields, worn
  // earth, fog, the build grid, selection rings — draws here and gets the
  // recession for free. Anything that stands up out of the ground calls
  // upright() first.
  ctx.scale(1, TILT)
  ctx.translate(-cam.x, -cam.y)

  // meadow
  if (!groundPattern) groundPattern = makeGroundPattern(ctx)
  ctx.fillStyle = groundPattern
  ctx.beginPath()
  const cr = 46
  const { w: WW, h: WH } = g.world
  ctx.moveTo(cr, 0)
  ctx.arcTo(WW, 0, WW, WH, cr)
  ctx.arcTo(WW, WH, 0, WH, cr)
  ctx.arcTo(0, WH, 0, 0, cr)
  ctx.arcTo(0, 0, WW, 0, cr)
  ctx.closePath()
  ctx.fill()

  // what the camera can see, for culling the ground dressing
  const view: View = {
    x0: cam.x - vw / 2 / cam.zoom - 60, x1: cam.x + vw / 2 / cam.zoom + 60,
    y0: cam.y - vh / 2 / cam.zoom - 60, y1: cam.y + vh / 2 / cam.zoom + 60,
  }
  drawZones(ctx, g, view)
  drawStreams(ctx, g, time)
  drawDecor(ctx, g, view)
  // Shadows and trodden earth for every standing building, laid down here in
  // ground space so they lie flat in the tilted plane and read as ground the
  // building stands on rather than a decal pasted under it.
  for (const e of g.ents) {
    if (!isBuilding(e) || e.kind === 'wall' || e.kind === 'gate' || e.kind === 'farm') continue
    if (g.fog.explored[fogIndex(g, e.x, e.y)] !== 1) continue
    const bd = BUILDINGS[e.kind]
    const k = bd.art ? bd.foot / bd.art : 1
    groundDecal(ctx, e, bd.foot * 0.62, (e.complete === false ? 14 : 34) * k)
  }

  // selection rings under everything else
  for (const id of g.selection) {
    const e = g.byId.get(id)
    if (!e) continue
    ctx.strokeStyle = 'rgba(255, 252, 240, 0.95)'
    ctx.lineWidth = 2.6
    ctx.beginPath()
    ctx.ellipse(e.x, e.y + (isBuilding(e) ? e.r * 0.45 : 5), e.r + 6, e.r + 6, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(233, 180, 76, 0.9)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.ellipse(e.x, e.y + (isBuilding(e) ? e.r * 0.45 : 5), e.r + 9, e.r + 9, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  // entities, painter's order (garrisoned units inside, enemy units in fog
  // unseen; deer, like anything that moves, only exist in live sight)
  // enshrined relics show as gold pips on their shrine (carried ones ride
  // with the monk), so count them per building before the paint
  const shrined = new Map<number, number>()
  for (const rl of g.ents) {
    if (rl.kind === 'relic' && rl.shrineId !== undefined) {
      shrined.set(rl.shrineId, (shrined.get(rl.shrineId) ?? 0) + 1)
    }
  }
  // Fields lie flat and are walked over, so they belong to the ground: drawn in
  // their own pass beneath everything, or a villager standing in the crop would
  // sort under the plot and vanish behind it.
  for (const e of g.ents) {
    if (e.kind !== 'farm') continue
    if (e.complete) drawFarm(ctx, e, time)
    else drawSite(ctx, e)
    if (e.hp < e.maxHp && e.hp > 0 && e.complete !== false) {
      const y = e.y - e.r - e.r * 0.8
      ctx.fillStyle = 'rgba(60, 46, 30, 0.45)'
      rrFill(ctx, e.x - 21, y - 1, 42, 5, 2.5)
      ctx.fillStyle = e.team === 0 ? '#8FBF6A' : '#D98A7F'
      rrFill(ctx, e.x - 20, y, Math.max(2, 40 * (e.hp / e.maxHp)), 3, 1.5)
    }
  }

  const sorted = g.ents
    .filter(e => e.kind !== 'farm' && !e.hidden && !(isUnit(e) && e.team === 1 && !isVisibleToPlayer(g, e)) &&
      !((e.kind === 'deer' || e.kind === 'croc') && g.fog.visible[fogIndex(g, e.x, e.y)] !== 1) &&
      !(e.kind === 'relic' && (e.heldBy !== undefined || e.shrineId !== undefined ||
        g.fog.explored[fogIndex(g, e.x, e.y)] !== 1)))
    .sort((a, b) => (a.y + a.r) - (b.y + b.r))
  for (const e of sorted) {
    ctx.save()
    upright(ctx, e.y)
    // A building's art was drawn for one footprint; `art` records which. When
    // the footprint changes the sprite scales about its ground point to match,
    // rather than every building being redrawn by hand at a new size.
    const bd = isBuilding(e) ? BUILDINGS[e.kind] : undefined
    if (bd) setDecals(false)
    if (bd?.art && bd.art !== bd.foot) {
      const k = bd.foot / bd.art
      ctx.translate(e.x, e.y)
      ctx.scale(k, k)
      ctx.translate(-e.x, -e.y)
    }
    switch (e.kind) {
      case 'tree': drawTree(ctx, e, time); break
      case 'deer': drawDeer(ctx, e, time); break
      case 'croc': drawCroc(ctx, e, time, e.hp > 0 && inWater(g, e.x, e.y)); break
      case 'crag': drawCrag(ctx, e); break
      case 'goldmine': drawMine(ctx, e); break
      case 'berrybush': drawBush(ctx, e, time); break
      case 'stonequarry': drawQuarry(ctx, e); break
      case 'relic': drawRelic(ctx, e, time); break
      case 'church': e.complete ? drawChurch(ctx, e, time, shrined.get(e.id) ?? 0) : drawSite(ctx, e); break
      case 'ministry': e.complete ? drawMinistry(ctx, e, time, shrined.get(e.id) ?? 0) : drawSite(ctx, e); break
      case 'towncenter': e.complete ? drawTC(ctx, e, time, g.age[e.team] ?? 1) : drawSite(ctx, e); break
      case 'house': e.complete ? drawHouse(ctx, e, time, g.age[e.team] ?? 1) : drawSite(ctx, e); break
      case 'barracks': e.complete ? drawBarracks(ctx, e, time, g.age[e.team] ?? 1) : drawSite(ctx, e); break
      case 'watchtower': e.complete ? drawWatchtower(ctx, e, time) : drawSite(ctx, e); break
      case 'archeryrange': e.complete ? drawArcheryRange(ctx, e, time) : drawSite(ctx, e); break
      case 'lumbercamp': e.complete ? drawLumberCamp(ctx, e) : drawSite(ctx, e); break
      case 'miningcamp': e.complete ? drawMiningCamp(ctx, e) : drawSite(ctx, e); break
      case 'mill': e.complete ? drawMill(ctx, e, time, g.age[e.team] ?? 1) : drawSite(ctx, e); break
      case 'stable': e.complete ? drawStable(ctx, e, time) : drawSite(ctx, e); break
      case 'abbeymill': e.complete ? drawAbbeyMill(ctx, e, time) : drawSite(ctx, e); break
      case 'kingsbarracks': e.complete ? drawKingsBarracks(ctx, e, time) : drawSite(ctx, e); break
      case 'guildhall': e.complete ? drawGuildhall(ctx, e, time) : drawSite(ctx, e); break
      case 'whitekeep': e.complete ? drawWhiteKeep(ctx, e, time) : drawSite(ctx, e); break
      case 'chamberofcommerce': e.complete ? drawChamberOfCommerce(ctx, e, time) : drawSite(ctx, e); break
      case 'cavalryschool': e.complete ? drawCavalrySchool(ctx, e, time) : drawSite(ctx, e); break
      case 'royalvineyard': e.complete ? drawRoyalVineyard(ctx, e, time) : drawSite(ctx, e); break
      case 'redpalace': e.complete ? drawRedPalace(ctx, e, time) : drawSite(ctx, e); break
      case 'wall': e.complete ? drawWall(ctx, e) : drawSite(ctx, e); break
      case 'gate': e.complete
        ? drawGate(ctx, e, time, g.ents.some(u =>
            isUnit(u) && !u.hidden && u.team === e.team && dist(u.x, u.y, e.x, e.y) < 42))
        : drawSite(ctx, e)
        break
      case 'villager': drawVillager(ctx, e, time); break
      case 'monk': drawMonk(ctx, e, time, e.relicId !== undefined); break
      case 'swordsman': drawSwordsman(ctx, e, time, g.champs[e.team]?.infantry); break
      case 'spearman': drawSpearman(ctx, e, time, g.champs[e.team]?.infantry); break
      case 'archer': drawArcher(ctx, e, time, g.champs[e.team]?.ranged); break
      case 'scout': drawScout(ctx, e, time); break
      case 'knight': drawKnight(ctx, e, time, g.champs[e.team]?.cavalry); break
      case 'mangonel': drawMangonel(ctx, e, time); break
      case 'trebuchet': drawTrebuchet(ctx, e, time); break
      case 'siegeworkshop': e.complete ? drawSiegeWorkshop(ctx, e, time) : drawSite(ctx, e); break
    }
    // grass over the foot of the building — after the walls, so it overlaps
    if (bd && e.kind !== 'wall' && e.kind !== 'gate' && e.kind !== 'farm' && e.complete !== false) {
      baseSkirt(ctx, e, (bd.art ?? bd.foot) * 0.52)
    }
    // health bar when hurt (hunted wildlife shows its last strength too)
    if ((isUnit(e) || isBuilding(e) || e.kind === 'deer' || e.kind === 'croc') && e.hp < e.maxHp && e.hp > 0 && (e.complete !== false)) {
      const w = isBuilding(e) ? 40 : 18
      const y = e.y - e.r - (isBuilding(e) ? e.r * 0.8 : 22)
      ctx.fillStyle = 'rgba(60, 46, 30, 0.45)'
      rrFill(ctx, e.x - w / 2 - 1, y - 1, w + 2, 5, 2.5)
      ctx.fillStyle = e.team === 0 ? '#8FBF6A' : '#D98A7F'
      rrFill(ctx, e.x - w / 2, y, Math.max(2, w * (e.hp / e.maxHp)), 3, 1.5)
    }
    setDecals(true)
    ctx.restore()
  }

  // arrows and boulders
  for (const p of g.projectiles) {
    ctx.save()
    upright(ctx, p.y)
    if (p.kind === 'boulder') {
      // a lobbed boulder: it rides an arc above the straight line of its flight
      const total = dist(p.sx ?? p.x, p.sy ?? p.y, p.tx, p.ty) || 1
      const u = Math.min(1, Math.max(0, 1 - dist(p.x, p.y, p.tx, p.ty) / total))
      const lift = (p.arcH ?? 50) * 4 * u * (1 - u)
      ctx.fillStyle = 'rgba(60, 46, 30, 0.18)' // its shadow tracks the ground
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 3, 4.5, 2.2, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#A8A395'
      ctx.beginPath(); ctx.arc(p.x, p.y - lift, 4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#C5C0B2'
      ctx.beginPath(); ctx.arc(p.x - 1.2, p.y - lift - 1.2, 1.6, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
      continue
    }
    const dx = p.tx - p.x, dy = p.ty - p.y
    const d = Math.hypot(dx, dy) || 1
    const nx = dx / d, ny = dy / d
    ctx.strokeStyle = '#6F5238'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(p.x - nx * 6, p.y - ny * 6)
    ctx.lineTo(p.x + nx * 4, p.y + ny * 4)
    ctx.stroke()
    ctx.fillStyle = '#FBF3E4'
    ctx.beginPath()
    ctx.arc(p.x + nx * 5, p.y + ny * 5, 1.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // particles
  for (const p of g.particles) {
    ctx.save()
    upright(ctx, p.y)
    const a = 1 - p.life / p.maxLife
    ctx.globalAlpha = Math.max(0, a * 0.85)
    ctx.fillStyle = p.color
    ctx.beginPath()
    if (p.kind === 'leaf') {
      ctx.ellipse(p.x, p.y, p.size * 0.8, p.size * 0.45, p.life * 4, 0, Math.PI * 2)
    } else {
      ctx.arc(p.x, p.y, p.size * (p.kind === 'puff' ? 0.6 + p.life : 1), 0, Math.PI * 2)
    }
    ctx.fill()
    ctx.restore()
  }
  ctx.globalAlpha = 1

  drawButterflies(ctx, g, time)

  drawBuildGrid(ctx, g, view)

  drawFog(ctx, g)
  drawEdgeFade(ctx, g)

  // tap feedback: a bright flash on whatever was touched, a settling ring on
  // bare ground — quick, quiet, and gone
  if (g.taps.length) {
    for (const tp of g.taps) {
      const age = time - tp.at
      if (tp.ent) {
        if (age > 0.35) continue
        const k = age / 0.35
        ctx.globalAlpha = (1 - k) * 0.9
        ctx.strokeStyle = '#FFFCF0'
        ctx.lineWidth = 2.6
        ctx.beginPath()
        ctx.ellipse(tp.x, tp.y + 4, tp.r + 7 + k * 14, tp.r + 7 + k * 14, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = (1 - k) * 0.5
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.ellipse(tp.x, tp.y + 4, tp.r + 3 + k * 8, tp.r + 3 + k * 8, 0, 0, Math.PI * 2)
        ctx.stroke()
      } else {
        if (age > 0.45) continue
        const k = age / 0.45
        ctx.globalAlpha = (1 - k) * 0.85
        ctx.strokeStyle = '#E9B44C'
        ctx.lineWidth = 2.4
        ctx.beginPath()
        ctx.ellipse(tp.x, tp.y, 17 - k * 11, 17 - k * 11, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = (1 - k) * 0.9
        ctx.fillStyle = '#FFFCF0'
        ctx.beginPath()
        ctx.arc(tp.x, tp.y, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
    g.taps = g.taps.filter(tp => time - tp.at < 0.5)
  }

  // Every muster flag your companies have planted, above the fog so you can
  // always see where your recruits are headed. The banner you're looking at
  // stands full strength; the others hang back, pale.
  for (let i = 0; i < g.banners; i++) {
    const m = g.muster[i]
    if (!m) continue
    const b = BANNERS[i]
    drawMuster(ctx, m.x, m.y, time, b.color, b.edge, i !== g.activeBanner)
  }

  // placement ghost rides above the fog so it's always legible
  if (g.placing === 'wall' && g.placePos && g.placeEnd) {
    // a dragged fence line: one little square per post, ends are grab handles
    const pts = wallLinePoints(g)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      ctx.fillStyle = p.ok ? 'rgba(143, 191, 106, 0.3)' : 'rgba(201, 82, 94, 0.34)'
      rrFill(ctx, p.x - 8, p.y - 5, 16, 12, 3)
      if (p.ok) {
        ctx.globalAlpha = 0.55
        drawWall(ctx, { x: p.x, y: p.y, seed: i } as any)
        ctx.globalAlpha = 1
      }
    }
    ctx.strokeStyle = 'rgba(251, 243, 228, 0.95)'
    ctx.lineWidth = 2.4
    ctx.setLineDash([5, 4])
    for (const h of [g.placePos, g.placeEnd]) {
      ctx.beginPath(); ctx.arc(h.x, h.y, 16, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.setLineDash([])
  } else if (g.placing && g.placePos) {
    const b = BUILDINGS[g.placing]
    const { x, y } = g.placePos
    const ok = canPlaceAt(g, g.placing, x, y)
    // the true footprint: exactly b.tiles square, edges on the grid lines, with
    // each tile it covers picked out so the size is countable at a glance
    const f = b.foot
    ctx.fillStyle = ok ? 'rgba(143, 191, 106, 0.26)' : 'rgba(201, 82, 94, 0.30)'
    for (let ty = 0; ty < b.tiles; ty++) {
      for (let tx = 0; tx < b.tiles; tx++) {
        ctx.fillRect(x - f + tx * TILE + 0.6, y - f + ty * TILE + 0.6, TILE - 1.2, TILE - 1.2)
      }
    }
    ctx.strokeStyle = ok ? 'rgba(251, 243, 228, 0.95)' : 'rgba(201, 82, 94, 0.95)'
    ctx.lineWidth = 2.4
    ctx.setLineDash([7, 6])
    ctx.beginPath()
    ctx.rect(x - f, y - f, f * 2, f * 2)
    ctx.stroke()
    ctx.setLineDash([])
    // half-opacity preview of the building itself
    ctx.globalAlpha = 0.55
    ctx.save()
    upright(ctx, y)
    const ghost: any = {
      id: 0, kind: g.placing, team: 0, x, y, r: b.r, hp: 1, maxHp: 1, seed: 7,
      complete: true, garrison: 0, queue: [], angle: g.placeAngle,
    }
    switch (g.placing) {
      case 'towncenter': drawTC(ctx, ghost, time, g.age[0]); break
      case 'house': drawHouse(ctx, ghost, time, g.age[0]); break
      case 'farm': drawFarm(ctx, ghost, time); break
      case 'barracks': drawBarracks(ctx, ghost, time, g.age[0]); break
      case 'archeryrange': drawArcheryRange(ctx, ghost, time); break
      case 'watchtower': drawWatchtower(ctx, ghost, time); break
      case 'lumbercamp': drawLumberCamp(ctx, ghost); break
      case 'miningcamp': drawMiningCamp(ctx, ghost); break
      case 'mill': drawMill(ctx, ghost, time, g.age[0]); break
      case 'stable': drawStable(ctx, ghost, time); break
      case 'church': drawChurch(ctx, ghost, time); break
      case 'ministry': drawMinistry(ctx, ghost, time); break
      case 'gate': drawGate(ctx, ghost, time, false); break
      case 'abbeymill': drawAbbeyMill(ctx, ghost, time); break
      case 'kingsbarracks': drawKingsBarracks(ctx, ghost, time); break
      case 'guildhall': drawGuildhall(ctx, ghost, time); break
      case 'whitekeep': drawWhiteKeep(ctx, ghost, time); break
      case 'chamberofcommerce': drawChamberOfCommerce(ctx, ghost, time); break
      case 'cavalryschool': drawCavalrySchool(ctx, ghost, time); break
      case 'royalvineyard': drawRoyalVineyard(ctx, ghost, time); break
      case 'redpalace': drawRedPalace(ctx, ghost, time); break
      case 'siegeworkshop': drawSiegeWorkshop(ctx, ghost, time); break
    }
    ctx.restore()
    ctx.globalAlpha = 1
  }

  // Atmosphere. Distance in this view is *up* the screen, so a pale wash that
  // strengthens toward the top pushes the far meadow back and lifts the near
  // ground forward — the depth cue a real 3D engine gets from fog, plus a
  // vignette so the eye settles in the middle of the meadow.
  //
  // Both are fixed to the viewport, so they're baked once into a single layer
  // and blitted. Drawing them live cost two full-screen gradient fills every
  // frame — 14ms at 2x DPR, which was most of a frame's budget on its own.
  ctx.restore()
  ctx.save()
  ctx.scale(dpr, dpr)
  const atmos = atmosLayer(vw, vh, dpr)
  if (atmos) ctx.drawImage(atmos, 0, 0, vw, vh)
  ctx.restore()
}

let atmosCanvas: HTMLCanvasElement | null = null
let atmosKey = ''

function atmosLayer(vw: number, vh: number, dpr: number): HTMLCanvasElement | null {
  const key = `${Math.round(vw)}x${Math.round(vh)}@${dpr}`
  if (atmosCanvas && atmosKey === key) return atmosCanvas
  if (vw < 1 || vh < 1) return null
  const c = atmosCanvas ?? document.createElement('canvas')
  c.width = Math.max(1, Math.round(vw * dpr))
  c.height = Math.max(1, Math.round(vh * dpr))
  const a = c.getContext('2d')
  if (!a) return null
  a.setTransform(dpr, 0, 0, dpr, 0, 0)
  a.clearRect(0, 0, vw, vh)
  const haze = a.createLinearGradient(0, 0, 0, vh)
  haze.addColorStop(0, 'rgba(196, 208, 206, 0.26)')
  haze.addColorStop(0.38, 'rgba(196, 208, 206, 0.09)')
  haze.addColorStop(0.75, 'rgba(196, 208, 206, 0)')
  a.fillStyle = haze
  a.fillRect(0, 0, vw, vh)
  const vig = a.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.34,
                                     vw / 2, vh / 2, Math.max(vw, vh) * 0.78)
  vig.addColorStop(0, 'rgba(28, 34, 24, 0)')
  vig.addColorStop(1, 'rgba(28, 34, 24, 0.18)')
  a.fillStyle = vig
  a.fillRect(0, 0, vw, vh)
  atmosCanvas = c
  atmosKey = key
  return c
}

// AoE-style build grid: while a building is in hand, the meadow rules itself
// into the snap lattice so rows line up, and the squares you CAN'T build on
// are washed red around your thumb. Only ever drawn during placement.
function drawBuildGrid(ctx: CanvasRenderingContext2D, g: Game, view: View): void {
  if (!g.placing || !g.placePos) return
  const c = PLACE_SNAP
  const x0 = Math.floor(view.x0 / c) * c
  const x1 = Math.ceil(view.x1 / c) * c
  const y0 = Math.floor(view.y0 / c) * c
  const y1 = Math.ceil(view.y1 / c) * c
  // the fine lattice, with a heavier rule every fourth line to count by
  for (let pass = 0; pass < 2; pass++) {
    const major = pass === 1
    ctx.strokeStyle = major ? 'rgba(251, 243, 228, 0.26)' : 'rgba(251, 243, 228, 0.12)'
    ctx.lineWidth = major ? 1.2 : 0.7
    ctx.beginPath()
    for (let x = x0; x <= x1; x += c) {
      if ((Math.round(x / c) % 4 === 0) !== major) continue
      ctx.moveTo(x, y0); ctx.lineTo(x, y1)
    }
    for (let y = y0; y <= y1; y += c) {
      if ((Math.round(y / c) % 4 === 0) !== major) continue
      ctx.moveTo(x0, y); ctx.lineTo(x1, y)
    }
    ctx.stroke()
  }
  // and the neighbourhood readout: where this building simply will not go.
  // It fades out toward the edge of what we evaluate, so the wash reads as a
  // hint around your thumb rather than a hard border with clear ground beyond.
  if (g.placing === 'wall') return // a dragged fence shows its own per-post marks
  const R = 9
  const cells = placementCells(g, g.placing, g.placePos.x, g.placePos.y, R)
  for (const cell of cells) {
    if (cell.ok) continue
    const d = Math.max(
      Math.abs(cell.x - g.placePos.x), Math.abs(cell.y - g.placePos.y)) / c
    const a = 0.22 * Math.max(0, 1 - (d / R) ** 2)
    if (a < 0.012) continue
    ctx.fillStyle = `rgba(201, 82, 94, ${a.toFixed(3)})`
    ctx.fillRect(cell.x - c / 2, cell.y - c / 2, c, c)
  }
}

function rrFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  ctx.fill()
}
