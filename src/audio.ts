// The sound of the meadow.
//
// Every sample rides inline as a base64 MP3 (see scripts/audio.mjs), so the
// game stays one file and still has audio with the phone in flight mode.
// Nothing here may throw into the sim: a browser that refuses us an
// AudioContext just gets a silent game.
import { Game } from './data'
import { fogIndex } from './world'
import { SFX_DATA } from './sfx-data'

export type SfxName = keyof typeof SFX_DATA & string

interface Voice { at: number }

// How loud each sound sits in the mix, and how long before it may speak again.
// The gap matters more than it sounds: twenty villagers chopping in time would
// otherwise arrive as one long rattle.
const MIX: Record<string, { gain: number; gap: number; cap?: number }> = {
  chop:     { gain: 0.42, gap: 0.13, cap: 3 },
  mine:     { gain: 0.40, gap: 0.13, cap: 3 },
  forage:   { gain: 0.34, gap: 0.17, cap: 2 },
  harvest:  { gain: 0.32, gap: 0.19, cap: 2 },
  drop:     { gain: 0.30, gap: 0.22, cap: 2 },
  hammer:   { gain: 0.36, gap: 0.11, cap: 3 },
  place:    { gain: 0.62, gap: 0.05 },
  built:    { gain: 0.70, gap: 0.05 },
  muster:   { gain: 0.44, gap: 0.16, cap: 2 },
  sword:    { gain: 0.34, gap: 0.09, cap: 4 },
  bow:      { gain: 0.30, gap: 0.09, cap: 4 },
  arrowhit: { gain: 0.26, gap: 0.09, cap: 4 },
  launch:   { gain: 0.60, gap: 0.10 },
  boom:     { gain: 0.72, gap: 0.08, cap: 3 },
  crumble:  { gain: 0.78, gap: 0.12, cap: 2 },
  tap:      { gain: 0.30, gap: 0.03 },
  bell:     { gain: 0.60, gap: 1.20, cap: 1 },
  gate:     { gain: 0.34, gap: 0.40, cap: 2 },
  ageup:    { gain: 0.85, gap: 1.00, cap: 1 },
  victory:  { gain: 0.90, gap: 2.00, cap: 1 },
  defeat:   { gain: 0.90, gap: 2.00, cap: 1 },
}
const FALLBACK = { gain: 0.4, gap: 0.1, cap: 3 }

const MAX_VOICES = 12 // a hard ceiling so a big battle can't turn to mud
const STORE = 'bramblewick.audio'

// Where every sample should sit once loaded. Recordings arrive at wildly
// different levels — a wide stereo take folded to mono can land 6 dB under a
// close-mic'd mono one — and no encoder setting reliably fixes that for a file
// someone drops in by hand. So the engine measures what it actually decoded and
// trims each sample onto a common reference. MIX below is then free to mean
// what it says: how loud a chop should be RELATIVE to a boulder, not a
// correction for how hot the source happened to be.
const REFERENCE_PEAK = 0.85
const TRIM_MIN = 0.4 // don't pull down a hot sample too far
const TRIM_MAX = 3.2 // and don't haul a quiet one up into its own noise floor

let ctx: AudioContext | null = null
let master: GainNode | null = null
let buffers: Record<string, AudioBuffer> = {}
const trim: Record<string, number> = {}
let ready = false
let decoding = false
const voices: Record<string, Voice[]> = {}
let live = 0

export let muted = false
export let volume = 0.8

// Where the camera is looking, so a skirmish across the map stays distant.
let ear = { x: 0, y: 0, w: 800, h: 600 }

try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null')
  if (saved && typeof saved === 'object') {
    muted = !!saved.muted
    if (typeof saved.volume === 'number') volume = Math.max(0, Math.min(1, saved.volume))
  }
} catch { /* first run, or storage is off — the defaults are fine */ }

function remember(): void {
  try { localStorage.setItem(STORE, JSON.stringify({ muted, volume })) } catch { /* nothing lost */ }
}

function bytes(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

/**
 * Wake the audio engine. Browsers only hand out a running AudioContext from
 * inside a real gesture, so this is called from the first tap and is safe to
 * call again on every one after that.
 */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!Ctor) return
      ctx = new Ctor() as AudioContext
      master = ctx.createGain()
      master.gain.value = muted ? 0 : volume
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    if (!ready && !decoding) void decodeAll()
  } catch { ctx = null }
}

async function decodeAll(): Promise<void> {
  if (!ctx) return
  decoding = true
  const c = ctx
  for (const name of Object.keys(SFX_DATA)) {
    try {
      // Safari's decodeAudioData has no promise form on older builds.
      const data = bytes(SFX_DATA[name])
      const buf = await new Promise<AudioBuffer>((res, rej) => {
        const p = (c as any).decodeAudioData(data, res, rej)
        if (p && typeof p.then === 'function') p.then(res, rej)
      })
      buffers[name] = buf
      trim[name] = levelTrim(buf)
    } catch { /* one bad sample shouldn't cost us the rest */ }
  }
  decoding = false
  ready = true
}

