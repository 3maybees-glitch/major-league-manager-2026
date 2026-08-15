import { describe, locFromHit, locFromOut } from "./flavor";
import { chance, clamp, log5 } from "./log5";
import type {
  DefenseAlign, GamePlayer, GameState, LeagueRates, OffCmd, Outcome, PlayResult, Player, SideState,
} from "./types";

function paOf(p: Player) {
  return Math.max(1, p.hit.pa || p.hit.ab + p.hit.bb + p.hit.hbp || 1);
}
function bfOf(p: Player) {
  return Math.max(1, p.pit.bf || Math.round(p.pit.outs * 1.45) || 1);
}

function batterRates(p: Player) {
  const pa = paOf(p);
  const ab = Math.max(1, p.hit.ab);
  const singles = Math.max(0, p.hit.h - p.hit.d - p.hit.t - p.hit.hr);
  const bip = Math.max(1, ab - p.hit.so - p.hit.hr + p.hit.sf);
  return {
    k: p.hit.so / pa,
    bb: p.hit.bb / pa,
    hbp: p.hit.hbp / pa,
    hr: p.hit.hr / pa,
    d: p.hit.d / pa,
    t: p.hit.t / pa,
    s: singles / pa,
    babip: Math.max(0.18, (p.hit.h - p.hit.hr) / bip),
    go: p.hit.go / Math.max(1, p.hit.go + p.hit.ao),
    sb: p.hit.sb / pa,
  };
}

function pitcherRates(p: Player) {
  const bf = bfOf(p);
  const bip = Math.max(1, bf - p.pit.so - p.pit.bb - p.pit.hbp - p.pit.hr);
  return {
    k: p.pit.so / bf,
    bb: p.pit.bb / bf,
    hbp: p.pit.hbp / bf,
    hr: p.pit.hr / bf,
    h: p.pit.h / bf,
    babip: Math.max(0.2, (p.pit.h - p.pit.hr) / bip),
    go: p.pit.go / Math.max(1, p.pit.go + p.pit.ao),
  };
}

function platoon(batter: Player, pitcher: Player): number {
  const b = batter.bats === "S" ? (pitcher.throws === "L" ? "R" : "L") : batter.bats;
  if (b === pitcher.throws) return 0.94;
  return 1.05;
}

function fatigue(gp: GamePlayer): number {
  const outs = gp.pitching.outs;
  const starter = gp.player.pit.gs > gp.player.pit.g * 0.4;
  const limit = starter ? 18 : 6; // outs before fade
  if (outs <= limit) return 1;
  return 1 + (outs - limit) * 0.035;
}

function parkHr(state: GameState): number {
  return state.home.team.park;
}

