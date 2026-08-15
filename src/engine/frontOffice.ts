import { hydratePlayer, shortName } from "./roster";
import type { Hand, HittingRaw, PitchingRaw, Player, Pos, Team } from "./types";

const KEY = "mlm2026-rosters";
let nextCustomId = 9_000_000;

export function touchCustomId(teams: Team[]) {
  for (const t of teams) {
    for (const p of t.players) {
      if (p.id >= nextCustomId) nextCustomId = p.id + 1;
    }
  }
}

export function saveRosters(teams: Team[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(teams));
  } catch { /* quota */ }
}

export function loadRosters(): Team[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const teams = JSON.parse(raw) as Team[];
    if (!Array.isArray(teams) || teams.length < 30) return null;
    touchCustomId(teams);
    return teams;
  } catch {
    return null;
  }
}

export function clearRosters() {
  localStorage.removeItem(KEY);
}

export function findTeam(teams: Team[], abbr: string): Team | undefined {
  return teams.find((t) => t.abbr === abbr);
}

export function teamOf(teams: Team[], id: number): Team | undefined {
  return teams.find((t) => t.players.some((p) => p.id === id));
}

export function trade(teams: Team[], aId: number, bId: number | null): string {
  const ta = teamOf(teams, aId);
  if (!ta) return "Could not find that player.";
  const ia = ta.players.findIndex((p) => p.id === aId);
  const pa = ta.players[ia];
  if (bId == null) {
    return `${pa.name} is already on ${ta.abbr}.`;
  }
  const tb = teamOf(teams, bId);
  if (!tb) return "Could not find the other player.";
  if (ta === tb) return "Same club — no trade.";
  const ib = tb.players.findIndex((p) => p.id === bId);
  const pb = tb.players[ib];
  ta.players[ia] = pb;
  tb.players[ib] = pa;
  saveRosters(teams);
  return `TRADE: ${pa.short} (${ta.abbr})  for  ${pb.short} (${tb.abbr})`;
}

export function movePlayer(teams: Team[], playerId: number, toAbbr: string): string {
  const from = teamOf(teams, playerId);
  const to = findTeam(teams, toAbbr);
  if (!from || !to) return "Team not found.";
  if (from === to) return `${from.abbr} already has him.`;
  const i = from.players.findIndex((p) => p.id === playerId);
  const [p] = from.players.splice(i, 1);
  to.players.push(p);
  saveRosters(teams);
  return `${p.name} claimed by ${to.abbr} (from ${from.abbr}).`;
}

export function deletePlayer(teams: Team[], playerId: number): string {
  const t = teamOf(teams, playerId);
  if (!t) return "Player not found.";
  const i = t.players.findIndex((p) => p.id === playerId);
  const [p] = t.players.splice(i, 1);
  saveRosters(teams);
  return `${p.name} released by ${t.abbr}.`;
}

export interface CreateSpec {
  name: string;
  pos: Pos;
  bats: Hand;
  throws: Hand;
  jersey?: string;
  avg?: number;
  hr?: number;
  rbi?: number;
  sb?: number;
  bb?: number;
  so?: number;
  era?: number;
  w?: number;
  l?: number;
  sv?: number;
  gs?: number;
  k9?: number;
  bb9?: number;
}

function hitFromSpec(s: CreateSpec): HittingRaw {
  const ab = 420;
  const avg = Math.max(0.12, Math.min(0.4, s.avg ?? 0.255));
  const h = Math.round(avg * ab);
  const hr = Math.max(0, Math.min(70, Math.round(s.hr ?? 14)));
  const d = Math.max(4, Math.round(h * 0.2));
  const t = Math.max(0, Math.round((s.sb ?? 6) / 12));
  const singles = Math.max(0, h - d - t - hr);
  const realH = singles + d + t + hr;
  const bb = Math.round(s.bb ?? 38);
  const so = Math.round(s.so ?? 95);
  const hbp = 4;
  const sf = 3;
  const pa = ab + bb + hbp + sf;
  const tb = singles + 2 * d + 3 * t + 4 * hr;
  const rbi = Math.round(s.rbi ?? hr * 2.4 + 20);
  const sb = Math.round(s.sb ?? 6);
  return {
    g: 120, pa, ab, r: Math.round(rbi * 0.85), h: realH, d, t, hr, rbi,
    bb, ibb: 2, so, hbp, sb, cs: Math.max(1, Math.round(sb * 0.25)),
    sf, sac: 1, gidp: 8, go: 80, ao: 80,
    avg, obp: (realH + bb + hbp) / pa, slg: tb / ab, ops: 0,
  };
}

