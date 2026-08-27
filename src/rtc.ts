// Two phones, no server: a direct WebRTC data channel, opened by passing two
// codes back and forth however you like — a message, a chat, read aloud across
// the room. The browser's own offer/answer blobs are ~2KB of SDP boilerplate,
// almost all of it identical on every machine, so what we actually hand the
// player is the handful of fields that differ, deflated and base64'd.
//
// A STUN server tells each side what its address looks like from outside, which
// is enough to get through most home routers. It is not enough for two phones
// both on mobile networks behind carrier-grade NAT — that needs a relay, and a
// relay needs a server, which is the thing this whole approach is avoiding.
import { Cmd, Link } from './net'

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
}

export interface Invite {
  code: string
  /** Resolves once the other player's reply has been fed back in. */
  wait(): Promise<Link>
  accept(reply: string): void
  close(): void
}

interface Wire {
  v: number
  r: 'o' | 'a' // offer or answer
  u: string // ice-ufrag
  p: string // ice-pwd
  f: string // dtls fingerprint, hex without the colons
  s: string // dtls setup role
  c: string[] // ice candidates, minus the a=candidate: prefix
  seed?: number // the world both sides will deal
  civ?: string // who the sender is playing
}

// ---- squeezing the handshake ----

function pull(sdp: string, key: string): string {
  const m = sdp.match(new RegExp(`^a=${key}:(.*)$`, 'm'))
  return m ? m[1].trim() : ''
}

function pack(sdp: string, r: 'o' | 'a', extra: Partial<Wire>): Wire {
  const fp = pull(sdp, 'fingerprint').replace(/^sha-256\s+/i, '').replace(/:/g, '').toLowerCase()
  return {
    v: 1, r,
    u: pull(sdp, 'ice-ufrag'),
    p: pull(sdp, 'ice-pwd'),
    f: fp,
    s: pull(sdp, 'setup') || (r === 'o' ? 'actpass' : 'active'),
    c: [...sdp.matchAll(/^a=candidate:(.*)$/gm)].map(m => m[1].trim()),
    ...extra,
  }
}

// Everything an SDP for a plain data channel says, other than the fields above,
// is the same on every machine — so the other side can simply write it out.
function unpack(w: Wire): string {
  const fp = (w.f.match(/../g) ?? []).join(':').toUpperCase()
  return [
    'v=0',
    'o=- 1 1 IN IP4 0.0.0.0',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${w.u}`,
    `a=ice-pwd:${w.p}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${fp}`,
    `a=setup:${w.s}`,
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    ...w.c.map(c => `a=candidate:${c}`),
    '',
  ].join('\r\n')
}

const B64 = (b: Uint8Array): string => {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const UNB64 = (s: string): Uint8Array => {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const b = new Uint8Array(t.length)
  for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i)
  return b
}

async function squash(bytes: Uint8Array, how: 'deflate-raw'): Promise<Uint8Array> {
  const cs = new CompressionStream(how)
  const w = cs.writable.getWriter()
  void w.write(bytes as unknown as BufferSource)
  void w.close()
  return new Uint8Array(await new Response(cs.readable).arrayBuffer())
}
async function unsquash(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const w = ds.writable.getWriter()
  void w.write(bytes as unknown as BufferSource)
  void w.close()
  return new Uint8Array(await new Response(ds.readable).arrayBuffer())
}

export async function encodeWire(w: Wire): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(w))
  try {
    return B64(await squash(raw, 'deflate-raw'))
  } catch {
    return B64(raw) // an old browser can still play, it just pastes more
  }
}

export async function decodeWire(code: string): Promise<Wire> {
  const bytes = UNB64(code.trim().replace(/\s+/g, ''))
  const text = new TextDecoder()
  try {
    return JSON.parse(text.decode(await unsquash(bytes))) as Wire
  } catch {
    return JSON.parse(text.decode(bytes)) as Wire
  }
}

// ---- opening a channel ----

/** Wait for ICE to finish gathering, so one paste carries every candidate. */
function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise(res => {
    // Some networks turn up a candidate a long time after the useful ones, so
    // don't wait forever for a straggler nobody needs.
    const done = (): void => { clearTimeout(timer); res() }
    const timer = setTimeout(done, 2500)
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') done()
    })
  })
}

function wrap(ch: RTCDataChannel, them: number): Link {
  const inbox = new Map<number, { cmds: Cmd[]; sum: number }>()
  const link: Link = {
    send(turn, cmds, sum) {
      if (ch.readyState === 'open') ch.send(JSON.stringify({ turn, cmds, sum }))
    },
    inbox,
    them,
    dropped: false,
  }
  ch.addEventListener('message', ev => {
    try {
      const p = JSON.parse(String(ev.data)) as { turn: number; cmds: Cmd[]; sum: number }
      inbox.set(p.turn, { cmds: p.cmds, sum: p.sum })
    } catch { /* a packet we can't read is a packet we ignore */ }
  })
  const drop = (): void => { link.dropped = true }
  ch.addEventListener('close', drop)
  ch.addEventListener('error', drop)
  return link
}

/** Open the door and hand back the code to send them. */
export async function invite(seed: number, civ: string): Promise<Invite> {
  const pc = new RTCPeerConnection(ICE)
  const ch = pc.createDataChannel('bramblewick', { ordered: true })
  let ready: (l: Link) => void
  let failed: (e: Error) => void
  const open = new Promise<Link>((res, rej) => { ready = res; failed = rej })
  ch.addEventListener('open', () => ready(wrap(ch, 1)))
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed') failed(new Error('could not reach them'))
  })
  await pc.setLocalDescription(await pc.createOffer())
  await gathered(pc)
  const code = await encodeWire(pack(pc.localDescription!.sdp, 'o', { seed, civ }))
  return {
    code,
    wait: () => open,
    accept(reply: string): void {
      void decodeWire(reply).then(w =>
        pc.setRemoteDescription({ type: 'answer', sdp: unpack(w) }))
    },
    close: () => pc.close(),
  }
}

/** Take an invite, and hand back the code to send them in return. */
export async function join(code: string, civ: string):
Promise<{ reply: string; seed: number; hostCiv: string; wait(): Promise<Link>; close(): void }> {
  const w = await decodeWire(code)
  const pc = new RTCPeerConnection(ICE)
  let ready: (l: Link) => void
  let failed: (e: Error) => void
  const open = new Promise<Link>((res, rej) => { ready = res; failed = rej })
  pc.addEventListener('datachannel', ev => {
    const ch = ev.channel
    if (ch.readyState === 'open') ready(wrap(ch, 0))
    else ch.addEventListener('open', () => ready(wrap(ch, 0)))
  })
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed') failed(new Error('could not reach them'))
  })
  await pc.setRemoteDescription({ type: 'offer', sdp: unpack(w) })
  await pc.setLocalDescription(await pc.createAnswer())
  await gathered(pc)
  const reply = await encodeWire(pack(pc.localDescription!.sdp, 'a', { civ }))
  return {
    reply,
    seed: w.seed ?? 1,
    hostCiv: w.civ ?? 'english',
    wait: () => open,
    close: () => pc.close(),
  }
}