export function resolvePA(
  state: GameState,
  league: LeagueRates,
  cmd: OffCmd
): PlayResult {
  const offense = state.top ? state.visitor : state.home;
  const defense = state.top ? state.home : state.visitor;
  const batter = offense.lineup[offense.batterIndex] || offense.lineup[0];
  const pitcher = defense.pitcher;
  if (!batter || !pitcher) {
    return {
      outcome: "K", text: ["No batter"], result: "NO PLAY",
      outsOnPlay: 1, runs: 0, rbi: 0, earned: 0, scored: [], advanced: [],
    };
  }
  const b = batter.player;
  const p = pitcher.player;

  if (cmd === "steal") return resolveSteal(state, league, false);
  if (cmd === "bunt") return resolveBunt(state, league);

  const br = batterRates(b);
  const pr = pitcherRates(p);
  const fat = fatigue(pitcher);
  const plat = platoon(b, p);
  const around = state.pitchAround ? 1 : 0;
  const hrPark = parkHr(state);

  let pK = log5(br.k, pr.k, league.k) * (2 - plat) * 0.92;
  let pBB = log5(br.bb, pr.bb * fat, league.bb) * plat * (around ? 1.7 : 1);
  let pHBP = log5(Math.max(br.hbp, 0.006), Math.max(pr.hbp, 0.006), Math.max(league.hbp, 0.008));
  let pHR = log5(br.hr, pr.hr * fat, league.hr) * plat * hrPark * 1.12 * (around ? 0.65 : 1);
  let pH = log5(br.babip, pr.babip * (0.92 + fat * 0.08), league.babip) * plat;

  // normalize the discrete bucket
  const raw = pK + pBB + pHBP + pHR;
  if (raw > 0.72) {
    const s = 0.72 / raw;
    pK *= s; pBB *= s; pHBP *= s; pHR *= s;
  }

  if (cmd === "hitrun") {
    pK += 0.04;
    pH += 0.03;
  }

  const r = Math.random();
  let acc = 0;
  const hit = (x: number) => {
    acc += x;
    return r < acc;
  };

  if (hit(pHBP)) return applyPlay(state, makePlay("HBP", batter, defense));
  if (hit(pBB)) return applyPlay(state, makePlay("BB", batter, defense));
  if (hit(pK)) return applyPlay(state, makePlay("K", batter, defense));
  if (hit(pHR)) return applyPlay(state, makePlay("HR", batter, defense, locFromHit("HR")));

  // Ball in play
  const inPlayHit = clamp(pH * 1.08, 0.24, 0.46);
  if (Math.random() < inPlayHit) {
    const extra = (br.d + br.t + br.hr) / Math.max(0.01, br.s + br.d + br.t + br.hr);
    const tShare = br.t / Math.max(0.001, br.d + br.t + 0.01);
    const roll = Math.random();
    let kind: "1B" | "2B" | "3B" = "1B";
    if (roll < extra * 0.08 + tShare * 0.4 && b.speed > 0.45) kind = "3B";
    else if (roll < extra * 0.55) kind = "2B";
    const loc = locFromHit(kind);
    return applyPlay(state, makePlay(kind, batter, defense, loc));
  }

  // Out in play — possible error
  const goP = clamp((br.go + pr.go) / 2, 0.32, 0.62);
  const kindRoll = Math.random();
  let okind: "GO" | "FO" | "LO" | "PO";
  if (kindRoll < goP) okind = "GO";
  else if (kindRoll < goP + 0.38) okind = "FO";
  else if (kindRoll < goP + 0.52) okind = "LO";
  else okind = "PO";

  const loc = locFromOut(okind);
  const fielder = defense.defense[loc === "P" ? "P" : loc === "C" ? "C" : (loc as keyof SideState["defense"])];
  const errP = fielder ? clamp(0.022 * (1.15 - fielder.player.field), 0.006, 0.05) : 0.02;
  if (Math.random() < errP) {
    return applyPlay(state, makePlay("ROE", batter, defense, loc));
  }

  // SF
  if (okind === "FO" && state.bases[2] && state.outs < 2 && Math.random() < 0.72) {
    return applyPlay(state, makePlay("SF", batter, defense, loc));
  }

  // GIDP / FC
  if (okind === "GO" && state.bases[0] && state.outs < 2) {
    const dpChance = state.align === "in" ? 0.22 : 0.38;
    const gdp = clamp(dpChance * (0.7 + pr.go), 0.15, 0.5);
    if (Math.random() < gdp) return applyPlay(state, makePlay("GIDP", batter, defense, loc));
    if (Math.random() < 0.35) return applyPlay(state, makePlay("FC", batter, defense, loc));
  }

  return applyPlay(state, makePlay(okind, batter, defense, loc));
}

function makePlay(
  outcome: Outcome,
  batter: GamePlayer,
  defense: SideState,
  loc?: PlayResult["loc"]
): Omit<PlayResult, "outsOnPlay" | "runs" | "rbi" | "earned" | "scored" | "advanced"> {
  const fielder = loc
    ? (defense.defense[loc === "P" ? "P" : loc === "C" ? "C" : (loc as keyof SideState["defense"])] || defense.pitcher)
    : undefined;
  const name = fielder?.player.short;
  const d = describe(outcome, loc, name);
  return { outcome, text: d.text, result: d.result, fielder: name, loc };
}

function emptyResult(partial: ReturnType<typeof makePlay>): PlayResult {
  return { ...partial, outsOnPlay: 0, runs: 0, rbi: 0, earned: 0, scored: [], advanced: [] };
}