function pitFromSpec(s: CreateSpec): PitchingRaw {
  const starter = (s.gs ?? 0) > 0 || s.pos === "P" && (s.sv ?? 0) < 5;
  const ipOuts = starter ? 330 : 135;
  const ip = starter ? 110 : 45;
  const era = Math.max(0.5, Math.min(8, s.era ?? 3.9));
  const er = Math.round((era * ip) / 9);
  const k9 = s.k9 ?? 8.6;
  const bb9 = s.bb9 ?? 3.1;
  const so = Math.round((k9 * ip) / 9);
  const bb = Math.round((bb9 * ip) / 9);
  const hr = Math.round((1.15 * ip) / 9);
  const h = Math.round((8.4 * ip) / 9);
  const bf = Math.round(ip * 4.15);
  return {
    g: starter ? 22 : 40, gs: s.gs ?? (starter ? 22 : 0), gf: starter ? 0 : 20,
    w: s.w ?? (starter ? 9 : 3), l: s.l ?? (starter ? 8 : 3),
    sv: s.sv ?? 0, hld: starter ? 0 : 8,
    ip: starter ? "110.0" : "45.0", outs: ipOuts,
    h, r: er + 4, er, hr, bb, ibb: 1, so, hbp: 3, wp: 4, bf,
    go: 90, ao: 80, era, whip: (h + bb) / ip,
  };
}

export function createPlayer(spec: CreateSpec): Player {
  const parts = spec.name.trim().split(/\s+/);
  const last = parts.slice(-1)[0] || "Rookie";
  const first = parts[0] || "A";
  const pos = spec.pos;
  const hitting = hitFromSpec(spec);
  hitting.ops = hitting.obp + hitting.slg;
  const pitching = pitFromSpec(spec);
  const raw = {
    id: nextCustomId++,
    name: spec.name.trim() || "Rookie Ballplayer",
    last,
    first,
    bats: spec.bats,
    throws: spec.throws,
    pos,
    jersey: spec.jersey || String(Math.floor(Math.random() * 70) + 1),
    hitting,
    pitching,
    fielding: [{
      pos, g: 80, gs: 70, po: 100, a: 40, e: 4, ch: 144, fp: 0.972,
      inn: 600, cs: pos === "C" ? 18 : 0, sb: pos === "C" ? 40 : 0, pb: 0,
    }],
  };
  const p = hydratePlayer(raw);
  p.isPitcher = pos === "P";
  p.twoWay = pos === "P" && (spec.avg ?? 0) >= 0.22 && (spec.hr ?? 0) >= 8;
  if (p.twoWay) p.isPitcher = false;
  p.short = shortName(p.name, p.last);
  return p;
}

export function addPlayer(teams: Team[], abbr: string, player: Player): string {
  const t = findTeam(teams, abbr);
  if (!t) return "Team not found.";
  t.players.push(player);
  saveRosters(teams);
  return `${player.name} signed by ${t.abbr}.`;
}

export function applyEdits(player: Player, spec: CreateSpec) {
  const parts = spec.name.trim().split(/\s+/);
  player.name = spec.name.trim() || player.name;
  player.last = parts.slice(-1)[0] || player.last;
  player.short = shortName(player.name, player.last);
  player.pos = spec.pos;
  player.bats = spec.bats;
  player.throws = spec.throws;
  player.hit = hitFromSpec(spec);
  player.hit.ops = player.hit.obp + player.hit.slg;
  player.pit = pitFromSpec(spec);
  player.isPitcher = spec.pos === "P" && !((spec.avg ?? 0) >= 0.22 && (spec.hr ?? 0) >= 8);
  player.twoWay = spec.pos === "P" && (spec.avg ?? 0) >= 0.22;
}

export const TEMPLATES: { name: string; spec: Partial<CreateSpec> }[] = [
  { name: "Contact", spec: { avg: 0.305, hr: 8, rbi: 55, sb: 12, bb: 48, so: 62 } },
  { name: "Slugger", spec: { avg: 0.248, hr: 36, rbi: 98, sb: 3, bb: 72, so: 155 } },
  { name: "Speed", spec: { avg: 0.278, hr: 6, rbi: 42, sb: 42, bb: 50, so: 88 } },
  { name: "Ace", spec: { pos: "P", era: 2.75, w: 14, l: 6, gs: 24, k9: 10.4, bb9: 2.2, sv: 0 } },
  { name: "Closer", spec: { pos: "P", era: 2.35, w: 3, l: 2, gs: 0, sv: 28, k9: 11.2, bb9: 2.8 } },
  { name: "Replacement", spec: { avg: 0.218, hr: 6, rbi: 28, sb: 2, bb: 22, so: 110, era: 5.1 } },
];
