import type {
  Database, FieldingRaw, Hand, HittingRaw, LeagueRates, PitchingRaw,
  Player, PlayerRaw, Pos, Team, TeamRaw,
} from "./types";

const POSITIONS: Pos[] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "P"];

function hand(v: string): Hand {
  const c = (v || "R").toUpperCase();
  if (c === "L" || c === "S") return c;
  return "R";
}

function normPos(p: string): Pos {
  const u = (p || "DH").toUpperCase();
  if (u === "TWP") return "P";
  if (u === "OF") return "LF";
  if (u === "IF" || u === "MI" || u === "UT" || u === "PH" || u === "PR") return "DH";
  if ((POSITIONS as string[]).includes(u)) return u as Pos;
  return "DH";
}

export function shortName(name: string, last: string): string {
  const first = name.trim().split(/\s+/)[0] || "";
  const ini = first.charAt(0) || last.charAt(0);
  const ln = last.length > 10 ? last.slice(0, 10) : last;
  return `${ini}.${ln}`;
}

function replHit(): HittingRaw {
  return {
    g: 20, pa: 50, ab: 45, r: 4, h: 10, d: 2, t: 0, hr: 1, rbi: 4,
    bb: 4, ibb: 0, so: 14, hbp: 0, sb: 0, cs: 0, sf: 0, sac: 0, gidp: 1,
    go: 12, ao: 12, avg: 0.222, obp: 0.28, slg: 0.333, ops: 0.613,
  };
}

function replPit(starter: boolean): PitchingRaw {
  const outs = starter ? 90 : 40;
  const bf = starter ? 130 : 56;
  return {
    g: starter ? 6 : 18, gs: starter ? 6 : 0, gf: starter ? 0 : 6,
    w: 1, l: 2, sv: 0, hld: 0, ip: starter ? "30.0" : "13.1", outs,
    h: starter ? 32 : 14, r: 18, er: 16, hr: 5, bb: 12, ibb: 0, so: 24,
    hbp: 1, wp: 1, bf, go: 30, ao: 28, era: 4.8, whip: 1.4,
  };
}

function fieldSkill(fld: FieldingRaw[], pos: Pos): number {
  const all = fld.filter((f) => f.ch > 0);
  if (!all.length) return pos === "DH" ? 0.4 : 0.55;
  const pref = all.find((f) => f.pos === pos) || all[0];
  const fp = pref.fp > 1 ? pref.fp / 1000 : pref.fp;
  // map .960-.995 into 0.35-0.95
  return Math.max(0.2, Math.min(0.98, (fp - 0.94) / 0.06));
}

function catcherArm(fld: FieldingRaw[]): number {
  const c = fld.find((f) => f.pos === "C" && f.sb + f.cs > 0);
  if (!c) return 0.28;
  return Math.max(0.08, Math.min(0.55, c.cs / (c.sb + c.cs)));
}

function speedOf(h: HittingRaw): number {
  const pa = Math.max(1, h.pa);
  const attempt = h.sb + h.cs;
  const rate = attempt / pa;
  const succ = attempt ? h.sb / attempt : 0.7;
  const triple = h.t / pa;
  return Math.max(0.05, Math.min(0.98, rate * 8 + succ * 0.25 + triple * 18));
}

function armOf(p: PlayerRaw, pos: Pos): number {
  if (pos === "C") return 0.7;
  if (pos === "RF" || pos === "CF") return 0.65;
  if (pos === "SS" || pos === "3B") return 0.6;
  return 0.5;
}

export function hydratePlayer(raw: PlayerRaw): Player {
  const pos = normPos(raw.pos);
  const hasPit = !!(raw.pitching && (raw.pitching.bf > 0 || raw.pitching.g > 0));
  const hasHit = !!(raw.hitting && (raw.hitting.pa > 0 || raw.hitting.g > 0));
  const isPitcher = pos === "P" || (hasPit && !hasHit);
  const twoWay = hasPit && hasHit && (raw.pos === "TWP" || (raw.pitching!.gs >= 3 && raw.hitting!.pa >= 40));
  const hit = raw.hitting && raw.hitting.pa > 0 ? raw.hitting : replHit();
  const pit = raw.pitching && raw.pitching.bf > 0 ? raw.pitching : replPit(false);
  return {
    id: raw.id,
    name: raw.name,
    last: raw.last,
    short: shortName(raw.name, raw.last),
    bats: hand(raw.bats),
    throws: hand(raw.throws),
    pos,
    jersey: raw.jersey,
    isPitcher: isPitcher && !twoWay,
    twoWay,
    hit,
    pit,
    fld: raw.fielding || [],
    speed: speedOf(hit),
    arm: armOf(raw, pos),
    field: fieldSkill(raw.fielding || [], pos),
    catcherArm: catcherArm(raw.fielding || []),
  };
}

const PARK: Record<string, number> = {
  COL: 1.22, CIN: 1.12, NYY: 1.08, BOS: 1.06, PHI: 1.06, LAD: 1.04,
  CHC: 1.03, HOU: 1.02, ATL: 1.02, MIL: 1.01, TOR: 1.01, WSH: 1.04,
  BAL: 1.03, CWS: 1.02, TEX: 1.01, MIN: 1.0, DET: 0.99, KC: 0.98,
  CLE: 0.97, LAA: 0.99, ATH: 0.97, SEA: 0.93, SD: 0.94, SF: 0.9,
  MIA: 0.95, PIT: 0.96, STL: 0.98, AZ: 1.02, NYM: 0.97, TB: 0.95,
};

export function hydrateTeam(raw: TeamRaw): Team {
  return {
    id: raw.id,
    name: raw.name,
    loc: raw.loc,
    nick: raw.nick,
    abbr: raw.abbr,
    league: raw.league,
    division: raw.division,
    venue: raw.venue,
    city: raw.city,
    park: PARK[raw.abbr] ?? 1,
    players: raw.players.map(hydratePlayer),
  };
}

export function leagueRates(db: Database): LeagueRates {
  const h = db.league.hitting;
  const pa = Math.max(1, h.pa || 1);
  const ab = Math.max(1, h.ab || 1);
  const inPlay = Math.max(1, ab - (h.so || 0) - (h.hr || 0) + (h.sf || 0));
  const singles = Math.max(0, (h.h || 0) - (h.d || 0) - (h.t || 0) - (h.hr || 0));
  return {
    k: (h.so || 0) / pa,
    bb: (h.bb || 0) / pa,
    hbp: (h.hbp || 0) / pa,
    hr: (h.hr || 0) / pa,
    h: (h.h || 0) / ab,
    d: (h.d || 0) / pa,
    t: (h.t || 0) / pa,
    single: singles / pa,
    babip: Math.max(0.2, ((h.h || 0) - (h.hr || 0)) / inPlay),
    go: (h.go || 1) / Math.max(1, (h.go || 0) + (h.ao || 0)),
    sb: (h.sb || 0) / pa,
    cs: (h.cs || 0) / pa,
    avg: (h.h || 0) / ab,
    obp: ((h.h || 0) + (h.bb || 0) + (h.hbp || 0)) / pa,
  };
}

export function loadTeams(db: Database): Team[] {
  return db.teams.map(hydrateTeam);
}