function applyPlay(
  state: GameState,
  raw: ReturnType<typeof makePlay>
): PlayResult {
  const play = emptyResult(raw);
  const offense = state.top ? state.visitor : state.home;
  const defense = state.top ? state.home : state.visitor;
  const batter = offense.lineup[offense.batterIndex];
  const pit = defense.pitcher;
  const o = play.outcome;

  const score = (runner: GamePlayer, rbi: boolean, earned: boolean) => {
    runner.batting.r++;
    offense.runs++;
    const inn = state.inning - 1;
    while (offense.innings.length <= inn) offense.innings.push(0);
    offense.innings[inn]++;
    play.runs++;
    play.scored.push(`${runner.player.short} scores`);
    if (rbi) {
      batter.batting.rbi++;
      play.rbi++;
      state.gwRbi = batter.player.last.toUpperCase();
    }
    if (earned) {
      pit.pitching.er++;
      play.earned++;
    }
    pit.pitching.r++;
  };

  const occupy = (base: 0 | 1 | 2, who: GamePlayer) => {
    state.bases[base] = who;
    const label = base === 0 ? "first" : base === 1 ? "second" : "third";
    play.advanced.push(`${who.player.short} on ${label}`);
  };

  // Steal / WP handled separately below
  if (o === "SB" || o === "CS" || o === "WP" || o === "PB") {
    return applyBaserunningEvent(state, play);
  }

  pit.pitching.bf++;
  state.simMinutes += 2 + Math.floor(Math.random() * 3);

  if (o === "K") {
    batter.batting.ab++;
    batter.batting.so++;
    pit.pitching.so++;
    play.outsOnPlay = 1;
    state.outs++;
  } else if (o === "BB" || o === "IBB") {
    batter.batting.bb++;
    pit.pitching.bb++;
    forceRunners(state, batter, score, occupy, o === "IBB");
  } else if (o === "HBP") {
    batter.batting.hbp++;
    pit.pitching.hbp++;
    state.hbpNotes.push(`${batter.player.last.toUpperCase()} (by ${pit.player.last.toUpperCase()})`);
    forceRunners(state, batter, score, occupy, false);
  } else if (o === "HR") {
    batter.batting.ab++;
    batter.batting.h++;
    batter.batting.hr++;
    pit.pitching.h++;
    pit.pitching.hr++;
    offense.hits++;
    // score all
    for (let i = 2; i >= 0; i--) {
      const rnr = state.bases[i];
      if (rnr) score(rnr, true, true);
      state.bases[i] = null;
    }
    score(batter, true, true);
    play.advanced = [];
  } else if (o === "1B" || o === "2B" || o === "3B") {
    batter.batting.ab++;
    batter.batting.h++;
    if (o === "2B") batter.batting.d++;
    if (o === "3B") batter.batting.t++;
    pit.pitching.h++;
    offense.hits++;
    advanceOnHit(state, batter, o, score, occupy);
  } else if (o === "SF") {
    batter.batting.sf++;
    play.outsOnPlay = 1;
    state.outs++;
    const r3 = state.bases[2];
    if (r3) {
      score(r3, true, true);
      state.bases[2] = null;
    }
    // other runners may tag
    if (state.bases[1] && chance(0.35 + state.bases[1].player.speed * 0.3)) {
      occupy(2, state.bases[1]);
      state.bases[1] = null;
    }
    if (state.bases[0] && chance(0.25 + state.bases[0].player.speed * 0.25)) {
      occupy(1, state.bases[0]);
      state.bases[0] = null;
    }
    state.sfNotes.push(batter.player.last.toUpperCase());
  } else if (o === "SAC") {
    batter.batting.sac++;
    play.outsOnPlay = 1;
    state.outs++;
    state.sacNotes.push(batter.player.last.toUpperCase());
    // move runners
    if (state.bases[1] && !state.bases[2]) {
      occupy(2, state.bases[1]);
      state.bases[1] = null;
    }
    if (state.bases[0]) {
      occupy(1, state.bases[0]);
      state.bases[0] = null;
    }
  } else if (o === "GIDP") {
    batter.batting.ab++;
    batter.batting.gidp++;
    play.outsOnPlay = Math.min(2, 2);
    play.dp = true;
    state.outs += 2;
    // 6-4-3 style: runner on first out, batter out
    state.bases[0] = null;
    // runner on third may score if < 2 before? already 2 outs now — only if was 0 outs
    if (state.outs - 2 === 0 && state.bases[2] && chance(0.55)) {
      score(state.bases[2], false, true);
      state.bases[2] = null;
    }
    if (state.bases[1] && state.outs < 3 && chance(0.4)) {
      occupy(2, state.bases[1]);
      state.bases[1] = null;
    }
  } else if (o === "FC") {
    batter.batting.ab++;
    play.outsOnPlay = 1;
    state.outs++;
    // lead runner out, batter to first
    if (state.bases[0]) {
      state.bases[0] = null;
    } else if (state.bases[1]) {
      state.bases[1] = null;
    } else if (state.bases[2]) {
      state.bases[2] = null;
    }
    if (state.outs < 3) occupy(0, batter);
  } else if (o === "ROE") {
    batter.batting.ab++;
    play.error = true;
    offense.errors; // defense error
    (state.top ? state.home : state.visitor).errors++;
    // treat like a single, unearned
    const r2 = state.bases[1];
    const r3 = state.bases[2];
    if (r3) { score(r3, false, false); state.bases[2] = null; }
    if (r2) { occupy(2, r2); state.bases[1] = null; }
    if (state.bases[0]) { occupy(1, state.bases[0]); state.bases[0] = null; }
    occupy(0, batter);
  } else {
    // GO FO LO PO
    batter.batting.ab++;
    play.outsOnPlay = 1;
    state.outs++;
    if (o === "GO" && state.outs < 3) {
      if (state.bases[2] && state.align === "in" && chance(0.55)) {
        // infield in, out at home
        play.text.push("Throw home — he's out");
        state.bases[2] = null;
        occupy(0, batter);
        // already counted the out at home instead? we already incremented outs for batter.
        // treat as FC at home — batter safe. undo batter out conceptually: already 1 out on the runner.
        // keep simple: runner out, batter safe — that's FC. We already did batter out. skip.
      } else {
        if (state.bases[2] && chance(0.28)) {
          score(state.bases[2], false, true);
          state.bases[2] = null;
        }
        if (state.bases[1] && chance(0.22 + state.bases[1].player.speed * 0.2)) {
          occupy(2, state.bases[1]);
          state.bases[1] = null;
        }
      }
    }
  }

  if (play.outsOnPlay > 0) {
    pit.pitching.outs += play.outsOnPlay;
  }

  if (state.outs >= 3) {
    const left = state.bases.filter(Boolean).length;
    offense.lob += left;
    for (const rnr of state.bases) if (rnr) rnr.batting.left++;
  }

  return play;
}

