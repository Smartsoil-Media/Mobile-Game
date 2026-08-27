import { unlockAudio, toggleMuted, muted, sfx } from './audio'
// DOM HUD: resource pills, icon command dock, toasts, overlays.
import {
  Game, Ent, Buildable, Cost, ResKind, ChampId, TechId, CivId, LandmarkKind, UNITS, BUILDINGS,
  CHAMPS, TECHS, CIVS, LANDMARKS, LANDMARK_TRICKLES, RESOURCES, LEVY_SPEAR_COST, LEVY_SPEAR_TIME,
  SCHOOL_KNIGHT_COST, SCHOOL_KNIGHT_TIME, AGE_NAMES, RELIC_GOLD_RATE, Kind,
  BANNERS, BANNER_MAX, LION_BANNER, Beast, MAPS,
  isUnit, isBuilding, isSiege, canBanner, mustBanner, Formation} from './data'
import { pop, canAfford, pay, toast, ringBell, openDoors, gatherResOf, gateSnap, wallLinePoints, unitAgeReq, fogIndex, resetGame } from './world'
import { selectArmy, selectBanner, raiseBanner, selectUnitsOfKind, tryPlaceBuilding, snapPlace, sendVillagerToResource, cycleIdleVillager, clampCamera, formationOf, commandMove, beginMuster, cancelMuster, clearMuster } from './input'
import { drawTC, drawHouse, drawBarracks, drawLumberCamp, drawMiningCamp, drawMill, drawStable, drawFarm, drawWatchtower, drawArcheryRange, drawWall, drawGate, drawVillager, drawSwordsman, drawSpearman, drawArcher, drawScout, drawKnight, drawAbbeyMill, drawKingsBarracks, drawGuildhall, drawWhiteKeep, drawChamberOfCommerce, drawCavalrySchool, drawRoyalVineyard, drawRedPalace, drawChurch, drawMinistry, drawMonk, drawSiegeWorkshop, drawMangonel, drawTrebuchet, drawTree, drawMine, drawBush, drawQuarry, drawDeer, drawCroc, drawCrag, drawRelic } from './sprites'

const ICON = {
  wood: `<svg viewBox="0 0 24 24" width="17" height="17"><rect x="3" y="9" width="15" height="7" rx="3.5" fill="#8B6A4A"/><circle cx="18" cy="12.5" r="3.5" fill="#C89B6E"/><circle cx="18" cy="12.5" r="1.6" fill="#8B6A4A"/><path d="M6 11.5h7M6 14h5" stroke="#6F5238" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  gold: `<svg viewBox="0 0 24 24" width="17" height="17"><circle cx="12" cy="12" r="8" fill="#E9B44C"/><circle cx="12" cy="12" r="5.4" fill="#F5D584"/><path d="M12 8.5v7M9.8 10.4h3.4a1.7 1.7 0 0 1 0 3.4H10" stroke="#B8842E" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`,
  pop: `<svg viewBox="0 0 24 24" width="17" height="17"><circle cx="12" cy="8" r="4.2" fill="#F6CFA0"/><path d="M4.5 20c.8-4.4 3.9-6.5 7.5-6.5s6.7 2.1 7.5 6.5z" fill="#6D9DC5"/></svg>`,
  food: `<svg viewBox="0 0 24 24" width="17" height="17"><circle cx="9" cy="13" r="5" fill="#C9525E"/><circle cx="16" cy="12" r="4.4" fill="#B23F4C"/><circle cx="10.5" cy="11.5" r="1.5" fill="#E58F8F"/><path d="M12 8c1-2.5 3-3.5 4.5-3.5" stroke="#75A055" stroke-width="2" stroke-linecap="round" fill="none"/><ellipse cx="17.5" cy="5" rx="2.6" ry="1.6" fill="#8CB56A" transform="rotate(-20 17.5 5)"/></svg>`,
  stone: `<svg viewBox="0 0 24 24" width="17" height="17"><path d="M4 16 7 8.5 13 6l6 4-1 7z" fill="#A8A395"/><path d="M7 8.5 13 6l3 2.5-5.5 2z" fill="#D3CEC1"/><path d="M10.5 10.5 16 8.5l3 1.5-1 7-7.5-1z" fill="#BDB8AA"/></svg>`,
  sword: `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 19 15.5 8.5M15.5 8.5 19 5l-1 4.5L14.5 13" stroke="#FBF3E4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M7.5 14.5l2 2M5 19l-1.2 1.2" stroke="#E9B44C" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  economy: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M12 19V8M12 19c0-3-2.5-4.5-5-4.5M12 19c0-3 2.5-4.5 5-4.5" stroke="#8B6A4A" stroke-width="1.6" stroke-linecap="round" fill="none"/><ellipse cx="12" cy="6.5" rx="2" ry="3" fill="#E9B44C"/><ellipse cx="8.4" cy="9" rx="1.8" ry="2.6" fill="#E9B44C" transform="rotate(-28 8.4 9)"/><ellipse cx="15.6" cy="9" rx="1.8" ry="2.6" fill="#E9B44C" transform="rotate(28 15.6 9)"/></svg>`,
  military: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M6.5 17.5 16 8M17.5 17.5 8 8" stroke="#AEB4BF" stroke-width="2.4" stroke-linecap="round"/><path d="M15 6.5 17.5 5.5 16.5 8M9 6.5 6.5 5.5 7.5 8" fill="#AEB4BF"/><path d="M6.5 17.5l-1.6 1.6M17.5 17.5l1.6 1.6" stroke="#E9B44C" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  swordspear: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M6 18 15 9" stroke="#C7CCD4" stroke-width="2.4" stroke-linecap="round"/><path d="M15 9l2.5-3.5L18.5 9z" fill="#C7CCD4"/><path d="M9.2 15.2l-1.8-1.8M6 18l-1.4 1.4" stroke="#E9B44C" stroke-width="2.4" stroke-linecap="round"/><path d="M18 18 8.5 8.5" stroke="#8B6A4A" stroke-width="2.2" stroke-linecap="round"/><path d="M8.5 8.5 5.5 5.5l1.2 3.8 2.6-.1z" fill="#AEB4BF"/></svg>`,
  target: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><circle cx="12" cy="12" r="8.5" fill="#E8C97A"/><circle cx="12" cy="12" r="6" fill="#FBF3E4"/><circle cx="12" cy="12" r="3.6" fill="#C9525E"/><circle cx="12" cy="12" r="1.4" fill="#FBF3E4"/><path d="M12.5 11.5 18 6" stroke="#6F5238" stroke-width="1.8" stroke-linecap="round"/><path d="M18 6l.8-2.3L16.5 4.6z" fill="#8B6A4A"/></svg>`,
  laurel: `<svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M12 18.5V7" stroke="#8B6A4A" stroke-width="1.6" stroke-linecap="round"/><path d="M12 17c-4.5-.5-6.5-3-6.8-6.2C8 11 10.5 12.5 12 15M12 17c4.5-.5 6.5-3 6.8-6.2C16 11 13.5 12.5 12 15" fill="#75A055"/><circle cx="12" cy="6" r="2.2" fill="#E9B44C"/></svg>`,
  crown: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M5.5 15.5 4.5 7.5l3.8 2.8L12 5.5l3.7 4.8 3.8-2.8-1 8z" fill="#E9B44C"/><path d="M5.5 15.5h13v2.4a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="#B8842E"/><circle cx="12" cy="12.4" r="1.3" fill="#C9525E"/><circle cx="8.2" cy="13" r="0.9" fill="#6D9DC5"/><circle cx="15.8" cy="13" r="0.9" fill="#6D9DC5"/></svg>`,
  // economy tech icons
  axe: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M8 19 15.5 8.5" stroke="#8B6A4A" stroke-width="2.2" stroke-linecap="round"/><path d="M12.8 5.8c2.6-1.6 5.4-1.2 7 .4-.5 2.5-2.1 4.6-4.7 5.6z" fill="#C7CCD4"/><path d="M12.8 5.8c1-.3 2-.4 3-.2l-1.9 4.6-1.8-1.5z" fill="#E4E7EC"/></svg>`,
  barrow: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M6.3 8.7c2.2-1.4 6.2-1.4 8.4 0l-.6 1.6H6.9z" fill="#E4CB8F"/><path d="M5 10.3h11.2l-1.9 5H7.9z" fill="#8B6A4A"/><path d="M16.2 10.3h3.3" stroke="#6F5238" stroke-width="1.8" stroke-linecap="round"/><path d="M8.5 15.3l-1.3 3M13.7 15.3l1.3 3" stroke="#6F5238" stroke-width="1.6" stroke-linecap="round"/><circle cx="11" cy="18" r="2.4" fill="#6F5238"/><circle cx="11" cy="18" r="1" fill="#FBF3E4"/></svg>`,
  pick: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M7 18.5 15 8" stroke="#8B6A4A" stroke-width="2.2" stroke-linecap="round"/><path d="M8.3 6.3c3.6-2.1 8.3-1.5 10.9 1.2l-1 1.4c-2.4-2.2-6-2.6-8.9-1.3z" fill="#C7CCD4"/><circle cx="17.5" cy="16.5" r="1.7" fill="#E9B44C"/></svg>`,
  lock: `<svg class="lockb" viewBox="0 0 24 24" width="14" height="14"><rect x="6" y="10" width="12" height="9" rx="2.5" fill="#5A4632"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" stroke="#5A4632" stroke-width="2.2" fill="none"/><circle cx="12" cy="14.5" r="1.6" fill="#FBF3E4"/></svg>`,
  info: `<svg viewBox="0 0 24 24" width="21" height="21"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="7.6" r="1.5" fill="currentColor"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  deselect: `<svg viewBox="0 0 24 24" width="21" height="21"><path d="M4.5 8V5.5A1 1 0 0 1 5.5 4.5H8M16 4.5h2.5a1 1 0 0 1 1 1V8M19.5 16v2.5a1 1 0 0 1-1 1H16M8 19.5H5.5a1 1 0 0 1-1-1V16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  soundOn: `<svg viewBox="0 0 24 24" width="21" height="21"><path d="M11.8 4.2a5.6 5.6 0 0 1 5.6 5.6v4.1l1.3 2.2H4.9l1.3-2.2V9.8a5.6 5.6 0 0 1 5.6-5.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9.9 19a2 2 0 0 0 3.8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20.6 5.4a7 7 0 0 1 0 4.2M2.9 5.4a7 7 0 0 0 0 4.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity="0.75"/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24" width="21" height="21"><path d="M11.8 4.2a5.6 5.6 0 0 1 5.6 5.6v4.1l1.3 2.2H4.9l1.3-2.2V9.8a5.6 5.6 0 0 1 5.6-5.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9.9 19a2 2 0 0 0 3.8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3.6 3.4 20.4 20.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M12 4a6 6 0 0 1 6 6v4l1.5 2.5H4.5L6 14v-4a6 6 0 0 1 6-6z" fill="#B8842E"/><path d="M12 4a6 6 0 0 1 6 6v4H6v-4a6 6 0 0 1 6-6z" fill="#E9B44C"/><circle cx="12" cy="19.5" r="2" fill="#B8842E"/><circle cx="12" cy="3.5" r="1.5" fill="#8B6A4A"/></svg>`,
}

