import { hydrateTeam, leagueRates } from "./roster";
import { saveRosters } from "./frontOffice";
import type { Database, HittingRaw, LeagueRates, Player, PlayerRaw, Team, TeamRaw } from "./types";

const META_KEY = "mlm2026-stats-meta";
const OFFICIAL_KEY = "mlm2026-official-live";
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SEASON = 2026;
const CUSTOM_ID = 9_000_000;

export interface StatsMeta {
  fetched: string;
  source: string;
  players: number;
}

export function loadStatsMeta(bundledFetched: string): StatsMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const m = JSON.parse(raw) as StatsMeta;
      if (m.fetched) return m;
    }
  } catch { /* ignore */ }
  return { fetched: bundledFetched, source: "bundled snapshot", players: 0 };
}

export function saveStatsMeta(m: StatsMeta) {
  localStorage.setItem(META_KEY, JSON.stringify(m));
}

const ATTEMPT_KEY = "mlm2026-stats-attempt";

export function statsAreStale(meta: StatsMeta): boolean {
  if (!meta.source || meta.source === "bundled snapshot") return true;
  const t = Date.parse(meta.fetched);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t >= WEEK_MS;
}

export function recentFailedAttempt(): boolean {
  try {
    const t = Date.parse(localStorage.getItem(ATTEMPT_KEY) || "");
    return Number.isFinite(t) && Date.now() - t < 6 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function markAttempt() {
  localStorage.setItem(ATTEMPT_KEY, new Date().toISOString());
}

export function daysUntilRefresh(meta: StatsMeta): number {
  const t = Date.parse(meta.fetched);
  if (!Number.isFinite(t)) return 0;
  const left = WEEK_MS - (Date.now() - t);
  return Math.max(0, Math.ceil(left / 86400000));
}

export function loadOfficialLive(): Team[] | null {
  try {
    const raw = localStorage.getItem(OFFICIAL_KEY);
    if (!raw) return null;
    const teams = JSON.parse(raw) as Team[];
    if (!Array.isArray(teams) || teams.length < 30) return null;
    return teams;
  } catch {
    return null;
  }
}

function saveOfficialLive(teams: Team[]) {
  localStorage.setItem(OFFICIAL_KEY, JSON.stringify(teams));
}

function num(v: unknown, d = 0): number {
  if (v == null || v === "") return d;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : d;
}

function ipToOuts(ip: unknown): number {
  if (ip == null || ip === "") return 0;
  const [w, frac] = String(ip).split(".");
  return parseInt(w || "0", 10) * 3 + parseInt(frac || "0", 10);
}

function parseHitting(stat: Record<string, unknown> | null): HittingRaw | null {
  if (!stat) return null;
  const pa = num(stat.plateAppearances);
  const ab = num(stat.atBats);
  if (pa + ab === 0 && num(stat.gamesPlayed) === 0) return null;
  return {
    g: num(stat.gamesPlayed),
    pa: pa || ab + num(stat.baseOnBalls) + num(stat.hitByPitch) + num(stat.sacFlies) + num(stat.sacBunts),
    ab,
    r: num(stat.runs),
    h: num(stat.hits),
    d: num(stat.doubles),
    t: num(stat.triples),
    hr: num(stat.homeRuns),
    rbi: num(stat.rbi),
    bb: num(stat.baseOnBalls),
    ibb: num(stat.intentionalWalks),
    so: num(stat.strikeOuts),
    hbp: num(stat.hitByPitch),
    sb: num(stat.stolenBases),
    cs: num(stat.caughtStealing),
    sf: num(stat.sacFlies),
    sac: num(stat.sacBunts),
    gidp: num(stat.groundIntoDoublePlay),
    go: num(stat.groundOuts),
    ao: num(stat.airOuts),
    avg: num(stat.avg),
    obp: num(stat.obp),
    slg: num(stat.slg),
    ops: num(stat.ops),
  };
}

function parsePitching(stat: Record<string, unknown> | null) {
  if (!stat) return null;
  const ip = (stat.inningsPitched as string) ?? "0.0";
  const outs = ipToOuts(ip);
  if (outs === 0 && num(stat.gamesPlayed) === 0) return null;
  return {
    g: num(stat.gamesPlayed),
    gs: num(stat.gamesStarted),
    gf: num(stat.gamesFinished),
    w: num(stat.wins),
    l: num(stat.losses),
    sv: num(stat.saves),
    hld: num(stat.holds),
    ip,
    outs,
    h: num(stat.hits),
    r: num(stat.runs),
    er: num(stat.earnedRuns),
    hr: num(stat.homeRuns),
    bb: num(stat.baseOnBalls),
    ibb: num(stat.intentionalWalks),
    so: num(stat.strikeOuts),
    hbp: num(stat.hitBatsmen ?? stat.hitByPitch),
    wp: num(stat.wildPitches),
    bf: num(stat.battersFaced),
    go: num(stat.groundOuts),
    ao: num(stat.airOuts),
    era: num(stat.era),
    whip: num(stat.whip),
  };
}

function parseFielding(stat: Record<string, unknown> | null) {
  if (!stat) return null;
  const pos = (stat.position as { abbreviation?: string } | undefined)?.abbreviation || "";
  return {
    pos,
    g: num(stat.games),
    gs: num(stat.gamesStarted),
    po: num(stat.putOuts),
    a: num(stat.assists),
    e: num(stat.errors),
    ch: num(stat.chances),
    fp: num(stat.fielding, 0.97),
    inn: num(stat.innings),
    cs: num(stat.caughtStealing),
    sb: num(stat.stolenBases),
    pb: num(stat.passedBall),
  };
}

function pickStatGroup(stats: unknown, name: string): Record<string, unknown> | null {
  if (!Array.isArray(stats)) return null;
  const g = stats.find((s: { group?: { displayName?: string } }) => s.group?.displayName === name);
  return (g?.splits?.[0]?.stat as Record<string, unknown>) ?? null;
}

function allFielding(stats: unknown) {
  if (!Array.isArray(stats)) return [];
  const g = stats.find((s: { group?: { displayName?: string } }) => s.group?.displayName === "fielding");
  if (!g?.splits) return [];
  return g.splits.map((s: { stat: Record<string, unknown> }) => parseFielding(s.stat)).filter(Boolean);
}

async function getJson(url: string, tries = 4): Promise<Record<string, unknown>> {
  let last = "";
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url);
    if (res.ok) return res.json() as Promise<Record<string, unknown>>;
    last = `${res.status}`;
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      continue;
    }
    throw new Error(`${res.status} ${url}`);
  }
  throw new Error(`failed ${last} ${url}`);
}