function forceRunners(
  state: GameState,
  batter: GamePlayer,
  score: (r: GamePlayer, rbi: boolean, e: boolean) => void,
  occupy: (b: 0 | 1 | 2, w: GamePlayer) => void,
  ibb: boolean
) {
  const b = state.bases;
  if (b[0] && b[1] && b[2]) {
    score(b[2], !ibb, true);
    b[2] = b[1];
    b[1] = b[0];
    occupy(0, batter);
  } else if (b[0] && b[1]) {
    occupy(2, b[1]);
    occupy(1, b[0]);
    occupy(0, batter);
  } else if (b[0]) {
    occupy(1, b[0]);
    occupy(0, batter);
  } else {
    occupy(0, batter);
  }
}

function advanceOnHit(
  state: GameState,
  batter: GamePlayer,
  kind: "1B" | "2B" | "3B",
  score: (r: GamePlayer, rbi: boolean, e: boolean) => void,
  occupy: (b: 0 | 1 | 2, w: GamePlayer) => void
) {
  const r1 = state.bases[0];
  const r2 = state.bases[1];
  const r3 = state.bases[2];
  state.bases = [null, null, null];

  if (kind === "3B") {
    if (r3) score(r3, true, true);
    if (r2) score(r2, true, true);
    if (r1) score(r1, true, true);
    occupy(2, batter);
    return;
  }
  if (kind === "2B") {
    if (r3) score(r3, true, true);
    if (r2) score(r2, true, true);
    if (r1) {
      const goHome = 0.38 + r1.player.speed * 0.4;
      if (chance(goHome)) score(r1, true, true);
      else occupy(2, r1);
    }
    occupy(1, batter);
    return;
  }
  // single
  if (r3) score(r3, true, true);
  if (r2) {
    const goHome = 0.68 + r2.player.speed * 0.28;
    if (chance(goHome)) score(r2, true, true);
    else occupy(2, r2);
  }
  if (r1) {
    const to3 = 0.22 + r1.player.speed * 0.35;
    if (chance(to3) && !state.bases[2]) occupy(2, r1);
    else occupy(1, r1);
  }
  occupy(0, batter);
}

