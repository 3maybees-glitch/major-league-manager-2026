import { defaultLineup, dueUp } from "./lineup";
import { maybeIbb, resolvePA } from "./resolve";
import type {
  GamePlayer, GameState, LeagueRates, OffCmd, PlayResult, SideState, Team,
} from "./types";

export function newGame(
  away: Team,
  home: Team,
  opts: {
    userManages?: GameState["userManages"];
    awayStarter?: number;
    homeStarter?: number;
    delayMs?: number;
  } = {}
): GameState {
  return {
    visitor: defaultLineup(away, opts.awayStarter ?? 0),
    home: defaultLineup(home, opts.homeStarter ?? 0),
    inning: 1,
    top: true,
    outs: 0,
    bases: [null, null, null],
    balls: 0,
    strikes: 0,
    log: [],
    startedAt: Date.now(),
    simMinutes: 150 + Math.floor(Math.random() * 40),
    delayMs: opts.delayMs ?? 7000,
    music: true,
    textOn: true,
    align: "regular",
    pitchAround: false,
    userManages: opts.userManages ?? "home",
    lastPlay: null,
    over: false,
    gwRbi: null,
    winner: null,
    hbpNotes: [],
    sacNotes: [],
    sfNotes: [],
  };
}

export function offenseOf(g: GameState): SideState {
  return g.top ? g.visitor : g.home;
}
export function defenseOf(g: GameState): SideState {
  return g.top ? g.home : g.visitor;
}

export function isUserOffense(g: GameState): boolean {
  if (g.userManages === "both") return true;
  if (g.userManages === "none") return false;
  if (g.userManages === "home") return !g.top;
  return g.top;
}
export function isUserDefense(g: GameState): boolean {
  if (g.userManages === "both") return true;
  if (g.userManages === "none") return false;
  if (g.userManages === "home") return g.top;
  return !g.top;
}

function endHalf(g: GameState) {
  const off = offenseOf(g);
  while (off.innings.length < g.inning) off.innings.push(0);
  g.outs = 0;
  g.bases = [null, null, null];
  g.pitchAround = false;
  g.align = "regular";
  if (g.top) {
    g.top = false;
    if (g.inning >= 9 && g.home.runs > g.visitor.runs) {
      g.over = true;
      assignDecision(g);
    }
  } else if (g.inning >= 9 && g.home.runs !== g.visitor.runs) {
    g.over = true;
    assignDecision(g);
  } else {
    g.top = true;
    g.inning++;
  }
}

function assignDecision(g: GameState) {
  const win = g.home.runs > g.visitor.runs ? g.home : g.visitor;
  const lose = win === g.home ? g.visitor : g.home;
  // starter or last pitcher of record — simplified: winning team's current or last effective
  const wp = win.pitcher;
  const lp = lose.pitcher;
  wp.pitching.decided = "W";
  lp.pitching.decided = "L";
  if (g.inning >= 9 && Math.abs(g.home.runs - g.visitor.runs) <= 3 && wp.pitching.outs <= 6) {
    wp.pitching.decided = "S";
    // find a starter-ish pitcher for the W
    const cand = [...win.lineup, win.pitcher, ...win.bullpen].find(
      (p) => p.pitching.outs >= 9 && p !== wp
    );
    if (cand) cand.pitching.decided = "W";
    else wp.pitching.decided = "W";
  }
  g.winner = g.home.runs > g.visitor.runs ? "home" : "away";
}

export function playPA(g: GameState, league: LeagueRates, cmd: OffCmd): PlayResult {
  if (g.over) {
    return {
      outcome: "K", text: ["Game is over"], result: "FINAL",
      outsOnPlay: 0, runs: 0, rbi: 0, earned: 0, scored: [], advanced: [],
    };
  }
  const play = cmd === "ibb" ? maybeIbb(g) : resolvePA(g, league, cmd);
  g.lastPlay = play;
  g.log.push(play);
  g.pitchAround = false;

  const isPA = !["SB", "CS", "WP", "PB"].includes(play.outcome);
  if (isPA) {
    const off = offenseOf(g);
    off.batterIndex = (off.batterIndex + 1) % 9;
  }

  if (!g.top && g.inning >= 9 && g.home.runs > g.visitor.runs && play.runs > 0) {
    g.over = true;
    assignDecision(g);
    return play;
  }

  if (g.outs >= 3) {
    endHalf(g);
  }

  return play;
}

export function nextBatterName(g: GameState): string {
  const off = offenseOf(g);
  return off.lineup[off.batterIndex]?.player.name ?? "";
}

export function due(g: GameState) {
  return dueUp(offenseOf(g));
}