const TECH_ICON: Record<TechId, string> = {
  steelaxes: ICON.axe, wheelbarrow: ICON.barrow, minerspicks: ICON.pick,
  tithebarns: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M5 11 12 5.5 19 11v7.5H5z" fill="#8B6A4A"/><path d="M5 11 12 5.5 19 11l-1.3 1.3L12 7.4l-5.7 4.9z" fill="#6F5238"/><path d="M9.5 18.5v-5.2a2.5 2.5 0 0 1 5 0v5.2z" fill="#5A4632"/><ellipse cx="12" cy="14.6" rx="1.5" ry="2.4" fill="#E9B44C"/><path d="M12 12.4v4.4M10.9 13.4l2.2 2.2M13.1 13.4l-2.2 2.2" stroke="#B8842E" stroke-width="0.7"/></svg>`,
  sanctuary: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M12 19s-6-3.8-6-8a3.4 3.4 0 0 1 6-2.2A3.4 3.4 0 0 1 18 11c0 4.2-6 8-6 8z" fill="#C9525E"/><ellipse cx="12" cy="5.4" rx="4.4" ry="1.5" fill="none" stroke="#E9B44C" stroke-width="1.6"/></svg>`,
}

function el<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T }

// Menu icons are miniatures of the real in-game sprites, drawn fresh onto
// tiny canvases so the build menu always matches the world's art.
function spriteIcon(kind: string, age = 2): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  c.className = 'sprite-icon'
  const ctx = c.getContext('2d')!
  const fake: any = {
    id: 0, kind, team: 0, x: 0, y: 0, r: 0, hp: 1, maxHp: 1, seed: 3,
    complete: true, state: 'idle', face: 1, phase: 0, carry: 0, amount: 60,
  }
  // the wilds are drawn from their own radius (a crag with r 0 draws nothing)
  if (RESOURCES[kind]) { fake.r = RESOURCES[kind].r; fake.amount = RESOURCES[kind].amount }
  else if (kind === 'crag') fake.r = 34
  else if (kind === 'relic') fake.r = 10
  // scale fits the sprite's bounding box into the 48px icon; (cx, cy) is the
  // sprite's visual center in its own coordinates
  const conf: Record<string, { scale: number; cx: number; cy: number }> = {
    towncenter: { scale: 0.44, cx: 0, cy: -11 },
    farm: { scale: 0.85, cx: 2, cy: -1 },
    watchtower: { scale: 0.58, cx: 0, cy: -23 },
    archeryrange: { scale: 0.62, cx: -2, cy: -3 },
    stable: { scale: 0.6, cx: 0, cy: -5 },
    wall: { scale: 1.5, cx: 0, cy: -3 },
    gate: { scale: 1.05, cx: 0, cy: -2 },
    house: { scale: 1.0, cx: 0, cy: -5.5 },
    barracks: { scale: 0.72, cx: 0, cy: -7.5 },
    lumbercamp: { scale: 0.72, cx: 3, cy: -2.5 },
    miningcamp: { scale: 0.78, cx: 4.5, cy: -2.5 },
    mill: { scale: 0.7, cx: 0, cy: -12 },
    abbeymill: { scale: 0.56, cx: 0, cy: -12 },
    kingsbarracks: { scale: 0.6, cx: 0, cy: -9 },
    guildhall: { scale: 0.58, cx: 0, cy: -12 },
    whitekeep: { scale: 0.46, cx: 0, cy: -24 },
    chamberofcommerce: { scale: 0.58, cx: 0, cy: -11 },
    cavalryschool: { scale: 0.6, cx: 0, cy: -9 },
    royalvineyard: { scale: 0.58, cx: 0, cy: -10 },
    redpalace: { scale: 0.46, cx: 0, cy: -24 },
    church: { scale: 0.6, cx: 0, cy: -14 },
    ministry: { scale: 0.58, cx: 0, cy: -10 },
    siegeworkshop: { scale: 0.66, cx: 0, cy: -7 },
    mangonel: { scale: 1.1, cx: 0, cy: -6 },
    tree: { scale: 0.9, cx: 0, cy: -16 },
    goldmine: { scale: 0.8, cx: 0, cy: -6 },
    berrybush: { scale: 1.5, cx: 0, cy: -6 },
    stonequarry: { scale: 0.85, cx: 0, cy: -6 },
    deer: { scale: 1.5, cx: 0, cy: -8 },
    croc: { scale: 1.0, cx: 0, cy: -2 },
    crag: { scale: 0.7, cx: 0, cy: -8 },
    relic: { scale: 1.3, cx: 0, cy: -10 },
    trebuchet: { scale: 0.8, cx: 0, cy: -14 },
    villager: { scale: 1.6, cx: 0, cy: -6.5 },
    monk: { scale: 1.55, cx: 0, cy: -7 },
    swordsman: { scale: 1.45, cx: 0, cy: -8 },
    spearman: { scale: 1.4, cx: 0, cy: -8 },
    archer: { scale: 1.45, cx: 0, cy: -7 },
    scout: { scale: 1.15, cx: 0, cy: -10 },
    knight: { scale: 1.05, cx: 0, cy: -11 },
  }
  const k = conf[kind] ?? { scale: 1, cx: 0, cy: 0 }
  ctx.scale(2, 2)
  ctx.translate(24, 24)
  ctx.scale(k.scale, k.scale)
  ctx.translate(-k.cx, -k.cy)
  switch (kind) {
    case 'towncenter': drawTC(ctx, fake, 0.2, age); break
    case 'farm': drawFarm(ctx, fake, 0.2); break
    case 'watchtower': drawWatchtower(ctx, fake, 0.2); break
    case 'archeryrange': drawArcheryRange(ctx, fake, 0.2); break
    case 'stable': drawStable(ctx, fake, 0.2); break
    case 'wall': drawWall(ctx, fake); break
    case 'gate': drawGate(ctx, fake, 0.2, false); break
    case 'house': drawHouse(ctx, fake, 0.2, age); break
    case 'barracks': drawBarracks(ctx, fake, 0.2, age); break
    case 'lumbercamp': drawLumberCamp(ctx, fake); break
    case 'miningcamp': drawMiningCamp(ctx, fake); break
    case 'mill': drawMill(ctx, fake, 0.8, age); break
    case 'abbeymill': drawAbbeyMill(ctx, fake, 0.8); break
    case 'kingsbarracks': drawKingsBarracks(ctx, fake, 0.8); break
    case 'guildhall': drawGuildhall(ctx, fake, 0.8); break
    case 'whitekeep': drawWhiteKeep(ctx, fake, 0.8); break
    case 'chamberofcommerce': drawChamberOfCommerce(ctx, fake, 0.8); break
    case 'cavalryschool': drawCavalrySchool(ctx, fake, 0.8); break
    case 'royalvineyard': drawRoyalVineyard(ctx, fake, 0.8); break
    case 'redpalace': drawRedPalace(ctx, fake, 0.8); break
    case 'church': drawChurch(ctx, fake, 0.8); break
    case 'ministry': drawMinistry(ctx, fake, 0.8); break
    case 'siegeworkshop': drawSiegeWorkshop(ctx, fake, 0.8); break
    case 'mangonel': drawMangonel(ctx, fake, 0); break
    case 'tree': drawTree(ctx, fake, 0); break
    case 'goldmine': drawMine(ctx, fake); break
    case 'berrybush': drawBush(ctx, fake, 0); break
    case 'stonequarry': drawQuarry(ctx, fake); break
    case 'deer': drawDeer(ctx, fake, 0); break
    case 'croc': drawCroc(ctx, fake, 0, false); break
    case 'crag': drawCrag(ctx, fake); break
    case 'relic': drawRelic(ctx, fake, 0); break
    case 'trebuchet': drawTrebuchet(ctx, fake, 0); break
    case 'villager': drawVillager(ctx, fake, 0); break
    case 'monk': drawMonk(ctx, fake, 0); break
    case 'swordsman': drawSwordsman(ctx, fake, 0); break
    case 'spearman': drawSpearman(ctx, fake, 0); break
    case 'archer': drawArcher(ctx, fake, 0); break
    case 'scout': drawScout(ctx, fake, 0); break
    case 'knight': drawKnight(ctx, fake, 0); break
  }
  return c
}

// Heraldry, not flags: each company is known by the beast it wears, borne on
// a roundel in its own colours. A flag now means something else entirely —
// it marks where a company musters (see musterIcon).
const CREAM = '#FBF3E4'
const BEAST_CHARGE: Record<Beast, (e: string) => string> = {
  lion: e => `<path d="M16.00 8.80 Q19.46 5.75 20.47 10.25 Q25.06 9.82 23.23 14.05 Q27.20 16.40 23.23 18.75 Q25.06 22.98 20.47 22.55 Q19.46 27.05 16.00 24.00 Q12.54 27.05 11.53 22.55 Q6.94 22.98 8.77 18.75 Q4.80 16.40 8.77 14.05 Q6.94 9.82 11.53 10.25 Q12.54 5.75 16.00 8.80 Z" fill="${CREAM}"/><circle cx="16" cy="16.4" r="7.2" fill="${e}"/><circle cx="16" cy="16.4" r="5.7" fill="${CREAM}"/><circle cx="13.9" cy="15.2" r="1.05" fill="${e}"/><circle cx="18.1" cy="15.2" r="1.05" fill="${e}"/><path d="M16 17.5 l1.9 1.2 a2.25 2.25 0 0 1 -3.8 0 z" fill="${e}"/><path d="M16 18.7 v1.5 M16 20.2 q-1.6 1.2 -2.9 .1 M16 20.2 q1.6 1.2 2.9 .1" stroke="${e}" stroke-width="0.85" fill="none" stroke-linecap="round"/>`,
  stag: e => `<g stroke="${CREAM}" stroke-width="1.5" stroke-linecap="round" fill="none"><path d="M13.2 12.2 L10.6 7.4 M10.6 7.4 L7.6 7.0 M11.8 9.6 L8.6 10.2 M10.6 7.4 L10.9 4.4"/><path d="M18.8 12.2 L21.4 7.4 M21.4 7.4 L24.4 7.0 M20.2 9.6 L23.4 10.2 M21.4 7.4 L21.1 4.4"/></g><path d="M16 10.6 c3.4 0 5 2.1 5 4.6 c0 3.4-2.2 7.2-5 9.2 c-2.8-2-5-5.8-5-9.2 c0-2.5 1.6-4.6 5-4.6 z" fill="${CREAM}"/><ellipse cx="10.3" cy="13.6" rx="2.4" ry="1.5" transform="rotate(-28 10.3 13.6)" fill="${CREAM}"/><ellipse cx="21.7" cy="13.6" rx="2.4" ry="1.5" transform="rotate(28 21.7 13.6)" fill="${CREAM}"/><circle cx="13.7" cy="15.2" r="1.15" fill="${e}"/><circle cx="18.3" cy="15.2" r="1.15" fill="${e}"/><ellipse cx="16" cy="21.4" rx="1.9" ry="1.4" fill="${e}"/>`,
  boar: e => `<path d="M16 8.6 L17.4 11.2 L19.6 10 L19.9 12.4 L22.2 11.8 L21.7 14.2" fill="none" stroke="${CREAM}" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round"/><path d="M16 8.6 L14.6 11.2 L12.4 10 L12.1 12.4 L9.8 11.8 L10.3 14.2" fill="none" stroke="${CREAM}" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round"/><path d="M16 11.2 c4.2 0 6.6 2.3 6.6 5.1 c0 3.4-3 7-6.6 8.4 c-3.6-1.4-6.6-5-6.6-8.4 c0-2.8 2.4-5.1 6.6-5.1 z" fill="${CREAM}"/><path d="M10.5 19.4 c-2 .6-2.8 2.3-2.2 4.2" stroke="${CREAM}" stroke-width="1.7" stroke-linecap="round" fill="none"/><path d="M21.5 19.4 c2 .6 2.8 2.3 2.2 4.2" stroke="${CREAM}" stroke-width="1.7" stroke-linecap="round" fill="none"/><circle cx="13.2" cy="15.6" r="1.15" fill="${e}"/><circle cx="18.8" cy="15.6" r="1.15" fill="${e}"/><rect x="13.1" y="19.2" width="5.8" height="3.9" rx="1.9" fill="${e}"/><circle cx="14.7" cy="21.1" r="0.72" fill="${CREAM}"/><circle cx="17.3" cy="21.1" r="0.72" fill="${CREAM}"/>`,
  wolf: e => `<path d="M10.2 12.9 L11.9 6.1 L15.0 11.4 Z" fill="${CREAM}"/><path d="M21.8 12.9 L20.1 6.1 L17.0 11.4 Z" fill="${CREAM}"/><path d="M11.7 11.4 L12.4 8.6 L13.9 11.3 Z" fill="${e}"/><path d="M20.3 11.4 L19.6 8.6 L18.1 11.3 Z" fill="${e}"/><path d="M10.4 11.9 L13.4 13.3 H18.6 L21.6 11.9 L21.9 17.5 C21.9 19.5 20.1 20.5 18.8 20.9 L18.2 24.1 C18.2 25.5 13.8 25.5 13.8 24.1 L13.2 20.9 C11.9 20.5 10.1 19.5 10.1 17.5 Z" fill="${CREAM}"/><path d="M12.3 15.7 L14.9 16.6 L12.4 17.3 Z" fill="${e}"/><path d="M19.7 15.7 L17.1 16.6 L19.6 17.3 Z" fill="${e}"/><path d="M16 21.3 l1.55 1 a1.85 1.85 0 0 1 -3.1 0 z" fill="${e}"/>`,
}