export async function fetchOfficialDatabase(
  onTeam?: (done: number, total: number, abbr: string) => void
): Promise<Database> {
  const teamsJson = await getJson(
    `https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${SEASON}`
  );
  const rawTeams = ((teamsJson.teams as Record<string, unknown>[]) || []).filter(
    (t) => (t.sport as { id?: number })?.id === 1
  );
  rawTeams.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const teams: TeamRaw[] = [];
  let n = 0;
  for (const t of rawTeams) {
    n++;
    const abbr = String(t.abbreviation || "");
    onTeam?.(n, rawTeams.length, abbr);
    const rosterUrl =
      `https://statsapi.mlb.com/api/v1/teams/${t.id}/roster?rosterType=active&season=${SEASON}` +
      `&hydrate=person(stats(group=[hitting,pitching,fielding],type=[season],season=${SEASON}))`;
    const rosterJson = await getJson(rosterUrl);
    const players: PlayerRaw[] = [];
    for (const slot of (rosterJson.roster as Record<string, unknown>[]) || []) {
      const p = slot.person as Record<string, unknown>;
      const stats = p.stats;
      const hitting = parseHitting(pickStatGroup(stats, "hitting"));
      const pitching = parsePitching(pickStatGroup(stats, "pitching"));
      const fielding = allFielding(stats);
      const posSlot = slot.position as { abbreviation?: string } | undefined;
      const posPri = p.primaryPosition as { abbreviation?: string } | undefined;
      const bat = p.batSide as { code?: string } | undefined;
      const thr = p.pitchHand as { code?: string } | undefined;
      players.push({
        id: num(p.id),
        name: String(p.fullName || ""),
        last: String(p.lastName || String(p.fullName || "").split(" ").slice(-1)[0]),
        first: String(p.firstName || String(p.fullName || "").split(" ")[0]),
        bats: bat?.code || "R",
        throws: thr?.code || "R",
        pos: posSlot?.abbreviation || posPri?.abbreviation || "DH",
        jersey: String(slot.jerseyNumber || p.primaryNumber || ""),
        hitting,
        pitching,
        fielding: fielding as PlayerRaw["fielding"],
      });
    }
    const league = t.league as { name?: string } | undefined;
    const division = t.division as { name?: string } | undefined;
    const venue = t.venue as { name?: string } | undefined;
    teams.push({
      id: num(t.id),
      name: String(t.name || ""),
      loc: String(t.shortName || t.locationName || ""),
      nick: String(t.teamName || ""),
      abbr,
      league: league?.name?.includes("American") ? "AL" : "NL",
      division: (division?.name || "").replace("American League ", "").replace("National League ", ""),
      venue: venue?.name || "",
      city: String(t.locationName || ""),
      players,
    });
  }

  const lgHit: Record<string, number> = {
    pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, so: 0, hbp: 0, sf: 0, sac: 0,
    sb: 0, cs: 0, gidp: 0, go: 0, ao: 0, r: 0,
  };
  const lgPit: Record<string, number> = {
    outs: 0, bf: 0, h: 0, hr: 0, bb: 0, so: 0, hbp: 0, er: 0, r: 0, go: 0, ao: 0,
  };
  for (const team of teams) {
    for (const p of team.players) {
      if (p.hitting && p.hitting.pa > 0) {
        for (const k of Object.keys(lgHit)) lgHit[k] += (p.hitting as unknown as Record<string, number>)[k] || 0;
      }
      if (p.pitching && p.pitching.bf > 0) {
        for (const k of Object.keys(lgPit)) lgPit[k] += (p.pitching as unknown as Record<string, number>)[k] || 0;
      }
    }
  }

  return {
    season: SEASON,
    fetched: new Date().toISOString(),
    source: "statsapi.mlb.com",
    league: { hitting: lgHit, pitching: lgPit },
    teams,
  };
}