export function changePitcher(g: GameState, reliever: GamePlayer, insertOrder?: number) {
  const def = defenseOf(g);
  const old = def.pitcher;
  old.fieldPos = "BENCH";
  reliever.fieldPos = "P";
  reliever.entered = true;
  def.pitcher = reliever;
  def.defense.P = reliever;
  def.bullpen = def.bullpen.filter((p) => p.player.id !== reliever.player.id);
  if (typeof insertOrder === "number" && insertOrder >= 0 && insertOrder < 9) {
    const bumped = def.lineup[insertOrder];
    def.lineup[insertOrder] = reliever;
    reliever.battingOrder = insertOrder;
    if (bumped) {
      bumped.battingOrder = -1;
      bumped.fieldPos = "BENCH";
      def.bench.push(bumped);
    }
  }
  if (!def.bullpen.includes(old) && old.player.isPitcher) def.bullpen.push(old);
}

export function pinchHit(g: GameState, ph: GamePlayer) {
  const off = offenseOf(g);
  const slot = off.batterIndex;
  const old = off.lineup[slot];
  const pos = old.fieldPos;
  ph.fieldPos = pos;
  ph.battingOrder = slot;
  ph.entered = true;
  off.lineup[slot] = ph;
  off.bench = off.bench.filter((p) => p.player.id !== ph.player.id);
  if (pos !== "DH" && pos !== "BENCH" && pos !== "P") {
    off.defense[pos as keyof SideState["defense"]] = ph;
  }
  if (pos === "DH") off.dh = ph;
  old.fieldPos = "BENCH";
  old.battingOrder = -1;
  off.bench.push(old);
}

export function pinchRun(g: GameState, pr: GamePlayer, base: 0 | 1 | 2) {
  const off = offenseOf(g);
  const old = g.bases[base];
  if (!old) return;
  pr.entered = true;
  pr.fieldPos = old.fieldPos;
  pr.battingOrder = old.battingOrder;
  if (old.battingOrder >= 0) off.lineup[old.battingOrder] = pr;
  if (old.fieldPos !== "DH" && old.fieldPos !== "BENCH" && old.fieldPos !== "P") {
    off.defense[old.fieldPos as keyof SideState["defense"]] = pr;
  }
  g.bases[base] = pr;
  off.bench = off.bench.filter((p) => p.player.id !== pr.player.id);
  old.fieldPos = "BENCH";
  off.bench.push(old);
}

export function simRestOfGame(g: GameState, league: LeagueRates) {
  let guard = 0;
  while (!g.over && guard++ < 400) {
    playPA(g, league, "swing");
  }
}

export function boxPages(g: GameState) {
  const bat = (side: SideState) => {
    const rows = [...side.lineup];
    // include anyone who batted from bench
    for (const p of [...side.bench, side.pitcher, ...side.bullpen]) {
      if (p.entered && p.batting.ab + p.batting.bb + p.batting.hbp + p.batting.sf + p.batting.sac > 0) {
        if (!rows.includes(p)) rows.push(p);
      }
    }
    const uniq = new Map<number, GamePlayer>();
    for (const r of rows) uniq.set(r.player.id, r);
    const list = [...uniq.values()];
    const tot = { ab: 0, r: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, sb: 0, bb: 0, so: 0 };
    for (const p of list) {
      tot.ab += p.batting.ab; tot.r += p.batting.r; tot.h += p.batting.h;
      tot.d += p.batting.d; tot.t += p.batting.t; tot.hr += p.batting.hr;
      tot.rbi += p.batting.rbi; tot.sb += p.batting.sb; tot.bb += p.batting.bb; tot.so += p.batting.so;
    }
    return { side, list, tot };
  };
  const pit = (side: SideState) => {
    const list = [side.pitcher, ...side.bullpen, ...side.lineup].filter((p) => p.pitching.bf > 0 || p.pitching.outs > 0);
    const seen = new Set<number>();
    const uniq = list.filter((p) => (seen.has(p.player.id) ? false : (seen.add(p.player.id), true)));
    const tot = { outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 };
    for (const p of uniq) {
      tot.outs += p.pitching.outs; tot.h += p.pitching.h; tot.r += p.pitching.r;
      tot.er += p.pitching.er; tot.bb += p.pitching.bb; tot.so += p.pitching.so;
    }
    return { side, list: uniq, tot };
  };
  return {
    awayBat: bat(g.visitor),
    homeBat: bat(g.home),
    awayPit: pit(g.visitor),
    homePit: pit(g.home),
  };
}

export function fmtIp(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

export function clockTime(g: GameState): string {
  const base = 19 * 60; // 7:00 PM start in minutes
  const t = (base + Math.floor(g.simMinutes * 0.15) + Math.floor((Date.now() - g.startedAt) / 60000)) % (24 * 60);
  let h = Math.floor(t / 60);
  const m = t % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ap}`;
}

export function gameTimeLabel(g: GameState): string {
  const mins = Math.max(90, Math.round(g.simMinutes * 0.55 + g.log.length * 0.4));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const s = Math.floor(Math.random() * 60);
  return `${h} hours ${m} minutes ${s} seconds`;
}
