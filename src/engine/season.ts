import { boxPages, newGame, playPA } from "./game";
import type { AccumBatting, AccumPitching, LeagueRates, SeasonGame, SeasonRecord, SeasonSave, Team } from "./types";

const KEY = "mlm2026-season";

function divisions(teams: Team[]) {
  const map = new Map<string, Team[]>();
  for (const t of teams) {
    const k = `${t.league}-${t.division}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(t);
  }
  return map;
}

/** Build a 162-game slate: 13 vs each of 4 division rivals, rest vs others. */
export function buildSchedule(teams: Team[]): SeasonGame[] {
  const games: SeasonGame[] = [];
  const divs = divisions(teams);
  const byAbbr = new Map(teams.map((t) => [t.abbr, t]));
  const homeAway = new Map<string, number>();
  const bump = (a: string, b: string) => {
    const k = [a, b].sort().join("-");
    homeAway.set(k, (homeAway.get(k) || 0) + 1);
    return (homeAway.get(k)! % 2) === 1;
  };

  const addSeries = (a: Team, b: Team, n: number) => {
    for (let i = 0; i < n; i++) {
      const aHome = bump(a.abbr, b.abbr);
      games.push({
        day: 0,
        away: aHome ? b.abbr : a.abbr,
        home: aHome ? a.abbr : b.abbr,
        played: false,
      });
    }
  };

  // Division: 13 each
  for (const group of divs.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        addSeries(group[i], group[j], 13);
      }
    }
  }

  // Same league other divisions: 6 each
  const al = teams.filter((t) => t.league === "AL");
  const nl = teams.filter((t) => t.league === "NL");
  const sameLeague = (league: Team[]) => {
    for (let i = 0; i < league.length; i++) {
      for (let j = i + 1; j < league.length; j++) {
        if (league[i].division === league[j].division) continue;
        addSeries(league[i], league[j], 6);
      }
    }
  };
  sameLeague(al);
  sameLeague(nl);

  // Interleague filler so each team lands near 162
  const count = (abbr: string) => games.filter((g) => g.home === abbr || g.away === abbr).length;
  for (const a of al) {
    for (const b of nl) {
      if (count(a.abbr) >= 162 && count(b.abbr) >= 162) continue;
      if (count(a.abbr) < 162 && count(b.abbr) < 162) addSeries(a, b, 3);
    }
  }

  // Shuffle into days of ~15 games
  for (let i = games.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [games[i], games[j]] = [games[j], games[i]];
  }
  let day = 1;
  let onDay = 0;
  const busy = new Set<string>();
  const ordered: SeasonGame[] = [];
  const leftover = [...games];
  while (leftover.length) {
    busy.clear();
    onDay = 0;
    for (let i = 0; i < leftover.length && onDay < 15; i++) {
      const g = leftover[i];
      if (busy.has(g.home) || busy.has(g.away)) continue;
      g.day = day;
      ordered.push(g);
      busy.add(g.home);
      busy.add(g.away);
      leftover.splice(i, 1);
      i--;
      onDay++;
    }
    if (onDay === 0) {
      leftover[0].day = day;
      ordered.push(leftover.shift()!);
    }
    day++;
    if (day > 220) break;
  }
  return ordered;
}

function emptyRec(abbr: string): SeasonRecord {
  return { abbr, w: 0, l: 0, rs: 0, ra: 0 };
}

export function newSeason(teams: Team[], userTeam: string): SeasonSave {
  const standings: Record<string, SeasonRecord> = {};
  for (const t of teams) standings[t.abbr] = emptyRec(t.abbr);
  return {
    version: 1,
    season: 2026,
    userTeam,
    day: 1,
    schedule: buildSchedule(teams),
    standings,
    batting: {},
    pitching: {},
    rotationSlot: 0,
    created: new Date().toISOString(),
  };
}

export function saveSeason(s: SeasonSave) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function loadSeason(): SeasonSave | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SeasonSave;
    if (s.version !== 1) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearSeason() {
  localStorage.removeItem(KEY);
}

export function nextUserGames(s: SeasonSave, n = 8): SeasonGame[] {
  return s.schedule.filter((g) => !g.played && (g.home === s.userTeam || g.away === s.userTeam)).slice(0, n);
}

export function gamesOnDay(s: SeasonSave, day: number): SeasonGame[] {
  return s.schedule.filter((g) => g.day === day);
}

function addBat(dst: Record<number, AccumBatting>, id: number, row: AccumBatting) {
  const d = dst[id] || { g: 0, ab: 0, r: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, so: 0, hbp: 0, sb: 0, cs: 0, sf: 0 };
  d.g += row.g;
  d.ab += row.ab; d.r += row.r; d.h += row.h; d.d += row.d; d.t += row.t;
  d.hr += row.hr; d.rbi += row.rbi; d.bb += row.bb; d.so += row.so;
  d.hbp += row.hbp; d.sb += row.sb; d.cs += row.cs; d.sf += row.sf;
  dst[id] = d;
}
function addPit(dst: Record<number, AccumPitching>, id: number, row: AccumPitching) {
  const d = dst[id] || { g: 0, gs: 0, w: 0, l: 0, sv: 0, outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0 };
  d.g += row.g; d.gs += row.gs; d.w += row.w; d.l += row.l; d.sv += row.sv;
  d.outs += row.outs; d.h += row.h; d.r += row.r; d.er += row.er; d.bb += row.bb; d.so += row.so; d.hr += row.hr;
  dst[id] = d;
}

export function applyGameToSeason(s: SeasonSave, away: string, home: string, ar: number, hr: number) {
  s.standings[away] ||= emptyRec(away);
  s.standings[home] ||= emptyRec(home);
  s.standings[away].rs += ar;
  s.standings[away].ra += hr;
  s.standings[home].rs += hr;
  s.standings[home].ra += ar;
  if (ar > hr) {
    s.standings[away].w++;
    s.standings[home].l++;
  } else {
    s.standings[home].w++;
    s.standings[away].l++;
  }
}

export function harvestStats(s: SeasonSave, g: ReturnType<typeof import("./game").newGame>) {
  const pages = boxPages(g);
  for (const pack of [pages.awayBat, pages.homeBat]) {
    for (const p of pack.list) {
      const b = p.batting;
      addBat(s.batting, p.player.id, {
        g: 1, ab: b.ab, r: b.r, h: b.h, d: b.d, t: b.t, hr: b.hr, rbi: b.rbi,
        bb: b.bb, so: b.so, hbp: b.hbp, sb: b.sb, cs: b.cs, sf: b.sf,
      });
    }
  }
  for (const pack of [pages.awayPit, pages.homePit]) {
    for (const p of pack.list) {
      addPit(s.pitching, p.player.id, {
        g: 1,
        gs: p === pack.side.pitcher || p.pitching.outs >= 12 ? 1 : 0,
        w: p.pitching.decided === "W" ? 1 : 0,
        l: p.pitching.decided === "L" ? 1 : 0,
        sv: p.pitching.decided === "S" ? 1 : 0,
        outs: p.pitching.outs, h: p.pitching.h, r: p.pitching.r, er: p.pitching.er,
        bb: p.pitching.bb, so: p.pitching.so, hr: p.pitching.hr,
      });
    }
  }
}

export function simOneGame(away: Team, home: Team, league: LeagueRates, aSt: number, hSt: number) {
  const g = newGame(away, home, { userManages: "none", awayStarter: aSt, homeStarter: hSt, delayMs: 0 });
  let n = 0;
  while (!g.over && n++ < 400) playPA(g, league, "swing");
  return g;
}

export function gb(team: SeasonRecord, leader: SeasonRecord): string {
  const g = (leader.w - team.w + team.l - leader.l) / 2;
  if (g === 0) return "--";
  return g.toFixed(1);
}

export function pct(r: SeasonRecord): string {
  const g = r.w + r.l;
  if (!g) return ".000";
  const p = r.w / g;
  return p.toFixed(3).replace(/^0/, "");
}