function copyRatings(dst: Player, src: Player) {
  dst.name = src.name;
  dst.last = src.last;
  dst.short = src.short;
  dst.bats = src.bats;
  dst.throws = src.throws;
  dst.pos = src.pos;
  dst.jersey = src.jersey;
  dst.isPitcher = src.isPitcher;
  dst.twoWay = src.twoWay;
  dst.hit = src.hit;
  dst.pit = src.pit;
  dst.fld = src.fld;
  dst.speed = src.speed;
  dst.arm = src.arm;
  dst.field = src.field;
  dst.catcherArm = src.catcherArm;
}

/** Update season rates on existing players. Keep trades and created players. */
export function mergeLiveIntoRosters(current: Team[], official: Team[]): Team[] {
  const byId = new Map<number, Player>();
  const officialTeamOf = new Map<number, string>();
  for (const t of official) {
    for (const p of t.players) {
      byId.set(p.id, p);
      officialTeamOf.set(p.id, t.abbr);
    }
  }
  const present = new Set<number>();
  for (const t of current) {
    for (const p of t.players) {
      present.add(p.id);
      if (p.id >= CUSTOM_ID) continue;
      const fresh = byId.get(p.id);
      if (fresh) copyRatings(p, fresh);
    }
  }
  // Call-ups who are not in the game at all land on their official club
  for (const t of official) {
    const dest = current.find((c) => c.abbr === t.abbr);
    if (!dest) continue;
    for (const p of t.players) {
      if (present.has(p.id)) continue;
      dest.players.push({ ...p, hit: { ...p.hit }, pit: { ...p.pit }, fld: [...p.fld] });
      present.add(p.id);
    }
  }
  return current;
}

export async function pullWeeklyStats(
  current: Team[],
  onTeam?: (done: number, total: number, abbr: string) => void
): Promise<{ teams: Team[]; league: LeagueRates; meta: StatsMeta }> {
  const db = await fetchOfficialDatabase(onTeam);
  const official = db.teams.map(hydrateTeam);
  saveOfficialLive(official);
  const merged = mergeLiveIntoRosters(current, official);
  saveRosters(merged);
  const count = official.reduce((n, t) => n + t.players.length, 0);
  const meta: StatsMeta = { fetched: db.fetched, source: db.source, players: count };
  saveStatsMeta(meta);
  return { teams: merged, league: leagueRates(db), meta };
}