// The whole-host shield, in whichever banner's colours are currently active:
// gold-trimmed, studded along the chief, crossed steel over the field, and an
// ARMY ribbon draped across the foot.
function armyShield(banner: number): string {
  const b = BANNERS[banner] ?? BANNERS[0]
  const sword = `<rect x="30" y="12" width="4" height="26" fill="#E4E7EC"/>` +
    `<path d="M30 12 L32 6.5 L34 12 Z" fill="#F4F6F9"/>` +
    `<rect x="31.9" y="12" width="2.1" height="26" fill="#C7CCD4"/>` +
    `<rect x="24.5" y="38" width="15" height="3.6" rx="1.8" fill="#E9B44C"/>` +
    `<rect x="30.7" y="41.2" width="2.6" height="7" fill="#8B6A4A"/>` +
    `<circle cx="32" cy="49.4" r="2.5" fill="#E9B44C"/>`
  return `<svg viewBox="0 0 64 72" width="60" height="68" aria-hidden="true">` +
    `<path d="M5 5 H59 V30 C59 50 46 63.5 32 69.5 C18 63.5 5 50 5 30 Z" fill="#C98F2B"/>` +
    `<path d="M8.4 8.4 H55.6 V29.6 C55.6 47.6 44.4 59.8 32 65.4 C19.6 59.8 8.4 47.6 8.4 29.6 Z" fill="${b.color}" stroke="${b.edge}" stroke-width="1.7" stroke-linejoin="round"/>` +
    `<path d="M8.4 8.4 H55.6 V19 H8.4 Z" fill="rgba(255,255,255,0.2)"/>` +
    `<circle cx="15" cy="12.6" r="1.5" fill="#E9B44C"/><circle cx="32" cy="12.6" r="1.5" fill="#E9B44C"/><circle cx="49" cy="12.6" r="1.5" fill="#E9B44C"/>` +
    `<g transform="rotate(45 32 32)">${sword}</g><g transform="rotate(-45 32 32)">${sword}</g>` +
    `<path d="M3 50.5 L61 50.5 L56.5 57 L61 63.5 L3 63.5 L7.5 57 Z" fill="#F5D584" stroke="#C98F2B" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<text x="32" y="60.3" text-anchor="middle" font-size="9.5" font-weight="700" letter-spacing="0.6" fill="#5A4632" font-family="Fredoka, Nunito, system-ui, sans-serif">ARMY</text>` +
    `</svg>`
}

function bannerIcon(i: number, size = 32): string {
  const b = BANNERS[i] ?? BANNERS[0]
  return `<svg class="pennant" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">` +
    `<circle cx="16" cy="16" r="15" fill="#C98F2B"/>` +
    `<circle cx="16" cy="16" r="13.2" fill="${b.color}" stroke="${b.edge}" stroke-width="1.3"/>` +
    BEAST_CHARGE[b.beast](b.edge) + `</svg>`
}

// The muster flag: a pennant on a planted pole. Now that no company wears a
// flag, one on the grass means one thing only — stand here once you are raised.
// A cream keyline keeps the cloth legible on the honey dock whatever colour the
// company flies, and a mound of earth at the foot says the flag is already
// planted — so the button needs no badge to tell you.
function musterIcon(color: string, edge: string, planted: boolean, size = 38): string {
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">` +
    (planted
      ? `<ellipse cx="13.1" cy="27.5" rx="7.4" ry="2.6" fill="#8B6A4A"/>` +
        `<ellipse cx="13.1" cy="26.7" rx="7.4" ry="2.6" fill="#A98456"/>`
      : `<path d="M8.6 27.5 h9" stroke="#A98456" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="2.6 2.8"/>`) +
    `<rect x="11.9" y="3.4" width="2.4" height="23.8" rx="1.2" fill="#8B6A4A"/>` +
    `<path d="M14.3 4.6 H27 L22.6 10.6 L27 16.6 H14.3 Z" fill="none" stroke="${CREAM}" stroke-width="3.4" stroke-linejoin="round"/>` +
    `<path d="M14.3 4.6 H27 L22.6 10.6 L27 16.6 H14.3 Z" fill="${color}" stroke="${edge}" stroke-width="1.4" stroke-linejoin="round"` +
      (planted ? '' : ' opacity="0.5"') + `/>` +
    `<circle cx="13.1" cy="3.1" r="2.1" fill="#E9B44C" stroke="#C98F2B" stroke-width="0.9"/>` +
    `</svg>`
}

// Who's playing, as far as the menu is concerned. A stand-in until accounts
// arrive: nothing leaves the device and the sim never reads it.
let playerName = ''

const MINI_VILL = `<svg viewBox="0 0 24 24" width="10" height="10"><circle cx="12" cy="7.5" r="4.5" fill="currentColor"/><path d="M4.5 20.5c.8-4.6 4-6.8 7.5-6.8s6.7 2.2 7.5 6.8z" fill="currentColor"/></svg>`

export function initUI(g: Game): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement
  // the blue grab-everything button anchors the bottom of the army panel;
  // per-type chips grow above it as the army musters (see syncUI)
  const all = document.createElement('button')
  all.id = 'army-all'
  all.innerHTML = armyShield(LION_BANNER)
  all.addEventListener('click', () => selectArmy(g, canvas))
  const chipWrap = document.createElement('div')
  chipWrap.id = 'army-chips'
  el('army-panel').appendChild(chipWrap)
  el('army-panel').appendChild(all)
  el('t-wood').insertAdjacentHTML('afterbegin', ICON.wood)
  el('t-food').insertAdjacentHTML('afterbegin', ICON.food)
  el('t-gold').insertAdjacentHTML('afterbegin', ICON.gold)
  el('t-stone').insertAdjacentHTML('afterbegin', ICON.stone)
  el('t-pop').insertAdjacentHTML('afterbegin', ICON.pop)
  for (const r of ['wood', 'food', 'gold', 'stone'] as ResKind[]) {
    el(`s-${r}`).insertAdjacentHTML('afterbegin', MINI_VILL)
    // tapping a resource pill puts one more villager on that resource
    el(`p-${r}`).addEventListener('click', () => sendVillagerToResource(g, r))
  }
  el('p-pop').addEventListener('click', () => cycleIdleVillager(g, canvas))

  // ---- the two HUD tools: deselect, and info mode ----
  // deselect: an empty frame by the stone — one tap drops a whole crowd
  el('p-clear').insertAdjacentHTML('afterbegin', ICON.deselect)
  el('p-clear').addEventListener('click', () => {
    if (!g.selection.length && !g.placing) return
    g.selection = []
    g.placing = null
    g.placePos = null
    g.placeEnd = null
    g.uiDirty = true
  })
  // sound: a handbell that goes quiet when it's struck through
  const soundBtn = el('p-sound')
  const paintSound = (): void => {
    soundBtn.innerHTML = muted ? ICON.soundOff : ICON.soundOn
    soundBtn.classList.toggle('dim', muted)
    soundBtn.setAttribute('aria-pressed', String(!muted))
    soundBtn.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on')
  }
  paintSound()
  soundBtn.addEventListener('click', () => {
    unlockAudio() // muting is a gesture too, so this is where audio may wake up
    toggleMuted()
    paintSound()
    if (!muted) sfx('tap')
  })

  // info mode: while it's lit, taps read a thing out instead of commanding it
  el('p-info').insertAdjacentHTML('afterbegin', ICON.info)
  el('p-info').addEventListener('click', () => {
    g.infoMode = !g.infoMode
    g.infoId = null
    if (g.infoMode) {
      // reading, not ruling: drop the selection so no stray order slips out
      g.selection = []
      g.placing = null
      g.placePos = null
      g.placeEnd = null
      toast(g, 'Info mode — tap anything to read about it.')
    }
    g.uiDirty = true
  })

  // the minimap is the fast way around: tap (or drag) to send the camera there
  const mini = el<HTMLCanvasElement>('minimap')
  const jumpTo = (ev: PointerEvent) => {
    const r = mini.getBoundingClientRect()
    g.camera.x = ((ev.clientX - r.left) / r.width) * g.world.w
    g.camera.y = ((ev.clientY - r.top) / r.height) * g.world.h
    clampCamera(g, canvas)
  }
  mini.addEventListener('pointerdown', ev => {
    ev.preventDefault()
    ev.stopPropagation()
    mini.setPointerCapture(ev.pointerId)
    jumpTo(ev)
  })
  mini.addEventListener('pointermove', ev => {
    if (ev.buttons) jumpTo(ev)
  })

  // ---- the way in: name → mode → map → banner → begin ----
  // The login is a stand-in: no server, no password, just a name kept on this
  // device so the menu can greet you. Real accounts land with multiplayer.
  const NAME_KEY = 'bramblewick.name'
  const stored = (() => {
    try { return localStorage.getItem(NAME_KEY) ?? '' } catch { return '' }
  })()
  const nameField = el('login-name') as HTMLInputElement
  nameField.value = stored

  const CARDS = ['menu-login', 'menu-home', 'menu-map-screen', 'menu-solo-screen']
  const step = (id: string): void => {
    for (const c of CARDS) el(c).classList.toggle('hidden', c !== id)
  }

  const signIn = (name: string): void => {
    playerName = name.trim().slice(0, 18)
    try {
      if (playerName) localStorage.setItem(NAME_KEY, playerName)
      else localStorage.removeItem(NAME_KEY)
    } catch { /* a locked-down browser just forgets between visits */ }
    el('menu-greeting').textContent = playerName ? `Welcome, ${playerName}` : 'Welcome, wanderer'
    step('menu-home')
  }
  el('login-go').addEventListener('click', () => signIn(nameField.value))
  el('login-guest').addEventListener('click', () => signIn(''))
  nameField.addEventListener('keydown', ev => {
    if ((ev as KeyboardEvent).key === 'Enter') signIn(nameField.value)
  })
  el('home-back').addEventListener('click', () => step('menu-login'))

  // ---- the map picker, built from the table so a new map is a data edit ----
  let mapPick = MAPS[0]
  const mapList = el('map-cards')
  for (const m of MAPS) {
    const b = document.createElement('button')
    b.className = 'map-card' + (m === mapPick ? ' selected' : '')
    b.dataset.map = m.id
    b.innerHTML = `<i>${m.tag}</i><b>${m.name}</b><small>${m.blurb}</small>`
    b.addEventListener('click', () => {
      mapPick = m
      mapList.querySelectorAll('.map-card').forEach(c => c.classList.remove('selected'))
      b.classList.add('selected')
    })
    mapList.appendChild(b)
  }
  mapList.insertAdjacentHTML('afterend',
    '<div class="menu-note">\u{1F5FA} More meadows are being surveyed</div>')

  el('menu-solo').addEventListener('click', () => step('menu-map-screen'))
  el('map-back').addEventListener('click', () => step('menu-home'))
  el('map-next').addEventListener('click', () => step('menu-solo-screen'))
  el('menu-back').addEventListener('click', () => step('menu-map-screen'))

  // ---- banner and difficulty, then out into the meadow ----
  let civPick: CivId = 'english'
  document.querySelectorAll<HTMLButtonElement>('.civ-card').forEach(cardEl => {
    cardEl.addEventListener('click', () => {
      document.querySelectorAll('.civ-card').forEach(c => c.classList.remove('selected'))
      cardEl.classList.add('selected')
      civPick = (cardEl.dataset.civ as CivId) ?? 'english'
    })
  })
  document.querySelectorAll<HTMLButtonElement>('.diff-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.diff-chip').forEach(c => c.classList.remove('selected'))
      chip.classList.add('selected')
      g.aiLevel = (chip.dataset.diff as Game['aiLevel']) ?? 'normal'
    })
  })
  el('play-btn').addEventListener('click', () => {
    // The world was dealt at boot, before you picked a map. Deal it again if
    // the ground you chose isn't the ground under your feet — a fresh roll
    // always counts as different, which is the point of it.
    const want = mapPick.seed
    if (want === null || want !== g.mapSeed) {
      const level = g.aiLevel
        resetGame(g, want === null ? { seed: (Date.now() >>> 0) || 1 } : want === 0 ? undefined : { seed: want })
      g.aiLevel = level
      clampCamera(g, canvas)
    }
    // the enemy always marches under the other banner — every match is civ vs civ
    g.civs = [civPick, civPick === 'english' ? 'french' : 'english']
    if (g.aiLevel === 'hard') { g.res[1].food += 150; g.res[1].wood += 150 } // a fierce rival starts flush
    g.started = true
    el('start-overlay').classList.add('hidden')
    toast(g, `${CIVS[g.civs[1]].name} raise their banner across the meadow.`)
  })
  el('replay-btn').addEventListener('click', () => location.reload())
}