function applyBaserunningEvent(state: GameState, play: PlayResult): PlayResult {
  if (play.outcome === "SB") {
    // move lead runner
    if (state.bases[1] && !state.bases[2]) {
      state.bases[1].batting.sb++;
      state.bases[2] = state.bases[1];
      state.bases[1] = null;
      play.advanced.push(`${state.bases[2]!.player.short} on third`);
    } else if (state.bases[0] && !state.bases[1]) {
      state.bases[0].batting.sb++;
      state.bases[1] = state.bases[0];
      state.bases[0] = null;
      play.advanced.push(`${state.bases[1]!.player.short} on second`);
    }
  } else if (play.outcome === "CS") {
    play.outsOnPlay = 1;
    state.outs++;
    (state.top ? state.home : state.visitor).pitcher.pitching.outs++;
    if (state.bases[1] && !state.bases[2]) {
      state.bases[1].batting.cs++;
      state.bases[1] = null;
    } else if (state.bases[0]) {
      state.bases[0].batting.cs++;
      state.bases[0] = null;
    }
  } else if (play.outcome === "WP" || play.outcome === "PB") {
    const def = state.top ? state.home : state.visitor;
    if (play.outcome === "WP") def.pitcher.pitching.wp++;
    if (state.bases[2]) {
      state.bases[2].batting.r++;
      const off = state.top ? state.visitor : state.home;
      off.runs++;
      const inn = state.inning - 1;
      while (off.innings.length <= inn) off.innings.push(0);
      off.innings[inn]++;
      play.runs++;
      play.scored.push(`${state.bases[2]!.player.short} scores`);
      def.pitcher.pitching.r++;
      def.pitcher.pitching.er++;
      play.earned++;
      state.bases[2] = null;
    }
    if (state.bases[1]) { state.bases[2] = state.bases[1]; state.bases[1] = null; }
    if (state.bases[0]) { state.bases[1] = state.bases[0]; state.bases[0] = null; }
  }
  return play;
}

export function resolveSteal(state: GameState, _league: LeagueRates, hitAndRun: boolean): PlayResult {
  const offense = state.top ? state.visitor : state.home;
  const defense = state.top ? state.home : state.visitor;
  const runner = state.bases[0] || state.bases[1];
  if (!runner) {
    return emptyResult({ outcome: "SB", text: ["Nobody on to send"], result: "NO PLAY" });
  }
  const catcher = defense.defense.C;
  const arm = catcher ? catcher.player.catcherArm : 0.28;
  const succ = clamp(0.55 + runner.player.speed * 0.35 - arm * 0.55 + (hitAndRun ? 0.08 : 0), 0.18, 0.92);
  const ok = chance(succ);
  const raw = makePlay(ok ? "SB" : "CS", offense.lineup[offense.batterIndex], defense);
  return applyPlay(state, raw);
}

function resolveBunt(state: GameState, _league: LeagueRates): PlayResult {
  const offense = state.top ? state.visitor : state.home;
  const defense = state.top ? state.home : state.visitor;
  const batter = offense.lineup[offense.batterIndex];
  const roll = Math.random();
  // pop, k, out sac, hit
  if (roll < 0.08) return applyPlay(state, makePlay("K", batter, defense));
  if (roll < 0.16) return applyPlay(state, makePlay("PO", batter, defense, "P"));
  if (roll < 0.28 && !state.bases[0] && !state.bases[1] && !state.bases[2]) {
    return applyPlay(state, makePlay("1B", batter, defense, "3B"));
  }
  if (state.bases.some(Boolean) && state.outs < 2 && roll < 0.82) {
    return applyPlay(state, makePlay("SAC", batter, defense, chance(0.5) ? "P" : "1B"));
  }
  if (roll < 0.9) return applyPlay(state, makePlay("GO", batter, defense, "P"));
  return applyPlay(state, makePlay("1B", batter, defense, "3B"));
}

export function maybeIbb(state: GameState): PlayResult {
  const offense = state.top ? state.visitor : state.home;
  const defense = state.top ? state.home : state.visitor;
  const batter = offense.lineup[offense.batterIndex];
  return applyPlay(state, makePlay("IBB", batter, defense));
}

export function setAlign(_state: GameState, align: DefenseAlign): DefenseAlign {
  return align;
}