// One stride over the buffer is plenty to tell a hot sample from a quiet one.
function levelTrim(b: AudioBuffer): number {
  const ch = b.getChannelData(0)
  let peak = 0
  for (let i = 0; i < ch.length; i += 7) {
    const v = ch[i] < 0 ? -ch[i] : ch[i]
    if (v > peak) peak = v
  }
  if (peak < 0.02) return 1 // near-silent: leave it be rather than amplify hiss
  return Math.max(TRIM_MIN, Math.min(TRIM_MAX, REFERENCE_PEAK / peak))
}

/** Tell the mixer what the camera can see, so sound follows the eye. */
export function listenFrom(x: number, y: number, w: number, h: number): void {
  ear = { x, y, w, h }
}

export interface SfxOpts {
  /** World position. Off-screen sounds fade out and pan; far ones are dropped. */
  x?: number
  y?: number
  /** Multiplies the sound's place in the mix. */
  gain?: number
  /** Playback rate; a small random spread is added on top. */
  rate?: number
}

/**
 * Play a sound. Silently does nothing before the first tap, which keeps every
 * call site free of guards.
 */
export function sfx(name: SfxName | string, opts: SfxOpts = {}): void {
  if (muted || !ready || !ctx || !master) return
  const buf = buffers[name]
  if (!buf) return
  const mix = MIX[name] ?? FALLBACK

  let pan = 0
  let space = 1
  if (opts.x !== undefined && opts.y !== undefined) {
    const dx = opts.x - ear.x
    const dy = opts.y - ear.y
    // A screen and a half out, it's over the hill and we let it go.
    const edge = Math.max(Math.abs(dx) / (ear.w * 0.75), Math.abs(dy) / (ear.h * 0.75))
    if (edge > 1.5) return
    space = edge <= 1 ? 1 : 1 - (edge - 1) / 0.5 * 0.8
    pan = Math.max(-0.85, Math.min(0.85, dx / (ear.w * 0.6)))
  }

  const now = ctx.currentTime
  const q = (voices[name] ??= [])
  while (q.length && now - q[0].at > 2.5) q.shift()
  const recent = q[q.length - 1]
  if (recent && now - recent.at < mix.gap) return
  const cap = mix.cap ?? FALLBACK.cap!
  if (q.filter(v => now - v.at < 0.35).length >= cap) return
  if (live >= MAX_VOICES) return

  try {
    const src = ctx.createBufferSource()
    src.buffer = buf
    // A touch of pitch drift keeps a run of the same sound from sounding looped.
    src.playbackRate.value = (opts.rate ?? 1) * (0.94 + Math.random() * 0.12)
    let tail: AudioNode = src
    if (typeof ctx.createStereoPanner === 'function' && pan !== 0) {
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      src.connect(p)
      tail = p
    }
    const gain = ctx.createGain()
    gain.gain.value = mix.gain * space * (opts.gain ?? 1) * (trim[name] ?? 1)
    tail.connect(gain)
    gain.connect(master)
    live++
    src.onended = () => { live = Math.max(0, live - 1) }
    src.start()
    q.push({ at: now })
  } catch { /* the meadow carries on in silence */ }
}

export function setMuted(on: boolean): void {
  muted = on
  if (master && ctx) master.gain.setTargetAtTime(on ? 0 : volume, ctx.currentTime, 0.02)
  remember()
}

export function toggleMuted(): boolean {
  setMuted(!muted)
  return muted
}

export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v))
  if (master && ctx && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02)
  remember()
}

// A short log of what has been played, so a headless run can check the sim is
// asking for the right sounds without a speaker attached.
const HEARD_MAX = 64
const heard: string[] = []

export function heardSfx(): string[] { return heard.slice() }
export function clearHeard(): void { heard.length = 0 }

/** What each decoded sample actually contains — length and peak level. */
export function sfxProbe(): { name: string; dur: number; peak: number; trim: number; levelled: number }[] {
  return Object.keys(buffers).map(name => {
    const b = buffers[name]
    const ch = b.getChannelData(0)
    let peak = 0
    // one pass over a stride is plenty to tell sound from silence
    for (let i = 0; i < ch.length; i += 7) peak = Math.max(peak, Math.abs(ch[i]))
    const t = trim[name] ?? 1
    return { name, dur: b.duration, peak, trim: t, levelled: peak * t }
  })
}

/**
 * Drain the sim's queued sound events. The sim only ever appends names and
 * positions — it never touches the audio engine, so a headless run is
 * unaffected by any of this.
 */
export function drainSfx(g: Game): void {
  const q = g.sfxQueue
  if (!q || !q.length) return
  for (const e of q) {
    // the fog keeps its secrets: a sound placed in the dark is never heard
    if (e.x !== undefined && e.y !== undefined && g.fog.visible[fogIndex(g, e.x, e.y)] !== 1) continue
    if (heard.length < HEARD_MAX) heard.push(e.name)
    sfx(e.name, { x: e.x, y: e.y, gain: e.gain })
  }
  q.length = 0
}

/** True once samples are decoded — used by the test hooks. */
export function audioReady(): boolean { return ready }