function selectedEnts(g: Game): Ent[] {
  return g.selection.map(id => g.byId.get(id)).filter((e): e is Ent => !!e)
}

function queueLen(g: Game): number {
  let n = 0
  for (const e of g.ents) if (e.team === 0 && e.queue) n += e.queue.length
  return n
}

function tryTrain(g: Game, b: Ent, kind: 'villager' | 'swordsman' | 'spearman' | 'archer' | 'scout' | 'knight' | 'monk' | 'mangonel' | 'trebuchet'): void {
  const s = UNITS[kind]
  const ageReq = unitAgeReq(g, 0, kind)
  if (ageReq > g.age[0]) { toast(g, `Reach the ${AGE_NAMES[ageReq]} first!`); return }
  // the King's Barracks musters its spear levy for a pittance;
  // the School of Cavalry saddles knights at a chevalier's discount
  const levy = b.kind === 'kingsbarracks' && kind === 'spearman'
  const school = b.kind === 'cavalryschool' && kind === 'knight'
  const trainCost = levy ? LEVY_SPEAR_COST : school ? SCHOOL_KNIGHT_COST : s.cost
  const trainTime = levy ? LEVY_SPEAR_TIME : school ? SCHOOL_KNIGHT_TIME : s.time
  const p = pop(g, 0)
  if (p.used + queueLen(g) >= p.cap) { toast(g, 'Population full — build a House!'); return }
  if (!canAfford(g, 0, trainCost)) {
    const r = g.res[0]
    const missing =
      r.food < trainCost.food ? 'Not enough food — forage berries or work a farm!' :
      r.gold < trainCost.gold ? 'Not enough gold — mine some!' :
      r.stone < trainCost.stone ? 'Not enough stone — quarry some!' :
      'Not enough wood!'
    toast(g, missing)
    return
  }
  if ((b.queue?.length ?? 0) >= 5) { toast(g, 'Training queue is full.'); return }
  pay(g, 0, trainCost)
  b.queue!.push({ kind, t: trainTime, total: trainTime })
  g.uiDirty = true
}

interface IconBtn {
  cmd: string
  label: string
  icon: HTMLElement | string
  cost?: Cost
  badge?: string
  locked?: boolean
}

const COST_KEYS = ['wood', 'food', 'gold', 'stone'] as const

function iconButton(opts: IconBtn, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = 'cmd icon'
  b.dataset.cmd = opts.cmd
  b.setAttribute('aria-label', opts.label)
  const costs: string[] = []
  for (const k of COST_KEYS) {
    const n = opts.cost?.[k] ?? 0
    if (!n) continue
    b.dataset[k] = String(n)
    costs.push(`${n}${ICON[k]}`)
  }
  if (typeof opts.icon === 'string') b.insertAdjacentHTML('beforeend', opts.icon)
  else b.appendChild(opts.icon)
  if (costs.length) b.insertAdjacentHTML('beforeend', `<i>${costs.join(' ')}</i>`)
  if (opts.badge) b.insertAdjacentHTML('beforeend', `<span class="badge">${opts.badge}</span>`)
  if (opts.locked) {
    b.classList.add('locked')
    b.insertAdjacentHTML('beforeend', ICON.lock)
  }
  b.addEventListener('click', onClick)
  return b
}

// ---- production loaders (a small top-left row): one ring per thing underway — a unit
// training (with its queue count), an upgrade researching, a landmark rising.
// The ring fills like an app download; tapping it selects the busy building.
const RING_C = 2 * Math.PI * 22
let prodSig = ''
function syncProdPanel(g: Game): void {
  interface Item { key: string; hostId: number; icon: string; frac: number; count: number }
  const items: Item[] = []
  for (const e of g.ents) {
    if (e.team !== 0) continue
    if (e.queue?.length) {
      items.push({
        key: `q${e.id}`, hostId: e.id, icon: `unit:${e.queue[0].kind}`,
        frac: 1 - e.queue[0].t / e.queue[0].total, count: e.queue.length,
      })
    }
    if (e.research) {
      items.push({
        key: `r${e.id}`, hostId: e.id, icon: `research:${e.research.id}`,
        frac: 1 - e.research.t / e.research.total, count: 1,
      })
    }
    if (!e.complete && LANDMARKS[e.kind as LandmarkKind]) {
      items.push({
        key: `l${e.id}`, hostId: e.id, icon: `landmark:${e.kind}`,
        frac: e.progress ?? 0, count: 1,
      })
    }
  }
  const panel = el('prod-panel')
  const sig = items.map(i => `${i.key}:${i.icon}`).join(',')
  if (sig !== prodSig) {
    prodSig = sig
    panel.innerHTML = ''
    for (const it of items) {
      const chip = document.createElement('button')
      chip.className = 'prod-chip'
      chip.dataset.key = it.key
      const [what, id] = it.icon.split(':')
      chip.setAttribute('aria-label',
        what === 'unit' ? `Training ${UNITS[id]?.name ?? id}` :
        what === 'landmark' ? `${BUILDINGS[id].name} rising` :
        `Researching ${CHAMPS[id as ChampId]?.name ?? TECHS[id as TechId]?.name ?? id}`)
      if (what === 'unit' || what === 'landmark') chip.appendChild(spriteIcon(id))
      else if (CHAMPS[id as ChampId]) chip.insertAdjacentHTML('beforeend', ICON.crown.replace('<svg ', '<svg class="picon" '))
      else chip.insertAdjacentHTML('beforeend', (TECH_ICON[id as TechId] ?? ICON.crown).replace('<svg ', '<svg class="picon" '))
      chip.insertAdjacentHTML('beforeend',
        `<svg class="ring" viewBox="0 0 50 50"><circle class="track" cx="25" cy="25" r="22"/><circle class="fill" cx="25" cy="25" r="22" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg>`)
      chip.insertAdjacentHTML('beforeend', `<span class="count hidden">×1</span>`)
      chip.addEventListener('click', () => {
        // a gentle nudge: select the busy building (the camera stays put)
        if (g.byId.has(it.hostId)) { g.selection = [it.hostId]; g.uiDirty = true }
      })
      panel.appendChild(chip)
    }
  }
  // every frame: rings fill, counts tick
  panel.querySelectorAll<HTMLElement>('.prod-chip').forEach((chip, i) => {
    const it = items[i]
    if (!it) return
    const fill = chip.querySelector<SVGCircleElement>('.ring .fill')
    if (fill) fill.style.strokeDashoffset = String(RING_C * (1 - Math.max(0, Math.min(1, it.frac))))
    const count = chip.querySelector<HTMLElement>('.count')
    if (count) {
      count.classList.toggle('hidden', it.count < 2)
      const want = `×${it.count}`
      if (count.textContent !== want) count.textContent = want
    }
  })
}

// which build submenu is open (per selection; resets when the selection changes)
let buildCat: 'economy' | 'military' | null = null
let agePick = false // the landmark-choice menu on the Town Hall
let lastSelKey = ''
let bannerPick = false

// the landmark site currently rising toward the player's next age, if any
function landmarkSite(g: Game): Ent | null {
  for (const e of g.ents) {
    if (e.team !== 0 || e.complete) continue
    const lm = LANDMARKS[e.kind as LandmarkKind]
    if (lm && lm.toAge === g.age[0] + 1) return e
  }
  return null
}

// research buttons / progress pill for whatever economy techs live here
function researchDock(g: Game, dock: HTMLElement, b: Ent): void {
  const ids = (Object.keys(TECHS) as TechId[]).filter(t => TECHS[t].at === b.kind)
  if (!ids.length) return
  if (b.research) return // the top-right loader tells the story now
  for (const id of ids) {
    if (g.techs[0][id]) continue // already known
    const spec = TECHS[id]
    dock.appendChild(iconButton(
      { cmd: `research-${id}`, label: `Research ${spec.name} — ${spec.blurb}`, icon: TECH_ICON[id], cost: spec.cost, locked: g.age[0] < 2 },
      () => {
        if (g.age[0] < 2) { toast(g, 'Reach the Feudal Age first!'); return }
        if (b.research || g.techs[0][id]) return
        if (!canAfford(g, 0, spec.cost)) { toast(g, `Not enough for ${spec.name}.`); return }
        pay(g, 0, spec.cost)
        b.research = { id, t: spec.time, total: spec.time }
        g.uiDirty = true
      }))
  }
}

// the champion upgrade offered by this military hall, plus its progress pill
function champDock(g: Game, dock: HTMLElement, b: Ent): void {
  const id = (Object.keys(CHAMPS) as ChampId[]).find(c => CHAMPS[c].at.includes(b.kind))
  if (!id) return
  if (b.research) return // the top-right loader tells the story now
  if (g.champs[0][id]) return // already sworn in
  const spec = CHAMPS[id]
  dock.appendChild(iconButton(
    { cmd: `champ-${id}`, label: `${spec.name} — ${spec.blurb}`, icon: ICON.crown, cost: spec.cost, locked: g.age[0] < 3 },
    () => {
      if (g.age[0] < 3) { toast(g, 'Reach the Castle Age first!'); return }
      if (b.research || g.champs[0][id]) return
      if (!canAfford(g, 0, spec.cost)) { toast(g, `Not enough for ${spec.name}.`); return }
      pay(g, 0, spec.cost)
      b.research = { id, t: spec.time, total: spec.time }
      g.uiDirty = true
    }))
}

function updateAffordability(g: Game): void {
  const btns = document.querySelectorAll<HTMLButtonElement>('#dock-buttons button.cmd')
  btns.forEach(b => {
    let hasCost = false
    let short = false
    for (const k of COST_KEYS) {
      const n = Number(b.dataset[k] ?? 0)
      if (!n) continue
      hasCost = true
      if (g.res[0][k] < n) short = true
    }
    if (hasCost) b.classList.toggle('disabled', short)
  })
}

// ---- the minimap: the whole meadow at a glance, fog and all. Tap it to
// send the camera there; red rings pulse where your things are under attack ----
let miniFog: HTMLCanvasElement | null = null
function drawMinimap(g: Game): void {
  const c = el<HTMLCanvasElement>('minimap')
  const ctx = c.getContext('2d')!
  const W = c.width, H = c.height
  const sx = W / g.world.w, sy = H / g.world.h
  // fog underlay, softly scaled up from the fog grid
  if (!miniFog || miniFog.width !== g.fog.w || miniFog.height !== g.fog.h) {
    miniFog = document.createElement('canvas')
    miniFog.width = g.fog.w
    miniFog.height = g.fog.h
  }
  const fctx = miniFog.getContext('2d')!
  const img = fctx.createImageData(g.fog.w, g.fog.h)
  const d = img.data
  for (let i = 0; i < g.fog.w * g.fog.h; i++) {
    const o = i * 4
    if (!g.fog.explored[i]) { d[o] = 30; d[o + 1] = 42; d[o + 2] = 26 }
    else if (!g.fog.visible[i]) { d[o] = 74; d[o + 1] = 95; d[o + 2] = 56 }
    else { d[o] = 122; d[o + 1] = 153; d[o + 2] = 88 }
    d[o + 3] = 255
  }
  fctx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(miniFog, 0, 0, g.fog.w, g.fog.h, 0, 0, W, H)
  // the stream and its fords — only the stretches you've actually found
  // (rivers, and one day ponds, are discoveries, not free intelligence)
  if (g.streams.length) {
    ctx.strokeStyle = '#6D9DC5'
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const s of g.streams) {
      ctx.beginPath()
      let pen = false
      for (let i = 0; i + 1 < s.pts.length; i++) {
        const a = s.pts[i], b = s.pts[i + 1]
        // walk each leg in fog-cell-sized steps so the reveal hugs the fog line
        for (let k = 0; k < 3; k++) {
          const t0 = k / 3, t1 = (k + 1) / 3
          const mx = a.x + (b.x - a.x) * (t0 + t1) / 2
          const my = a.y + (b.y - a.y) * (t0 + t1) / 2
          if (g.fog.explored[fogIndex(g, mx, my)] === 1) {
            if (!pen) { ctx.moveTo((a.x + (b.x - a.x) * t0) * sx, (a.y + (b.y - a.y) * t0) * sy); pen = true }
            ctx.lineTo((a.x + (b.x - a.x) * t1) * sx, (a.y + (b.y - a.y) * t1) * sy)
          } else {
            pen = false
          }
        }
      }
      ctx.stroke()
    }
    ctx.fillStyle = '#D8C89C'
    for (const f of g.fords) {
      if (g.fog.explored[fogIndex(g, f.x, f.y)] !== 1) continue
      ctx.beginPath(); ctx.arc(f.x * sx, f.y * sy, 2.2, 0, Math.PI * 2); ctx.fill()
    }
  }
  // the land and the villages (enemy buildings once seen, units in live sight)
  for (const e of g.ents) {
    const fi = fogIndex(g, e.x, e.y)
    const seen = g.fog.explored[fi] === 1
    const lit = g.fog.visible[fi] === 1
    const mx = e.x * sx, my = e.y * sy
    if (e.kind === 'tree') {
      if (seen && (e.amount ?? 0) > 0) { ctx.fillStyle = '#3E5A34'; ctx.fillRect(mx - 1, my - 1, 2, 2) }
    } else if (e.kind === 'crag') {
      if (seen) { ctx.fillStyle = '#8E8A7C'; ctx.fillRect(mx - 1.5, my - 1.5, 3, 3) }
    } else if (e.kind === 'goldmine') {
      if (seen && (e.amount ?? 0) > 0) { ctx.fillStyle = '#E9B44C'; ctx.fillRect(mx - 1.5, my - 1.5, 3, 3) }
    } else if (e.kind === 'stonequarry') {
      if (seen && (e.amount ?? 0) > 0) { ctx.fillStyle = '#BDB8AA'; ctx.fillRect(mx - 1.5, my - 1.5, 3, 3) }
    } else if (e.kind === 'berrybush') {
      if (seen && (e.amount ?? 0) > 0) { ctx.fillStyle = '#C9525E'; ctx.fillRect(mx - 1, my - 1, 2, 2) }
    } else if (e.kind === 'relic') {
      // a found, unclaimed relic gleams on the map — worth a pilgrimage
      if (seen && e.heldBy === undefined && e.shrineId === undefined) {
        ctx.fillStyle = '#F5D584'
        ctx.beginPath()
        ctx.moveTo(mx, my - 2.6); ctx.lineTo(mx + 2.2, my); ctx.lineTo(mx, my + 2.6); ctx.lineTo(mx - 2.2, my)
        ctx.closePath(); ctx.fill()
      }
    } else if (isBuilding(e)) {
      if (e.team === 0 || seen) {
        ctx.fillStyle = e.team === 0 ? '#6D9DC5' : '#C4746B'
        const s = e.kind === 'towncenter' ? 5 : 3.4
        ctx.fillRect(mx - s / 2, my - s / 2, s, s)
        if (e.kind === 'towncenter') {
          ctx.strokeStyle = '#FBF3E4'
          ctx.lineWidth = 1
          ctx.strokeRect(mx - s / 2, my - s / 2, s, s)
        }
      }
    } else if (isUnit(e) && !e.hidden) {
      if (e.team === 0 || lit) {
        ctx.fillStyle = e.team === 0 ? '#BFD8EC' : '#E5A79F'
        ctx.fillRect(mx - 1, my - 1, 2, 2)
      }
    }
  }
  // under attack: pulsing rings
  for (const p of g.pings) {
    const age = g.t - p.t
    if (age > 3.6) continue
    const k = (age % 1.2) / 1.2
    ctx.globalAlpha = (1 - k) * 0.9
    ctx.strokeStyle = '#E25B4A'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(p.x * sx, p.y * sy, 2.5 + k * 6.5, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  // the camera's window on the world
  const gc = document.getElementById('game') as HTMLCanvasElement
  const halfW = gc.clientWidth / 2 / g.camera.zoom
  const halfH = gc.clientHeight / 2 / g.camera.zoom
  ctx.strokeStyle = 'rgba(251, 243, 228, 0.9)'
  ctx.lineWidth = 1.4
  ctx.strokeRect(
    (g.camera.x - halfW) * sx, (g.camera.y - halfH) * sy,
    halfW * 2 * sx, halfH * 2 * sy)
}

// one chip per unit type the player fields, count badges live; rebuilt only
// when the tally actually changes
const ARMY_TYPES = ['spearman', 'swordsman', 'archer', 'knight', 'mangonel', 'trebuchet', 'monk'] as const
let armySig = ''
function syncArmyPanel(g: Game): void {
  // the bucklers are the ACTIVE banner's roster, not the whole village
  const counts = ARMY_TYPES.map(k =>
    g.ents.reduce((n, e) =>
      n + (e.team === 0 && e.kind === k && !e.hidden && e.banner === g.activeBanner ? 1 : 0), 0))
  // every banner's headcount rides in the signature, or a death in a company
  // you aren't looking at would leave its pennant showing a stale number
  const tally: number[] = []
  for (let i = 0; i < g.banners; i++) {
    tally.push(g.ents.reduce((c, e) =>
      c + (e.team === 0 && !e.hidden && e.banner === i ? 1 : 0), 0))
  }
  const sig = `${g.banners}:${g.activeBanner}:${counts.join(',')}:${tally.join(',')}`
  if (sig === armySig) return
  armySig = sig
  syncBannerStrip(g)
  const panel = el('army-chips')
  panel.querySelectorAll('.army-chip').forEach(c => c.remove())
  const canvas = document.getElementById('game') as HTMLCanvasElement
  // a tall host would run off the top of a landscape phone: pair the bucklers up
  panel.classList.toggle('two-col', counts.filter(n => n > 0).length > 3)
  ARMY_TYPES.forEach((kind, i) => {
    if (!counts[i]) return
    const chip = document.createElement('button')
    chip.className = 'army-chip'
    chip.dataset.cmd = `army-${kind}`
    chip.setAttribute('aria-label', `Select all ${UNITS[kind].name.toLowerCase()}s`)
    chip.appendChild(spriteIcon(kind))
    chip.insertAdjacentHTML('beforeend', `<span class="count">${counts[i]}</span>`)
    chip.addEventListener('click', () => selectUnitsOfKind(g, kind, canvas, g.activeBanner))
    panel.appendChild(chip)
  })
}

// ---- formation in the dock ----
// With soldiers selected the dock is otherwise empty, so how the company stands
// on the march lives there. Which banner a soldier rides under is set where the
// soldier is RAISED — at the military hall — rather than being fiddled with
// unit by unit in the field.
function formationIcon(kind: Formation, size = 38): string {
  const dot = (cx: number, cy: number): string =>
    `<circle cx="${cx}" cy="${cy}" r="2.6" fill="currentColor"/>`
  const pips = kind === 'line'
    ? [[6, 19], [13, 19], [20, 19], [27, 19], [34, 19]]
    : [[13, 12], [20, 12], [27, 12], [13, 19], [20, 19], [27, 19], [16.5, 26], [23.5, 26]]
  return `<svg viewBox="0 0 40 38" width="${size}" height="${size}" aria-hidden="true">` +
    pips.map(([cx, cy]) => dot(cx, cy)).join('') + '</svg>'
}

function formationDock(g: Game, dock: HTMLElement, sel: Ent[]): void {
  const troop = sel.filter(e => canBanner(e) && e.team === 0)
  if (!troop.length) return
  const cur = formationOf(g, troop) // the shape a move order would use right now
  let owner = g.activeBanner
  const tally = new Map<number, number>()
  for (const u of troop) if (u.banner !== undefined) tally.set(u.banner, (tally.get(u.banner) ?? 0) + 1)
  let most = 0
  for (const [b2, n] of tally) if (n > most) { most = n; owner = b2 }
  for (const kind of ['bunch', 'line'] as Formation[]) {
    if (cur === kind) continue // already how they stand
    dock.appendChild(iconButton(
      { cmd: `formation-${kind}`,
        label: kind === 'line' ? 'Form a line across the advance' : 'Bunch up shoulder to shoulder',
        icon: formationIcon(kind) },
      () => {
        g.formation[owner] = kind
        toast(g, kind === 'line'
          ? `${BANNERS[owner].name} forms a line.`
          : `${BANNERS[owner].name} bunches up.`)
        // re-issue the order in the new shape so it takes effect on the spot
        const moving = troop.filter(u => u.state === 'move' && u.tx !== undefined)
        if (moving.length > 1) {
          let tx = 0, ty = 0
          for (const u of moving) { tx += u.tx!; ty += u.ty! }
          commandMove(g, moving, tx / moving.length, ty / moving.length)
        }
        g.uiDirty = true
      }))
  }
}

// Where this hall's recruits walk once they step out of the door. The flag is
// per banner, not per hall, so every hall feeding a company sends its recruits
// to the same field.
function musterDock(g: Game, dock: HTMLElement, b: Ent): void {
  const banner = b.recruitBanner ?? LION_BANNER
  const spec = BANNERS[banner]
  const planted = g.muster[banner]
  if (g.mustering === banner) {
    const stop = document.createElement('button')
    stop.className = 'cmd ghost'
    stop.dataset.cmd = 'muster-cancel'
    stop.setAttribute('aria-label', 'Never mind the muster point')
    stop.textContent = '✕'
    stop.addEventListener('click', () => cancelMuster(g))
    dock.appendChild(stop)
    if (planted) {
      dock.appendChild(iconButton(
        { cmd: 'muster-clear', label: `${spec.name} musters at its halls again`,
          icon: musterIcon('#B9B1A2', '#8E877A', true) },
        () => clearMuster(g, banner)))
    }
    return
  }
  dock.appendChild(iconButton(
    { cmd: 'muster', label: planted
        ? `Move where ${spec.name} musters`
        : `Set where ${spec.name} musters`,
      icon: musterIcon(spec.color, spec.edge, !!planted) },
    () => beginMuster(g, banner)))
}

// A military hall flies a banner: everything it musters rides under it.
function recruitBannerDock(g: Game, dock: HTMLElement, b: Ent): void {
  const cur = b.recruitBanner ?? LION_BANNER
  if (!bannerPick) {
    dock.appendChild(iconButton(
      { cmd: 'recruit-banner', label: `Recruits ride under ${BANNERS[cur].name} — tap to change`,
        icon: bannerIcon(cur, 38) },
      () => { bannerPick = true; g.uiDirty = true }))
    return
  }
  const back = document.createElement('button')
  back.className = 'cmd ghost'
  back.dataset.cmd = 'back'
  back.setAttribute('aria-label', 'Back')
  back.textContent = '‹'
  back.addEventListener('click', () => { bannerPick = false; g.uiDirty = true })
  dock.appendChild(back)
  for (let i = 0; i < g.banners; i++) {
    dock.appendChild(iconButton(
      { cmd: `recruit-to-${i}`, label: `Send recruits to ${BANNERS[i].name}`, icon: bannerIcon(i, 38) },
      () => {
        b.recruitBanner = i
        bannerPick = false
        toast(g, `${BUILDINGS[b.kind].name}: recruits ride under ${BANNERS[i].name}.`)
        g.uiDirty = true
      }))
  }
  if (g.banners < BANNER_MAX) {
    dock.appendChild(iconButton(
      { cmd: 'recruit-to-new', label: 'Raise a new banner for these recruits', icon: bannerIcon(g.banners, 38) },
      () => {
        b.recruitBanner = g.banners
        raiseBanner(g, [])
        bannerPick = false
        g.uiDirty = true
      }))
    dock.querySelector('[data-cmd="recruit-to-new"]')!.insertAdjacentHTML('beforeend', '<i>new</i>')
  }
}

// ---- the info card: what the ? button reads out of whatever you tap ----
// Every entry is written for someone who has never played: what the thing is
// FOR, not just what it costs. Numbers all come from the tables, so they can
// never drift out of step with the game.
const INFO_BLURB: Partial<Record<Kind, string>> = {
  villager: 'Your hands. Villagers gather wood, food, gold and stone, raise every building, mend what is battered, and shelter in the Town Hall when the bell rings.',
  spearman: 'The cheap wall of the battle line. Spearmen carry a heavy bonus against anything mounted — scouts, knights and all.',
  swordsman: 'The tough one. Slower to pay for than a spear, but he soaks up arrows and cuts down archers who stand too long.',
  archer: 'The longbowman looses from well behind the front rank. Deadly on massed spearmen, helpless once cavalry reaches him.',
  scout: 'Eyes. Fast, harmless, and the only cheap way to pull the fog back off the meadow — send him out early and often.',
  knight: 'Armoured lance on a charger. Fast enough to run down archers, monks and siege engines; spearmen are the answer to him.',
  monk: 'Carries no weapon. He quietly mends wounded friends standing near him, and he alone can lift a holy relic and carry it to a shrine.',
  mangonel: 'A catapult that lobs a boulder at a spot on the ground — it shatters, and everything close is hit. Terrible against a scattered enemy, brutal against a clump. It cannot fire at anything right on top of it.',
  trebuchet: 'The great counterweight engine: it outranges every tower and keep on the meadow. It must stand still to plant its frame before it can loose, and packs up the moment it rolls.',
  towncenter: 'The heart of the village. Trains villagers, takes every resource as a drop-off, raises the laurel that begins an age, and shelters your people when the bell rings — a full hall shoots back.',
  house: 'Room for five more souls. Population is the real ceiling on an army; keep houses ahead of your training.',
  farm: 'Endless food, slowly. Each field wants exactly one farmer — a second pair of hands is waved off to a free field.',
  mill: 'A food drop-off close to the berries and the fields, so nobody walks the long way home. Researches the Wheelbarrow.',
  lumbercamp: 'A wood drop-off you plant beside the trees. Researches Steel Axes.',
  miningcamp: 'A gold and stone drop-off for the mines. Researches the Miner\u2019s Picks.',
  barracks: 'The infantry hall: spearmen from the Dark Age, swordsmen once Feudal dawns, and the Champion Infantry oath in the Castle Age.',
  archeryrange: 'Where longbows are strung. Trains longbowmen and swears in Champion Longbows.',
  stable: 'Horses. Scouts to see with, knights to charge with, and the Champion Knights oath.',
  siegeworkshop: 'Where the engines of war are wrought: mangonels for clumps of soldiers, trebuchets for walls and towers.',
  watchtower: 'Looses one arrow at a time at anything hostile in reach, garrisoned or not, and shelters up to five of your own inside.',
  wall: 'A palisade post. Cheap on its own, stubborn in a row — drag out a fence and let the enemy chew through it while your arrows fall.',
  gate: 'Swings open for your own people and stays barred to the enemy, who must chop it down.',
  church: 'Ordains monks, and shrines the relics they carry home. Every relic resting here tithes gold on its own, forever.',
  ministry: 'The hall of records: shrines relics like a church, and researches the two faith techs — Tithe Barns and Sanctuary.',
  tree: 'Wood. Chop it and the canopy shrinks; fell it and the stump becomes open ground for your people to walk through.',
  goldmine: 'Gold, for soldiers, monks and every upgrade worth having. It shrinks to rubble as you work it.',
  berrybush: 'The early food that carries your opening. It forages out — have a farm or a herd lined up before it does.',
  stonequarry: 'Stone, and stone alone builds new Town Halls and the fortress landmarks.',
  deer: 'Shy game. One villager can bring one down in three pokes; the venison hauls to any food drop-off.',
  croc: 'It lurks at the water and bites whatever strays near. One villager loses that fight — send three and it becomes 130 food.',
  crag: 'Bare rock. Nothing walks through it and nothing is built on it — a chokepoint if you use it well.',
  relic: 'A holy relic on its plinth. Only a monk may lift it; enshrined in a church or ministry it tithes gold forever.',
}

// what a building can put to work, so the card says why you would want one
const INFO_TRAINS: Partial<Record<Kind, Kind[]>> = {
  towncenter: ['villager'],
  barracks: ['spearman', 'swordsman'],
  kingsbarracks: ['spearman', 'swordsman'],
  archeryrange: ['archer'],
  stable: ['scout', 'knight'],
  cavalryschool: ['scout', 'knight'],
  siegeworkshop: ['mangonel', 'trebuchet'],
  church: ['monk'],
}

const HALL_KINDS: string[] = ['barracks', 'kingsbarracks', 'archeryrange', 'stable', 'cavalryschool', 'siegeworkshop']

function statChip(label: string, value: string): string {
  return `<span class="ic-stat"><i>${label}</i>${value}</span>`
}
function costChips(c: Cost): string {
  return COST_KEYS.filter(k => c[k] > 0).map(k => `<span class="ic-stat">${c[k]}${ICON[k]}</span>`).join('')
}

function buildInfoCard(g: Game, e: Ent): string {
  const u = UNITS[e.kind]
  const b = BUILDINGS[e.kind]
  const r = RESOURCES[e.kind]
  const lm = LANDMARKS[e.kind as LandmarkKind]
  const name = u?.name ?? b?.name ?? r?.name ?? (e.kind === 'relic' ? 'Holy Relic' : e.kind === 'crag' ? 'Rocky Crag' : e.kind)
  const tag = e.team === 0 ? 'Yours' : e.team === 1 ? 'The rival village' : isUnit(e) || b ? '' : 'The wilds'
  const stats: string[] = []
  const lines: string[] = []

  if (u) {
    stats.push(statChip('HP', e.hp < e.maxHp ? `${Math.ceil(e.hp)}/${e.maxHp}` : String(e.maxHp)))
    if (u.dmg > 0) stats.push(statChip('DMG', String(u.dmg)))
    if (u.range > 40) stats.push(statChip('RANGE', String(u.range)))
    stats.push(statChip('SPEED', String(u.speed)))
    stats.push(...costChips(u.cost).split('</span>').filter(Boolean).map(x => x + '</span>'))
    stats.push(statChip('TRAINS IN', `${u.time}s`))
  } else if (b) {
    stats.push(statChip('HP', e.hp < e.maxHp ? `${Math.ceil(e.hp)}/${e.maxHp}` : String(e.maxHp)))
    stats.push(...costChips(b.cost).split('</span>').filter(Boolean).map(x => x + '</span>'))
    stats.push(statChip('BUILDS IN', `${b.time}s`))
    if (b.pop > 0) stats.push(statChip('POP', `+${b.pop}`))
    if (b.garrisonCap > 0) stats.push(statChip('SHELTERS', String(b.garrisonCap)))
  } else if (r) {
    stats.push(statChip('LEFT', String(Math.ceil(e.amount ?? 0))))
    stats.push(statChip('GIVES', r.gives))
    if (e.kind === 'croc' && e.hp > 0) stats.push(statChip('HP', `${Math.ceil(e.hp)}/${e.maxHp}`))
  }

  const ageReq = u ? unitAgeReq(g, 0, e.kind) : (b?.age ?? 1)
  // (a starting Town Hall is older than the age its rebuild needs — say so plainly)
  if (ageReq > 1 && !lm) lines.push(b ? `Can be built from the <b>${AGE_NAMES[ageReq]}</b>.` : `Available from the <b>${AGE_NAMES[ageReq]}</b>.`)

  // what this building puts to work, and the upgrades kept behind its door
  const trains = INFO_TRAINS[e.kind]
  if (trains?.length) lines.push(`Trains: ${trains.map(k => UNITS[k].name).join(', ')}.`)
  const techs = (Object.keys(TECHS) as TechId[]).filter(id => TECHS[id].at === e.kind)
  if (techs.length) lines.push(`Researches: ${techs.map(id => TECHS[id].name).join(', ')}.`)
  const champ = (Object.keys(CHAMPS) as ChampId[]).find(id => CHAMPS[id].at.includes(e.kind))
  if (champ) lines.push(`Swears in <b>${CHAMPS[champ].name}</b>: ${CHAMPS[champ].blurb.toLowerCase()}.`)
  const trickle = LANDMARK_TRICKLES[e.kind as LandmarkKind]
  if (trickle) lines.push(`Trickles ${trickle.rate} ${trickle.res} a second, all on its own.`)

  // and what it is doing right now
  if (b && e.complete === false) lines.push(`<b>Rising now</b> — ${Math.round((e.progress ?? 0) * 100)}% built.`)
  if (e.queue?.length) {
    const q = e.queue[0]
    lines.push(`<b>Now training:</b> ${UNITS[q.kind]?.name ?? q.kind}${e.queue.length > 1 ? ` (${e.queue.length} queued)` : ''}.`)
  }
  if (e.research) {
    const id = e.research.id
    const rn = (CHAMPS as Record<string, { name: string }>)[id]?.name ?? (TECHS as Record<string, { name: string }>)[id]?.name ?? id
    lines.push(`<b>Now researching:</b> ${rn}.`)
  }
  if ((e.garrison ?? 0) > 0) lines.push(`<b>${e.garrison}</b> sheltering inside.`)
  if (e.team === 0 && canBanner(e)) {
    lines.push(e.banner !== undefined
      ? `Rides under <b>${BANNERS[e.banner].name}</b>.`
      : 'Sworn to no beast — a monk answers no company\u2019s muster.')
  }
  if (e.team === 0 && HALL_KINDS.includes(e.kind)) {
    const rb = e.recruitBanner ?? LION_BANNER
    lines.push(`Recruits ride under <b>${BANNERS[rb].name}</b>.`)
    lines.push(g.muster[rb]
      ? `They march to <b>${BANNERS[rb].name}\u2019s muster flag</b> once raised.`
      : 'They gather at the door — plant a muster flag to send them elsewhere.')
  }
  if (e.kind === 'relic') {
    if (e.shrineId !== undefined) lines.push(`<b>Enshrined</b> — tithing ${RELIC_GOLD_RATE} gold a second.`)
    else if (e.heldBy !== undefined) lines.push('<b>In a monk\u2019s arms</b> — carry it to a church or ministry.')
    else lines.push('Unclaimed. Send a monk before the rival village does.')
  }
  if (isSiege(e) && e.kind === 'trebuchet') {
    lines.push((e.setup ?? 0) >= 3 ? '<b>Planted</b> and ready to loose.' : 'Not yet planted — hold it still to set the frame.')
  }

  const blurb = lm ? `${lm.blurb}. Raising it IS the age-up: the ${AGE_NAMES[lm.toAge]} dawns when its walls stand.`
    : INFO_BLURB[e.kind] ?? ''
  // a canvas loses its pixels through outerHTML — bake the miniature to an image
  const icon = spriteIcon(e.kind, g.age[e.team] ?? 2)
  return `<div class="ic-head"><img class="ic-icon" alt="" src="${icon.toDataURL()}"><h3>${name}${tag ? `<div class="ic-tag">${tag}</div>` : ''}</h3>` +
    `<button class="ic-close" id="info-close" aria-label="Close">\u2715</button></div>` +
    (blurb ? `<p>${blurb}</p>` : '') +
    (stats.length ? `<div class="ic-stats">${stats.join('')}</div>` : '') +
    (lines.length ? `<p>${lines.join(' ')}</p>` : '')
}

// paint (or hide) the card; also keeps the two HUD tool buttons honest
let infoSig = ''
function syncInfoTools(g: Game): void {
  const card = el('info-card')
  const target = g.infoMode && g.infoId !== null ? g.byId.get(g.infoId) : undefined
  const sig = !g.infoMode ? 'off' : target
    ? `${target.id}:${Math.ceil(target.hp)}:${target.queue?.length ?? 0}:${target.research?.id ?? ''}:${target.garrison ?? 0}:${Math.round((target.progress ?? 1) * 20)}:${(target.setup ?? 0) >= 3}`
    : 'none'
  if (sig !== infoSig) {
    infoSig = sig
    if (!target) {
      card.classList.add('hidden')
      card.innerHTML = ''
    } else {
      card.innerHTML = buildInfoCard(g, target)
      card.classList.remove('hidden')
      const x = document.getElementById('info-close')
      if (x) x.addEventListener('click', () => { g.infoId = null; g.uiDirty = true })
    }
  }
  el('p-info').classList.toggle('on', g.infoMode)
  el('p-info').setAttribute('aria-pressed', String(g.infoMode))
  el('p-clear').classList.toggle('dim', g.selection.length === 0)
}

// the companies raised, above the roster. The Lion keeps the shield —
// these are the companies you have split off from it.
function syncBannerStrip(g: Game): void {
  const strip = el('banner-strip')
  strip.innerHTML = ''
  strip.classList.toggle('hidden', g.banners <= 1)
  for (let i = 0; i < g.banners; i++) {
    const n = g.ents.reduce((c, e) =>
      c + (e.team === 0 && !e.hidden && e.banner === i ? 1 : 0), 0)
    const b = document.createElement('button')
    b.className = 'banner-chip' + (g.activeBanner === i ? ' active' : '') + (n === 0 ? ' empty' : '')
    b.dataset.cmd = `banner-select-${i}`
    b.setAttribute('aria-label', `Muster ${BANNERS[i].name}`)
    b.innerHTML = bannerIcon(i, 34) + `<span class="count">${n}</span>`
    b.addEventListener('click', () => selectBanner(g, i))
    strip.appendChild(b)
  }
  // the shield is "everyone in the company I'm looking at" — so it wears that
  // company's colours and answers for it
  const all = el('army-all')
  all.innerHTML = armyShield(g.activeBanner)
  all.setAttribute('aria-label', `Muster all of ${BANNERS[g.activeBanner].name}`)
}

export function syncUI(g: Game): void {
  // The HUD belongs to a game in progress. Reading it off g.started here means
  // every way in — the menu, a replay, the test hook — gets it right.
  document.body.classList.toggle('playing', g.started)
  const p = pop(g, 0)
  el('wood-n').textContent = String(Math.floor(g.res[0].wood))
  el('food-n').textContent = String(Math.floor(g.res[0].food))
  el('gold-n').textContent = String(Math.floor(g.res[0].gold))
  el('stone-n').textContent = String(Math.floor(g.res[0].stone))
  el('pop-n').textContent = `${p.used}/${p.cap}`
  // little crew counts under each number: who's working what, who's loafing
  const crew: Record<ResKind, number> = { wood: 0, food: 0, gold: 0, stone: 0 }
  let idleVills = 0
  for (const e of g.ents) {
    if (e.team !== 0 || e.kind !== 'villager' || e.hidden) continue
    if (e.state === 'idle') { idleVills++; continue }
    const r = gatherResOf(g, e)
    if (r) crew[r]++
  }
  for (const r of ['wood', 'food', 'gold', 'stone'] as ResKind[]) {
    const n = String(crew[r])
    const elV = el(`${r}-v`)
    if (elV.textContent !== n) elV.textContent = n
  }
  const idleStr = String(idleVills)
  if (el('idle-n').textContent !== idleStr) el('idle-n').textContent = idleStr
  el('s-pop').classList.toggle('alert', idleVills > 0)
  syncArmyPanel(g)
  syncProdPanel(g)
  syncInfoTools(g)
  drawMinimap(g)
  updateAffordability(g)

  // wall placement: the ✓ shows a live post count and total price as you drag
  if (g.placing === 'wall' && g.placePos && g.placeEnd) {
    const btn = document.querySelector<HTMLButtonElement>('#dock-buttons [data-cmd="confirm"]')
    if (btn) {
      const n = wallLinePoints(g).filter(p => p.ok).length
      const total = Math.max(1, n) * BUILDINGS.wall.cost.wood
      btn.dataset.wood = String(total)
      const badge = btn.querySelector('.badge')
      if (badge && badge.textContent !== `×${n}`) badge.textContent = `×${n}`
      const costEl = btn.querySelector('i')
      const want = `${total}${ICON.wood}`
      if (costEl && costEl.dataset.was !== want) { costEl.innerHTML = want; costEl.dataset.was = want }
    }
  }

  if (!g.uiDirty) return
  g.uiDirty = false

  // toasts
  el('toasts').innerHTML = g.toasts.map(t => `<div class="toast">${t.text}</div>`).join('')

  // end-of-game overlays
  if (g.over === 'win') {
    el('end-title').textContent = playerName ? `Victory, ${playerName}!` : 'Victory!'
    el('end-text').textContent = 'The enemy town hall has crumbled. Peace returns to the meadow.'
    el('end-overlay').classList.remove('hidden')
  } else if (g.over === 'lose') {
    el('end-title').textContent = 'Defeat…'
    el('end-text').textContent = playerName
      ? `Your town hall has fallen. The meadow will remember your stand, ${playerName}.`
      : 'Your town hall has fallen. The meadow will remember your stand.'
    el('end-overlay').classList.remove('hidden')
  }

  // dock: a row of icon commands for the current selection
  const dock = el('dock-buttons')
  dock.innerHTML = ''
  const sel = selectedEnts(g)
  const first = sel[0]
  const sameKind = sel.length > 0 && sel.every(e => e.kind === first.kind)
  const selKey = g.selection.join(',')
  if (selKey !== lastSelKey) {
    lastSelKey = selKey
    buildCat = null; agePick = false; bannerPick = false
    g.mustering = null // don't leave a half-set muster flag hanging over a new selection
  }

  const HALLS = ['barracks', 'kingsbarracks', 'archeryrange', 'stable', 'cavalryschool', 'siegeworkshop']
  if (bannerPick && first && HALLS.includes(first.kind) && first.team === 0 && first.complete) {
    recruitBannerDock(g, dock, first) // the picker takes the whole dock to itself
  } else if (g.placing) {
    const cross = document.createElement('button')
    cross.className = 'cmd ghost'
    cross.dataset.cmd = 'cancel-place'
    cross.setAttribute('aria-label', 'Cancel placement')
    cross.textContent = '✕'
    cross.addEventListener('click', () => { g.placing = null; g.placePos = null; g.placeEnd = null; g.uiDirty = true })
    dock.appendChild(cross)
    const b = BUILDINGS[g.placing]
    const tick = iconButton(
      { cmd: 'confirm', label: `Place ${b.name}`, icon: `<span class="tick">✓</span>`, cost: b.cost,
        badge: g.placing === 'wall' ? '×1' : undefined },
      () => {
        if (g.placePos) tryPlaceBuilding(g, g.placing!, g.placePos.x, g.placePos.y)
      })
    dock.appendChild(tick)
  } else if (first && first.kind === 'towncenter' && first.complete) {
    const rising = landmarkSite(g)
    if (agePick && g.age[0] < 3 && !rising) {
      // choose your landmark — the eco road or the military road into the next age
      const back = document.createElement('button')
      back.className = 'cmd ghost'
      back.dataset.cmd = 'back'
      back.setAttribute('aria-label', 'Back')
      back.textContent = '‹'
      back.addEventListener('click', () => { agePick = false; g.uiDirty = true })
      dock.appendChild(back)
      const nextAge = g.age[0] + 1
      const choices = (Object.keys(LANDMARKS) as LandmarkKind[])
        .filter(k => LANDMARKS[k].toAge === nextAge && LANDMARKS[k].civ === g.civs[0])
      for (const kind of choices) {
        const spec = BUILDINGS[kind]
        const lm = LANDMARKS[kind]
        dock.appendChild(iconButton(
          { cmd: `build-${kind}`, label: `${spec.name} (${lm.path}) — ${lm.blurb}`, icon: spriteIcon(kind), cost: spec.cost },
          () => {
            agePick = false
            g.placing = kind
            g.placePos = snapPlace(g.camera.x, g.camera.y, kind) // ghost starts under your thumb
            g.placeEnd = null
            g.uiDirty = true
          }))
      }
    } else {
      dock.appendChild(iconButton(
        { cmd: 'train-villager', label: 'Train villager', icon: spriteIcon('villager'), cost: UNITS.villager.cost },
        () => tryTrain(g, first, 'villager')))
      if (!rising && g.age[0] < 3) {
        dock.appendChild(iconButton(
          { cmd: 'age-up', label: `Advance to the ${AGE_NAMES[g.age[0] + 1]} — raise a landmark`, icon: ICON.laurel },
          () => { agePick = true; g.uiDirty = true }))
      }
      const garrison = first.garrison ?? 0
      if (garrison > 0) {
        dock.appendChild(iconButton(
          { cmd: 'doors', label: 'Open the doors — back to work!', icon: ICON.bell, badge: `×${garrison}` },
          () => openDoors(g, first)))
      } else {
        dock.appendChild(iconButton(
          { cmd: 'bell', label: 'Ring the bell — shelter villagers', icon: ICON.bell },
          () => ringBell(g, first)))
      }
      }
  } else if (first && (first.kind === 'lumbercamp' || first.kind === 'miningcamp' || first.kind === 'mill' ||
    first.kind === 'ministry') && first.complete && first.team === 0) {
    researchDock(g, dock, first)
  } else if (first && first.kind === 'church' && first.complete && first.team === 0) {
    dock.appendChild(iconButton(
      { cmd: 'train-monk', label: 'Ordain a monk — he heals the hurt and carries relics home',
        icon: spriteIcon('monk'), cost: UNITS.monk.cost, locked: g.age[0] < unitAgeReq(g, 0, 'monk') },
      () => tryTrain(g, first, 'monk')))
  } else if (first && first.kind === 'cavalryschool' && first.complete && first.team === 0) {
    dock.appendChild(iconButton(
      { cmd: 'train-scout', label: 'Train scout', icon: spriteIcon('scout'), cost: UNITS.scout.cost },
      () => tryTrain(g, first, 'scout')))
    dock.appendChild(iconButton(
      { cmd: 'train-knight', label: "Muster knight — a chevalier's discount", icon: spriteIcon('knight'),
        cost: SCHOOL_KNIGHT_COST, locked: g.age[0] < unitAgeReq(g, 0, 'knight') },
      () => tryTrain(g, first, 'knight')))
    champDock(g, dock, first)
    recruitBannerDock(g, dock, first)
    musterDock(g, dock, first)
  } else if (first && (first.kind === 'watchtower' || first.kind === 'whitekeep' || first.kind === 'redpalace') && first.complete && first.team === 0 && (first.garrison ?? 0) > 0) {
    dock.appendChild(iconButton(
      { cmd: 'doors', label: 'Open the doors', icon: ICON.bell, badge: `×${first.garrison}` },
      () => openDoors(g, first)))
  } else if (first && (first.kind === 'barracks' || first.kind === 'kingsbarracks') && first.complete && first.team === 0) {
    const levy = first.kind === 'kingsbarracks'
    dock.appendChild(iconButton(
      { cmd: 'train-spearman', label: levy ? 'Muster levy spearman' : 'Train spearman',
        icon: spriteIcon('spearman'), cost: levy ? LEVY_SPEAR_COST : UNITS.spearman.cost },
      () => tryTrain(g, first, 'spearman')))
    dock.appendChild(iconButton(
      { cmd: 'train-swordsman', label: 'Train swordsman', icon: spriteIcon('swordsman'),
        cost: UNITS.swordsman.cost, locked: g.age[0] < (UNITS.swordsman.age ?? 1) },
      () => tryTrain(g, first, 'swordsman')))
    champDock(g, dock, first)
    recruitBannerDock(g, dock, first)
    musterDock(g, dock, first)
  } else if (first && first.kind === 'siegeworkshop' && first.complete && first.team === 0) {
    dock.appendChild(iconButton(
      { cmd: 'train-mangonel', label: 'Build mangonel — lobs a splash boulder at clumps',
        icon: spriteIcon('mangonel'), cost: UNITS.mangonel.cost },
      () => tryTrain(g, first, 'mangonel')))
    dock.appendChild(iconButton(
      { cmd: 'train-trebuchet', label: 'Build trebuchet — outranges every fortress, once planted',
        icon: spriteIcon('trebuchet'), cost: UNITS.trebuchet.cost },
      () => tryTrain(g, first, 'trebuchet')))
    recruitBannerDock(g, dock, first)
    musterDock(g, dock, first)
  } else if (first && first.kind === 'archeryrange' && first.complete && first.team === 0) {
    dock.appendChild(iconButton(
      { cmd: 'train-archer', label: 'Train longbowman', icon: spriteIcon('archer'), cost: UNITS.archer.cost },
      () => tryTrain(g, first, 'archer')))
    champDock(g, dock, first)
    recruitBannerDock(g, dock, first)
    musterDock(g, dock, first)
  } else if (first && first.kind === 'stable' && first.complete && first.team === 0) {
    dock.appendChild(iconButton(
      { cmd: 'train-scout', label: 'Train scout', icon: spriteIcon('scout'), cost: UNITS.scout.cost },
      () => tryTrain(g, first, 'scout')))
    dock.appendChild(iconButton(
      { cmd: 'train-knight', label: `Train knight (${AGE_NAMES[unitAgeReq(g, 0, 'knight')]})`, icon: spriteIcon('knight'),
        cost: UNITS.knight.cost, locked: g.age[0] < unitAgeReq(g, 0, 'knight') },
      () => tryTrain(g, first, 'knight')))
    champDock(g, dock, first)
    recruitBannerDock(g, dock, first)
    musterDock(g, dock, first)
  } else if (sameKind && first.kind === 'villager') {
    if (buildCat === null) {
      // two clear doors: what kind of building?
      dock.appendChild(iconButton(
        { cmd: 'cat-economy', label: 'Economy buildings', icon: ICON.economy },
        () => { buildCat = 'economy'; g.uiDirty = true }))
      dock.appendChild(iconButton(
        { cmd: 'cat-military', label: 'Military buildings', icon: ICON.military },
        () => { buildCat = 'military'; g.uiDirty = true }))
      dock.querySelector('[data-cmd="cat-economy"]')!.insertAdjacentHTML('beforeend', '<i>Economy</i>')
      dock.querySelector('[data-cmd="cat-military"]')!.insertAdjacentHTML('beforeend', '<i>Military</i>')
    } else {
      const back = document.createElement('button')
      back.className = 'cmd ghost'
      back.dataset.cmd = 'back'
      back.setAttribute('aria-label', 'Back')
      back.textContent = '‹'
      back.addEventListener('click', () => { buildCat = null; g.uiDirty = true })
      dock.appendChild(back)
      const lists: Record<'economy' | 'military', Buildable[]> = {
        economy: ['house', 'farm', 'mill', 'lumbercamp', 'miningcamp', 'towncenter', 'church', 'ministry'],
        military: ['barracks', 'archeryrange', 'stable', 'siegeworkshop', 'watchtower', 'wall', 'gate'],
      }
      // symbolic icons where a miniature would be muddy
      const symbolIcons: Partial<Record<Buildable, string>> = {
        barracks: ICON.swordspear,
        archeryrange: ICON.target,
      }
      for (const kind of lists[buildCat]) {
        const b = BUILDINGS[kind]
        const locked = g.age[0] < (b.age ?? 1)
        dock.appendChild(iconButton(
          { cmd: `build-${kind}`, label: `Build ${b.name}`, icon: symbolIcons[kind] ?? spriteIcon(kind, g.age[0]), cost: b.cost, locked },
          () => {
            if (g.age[0] < (b.age ?? 1)) { toast(g, `Reach the ${AGE_NAMES[b.age ?? 1]} first!`); return }
            g.placing = kind
            const fit = kind === 'gate' ? gateSnap(g, g.camera.x, g.camera.y) : null
            g.placeAngle = fit ? fit.angle : 0
            g.placePos = fit ? { x: fit.x, y: fit.y } : snapPlace(g.camera.x, g.camera.y, kind)
            g.placeEnd = kind === 'wall'
              ? snapPlace(g.camera.x + 96, g.camera.y) // a fence starts as a short run; drag the ends
              : null
            g.uiDirty = true
          }))
      }
    }
  } else if (sel.some(e => canBanner(e) && e.team === 0)) {
    formationDock(g, dock, sel)
  }

  el('dock').classList.toggle('hidden', dock.children.length === 0)
  updateAffordability(g)
}
