import { changePitcher, defenseOf, offenseOf } from "./game";
import type { GameState, LeagueRates, OffCmd } from "./types";

export function aiShouldRelieve(g: GameState): boolean {
  const pit = defenseOf(g).pitcher;
  const def = defenseOf(g);
  const off = offenseOf(g);
  const lead = def.runs - off.runs;
  const outs = pit.pitching.outs;
  const er = pit.pitching.er;
  const starter = pit.player.pit.gs >= 3;
  if (def.bullpen.length === 0) return false;
  if (g.inning >= 9 && lead > 0 && lead <= 3 && outs >= 15) return true;
  if (starter && outs >= 21) return true;
  if (starter && outs >= 15 && er >= 5) return true;
  if (starter && g.inning >= 7 && lead < 0 && er >= 4) return true;
  if (!starter && outs >= 6) return true;
  if (pit.pitching.h + pit.pitching.bb >= 10 && outs < 12) return true;
  return false;
}

export function aiRelieve(g: GameState) {
  const def = defenseOf(g);
  const lead = def.runs - offenseOf(g).runs;
  const pen = [...def.bullpen];
  if (!pen.length) return;
  let pick = pen[0];
  if (g.inning >= 9 && lead > 0 && lead <= 3) {
    pick = [...pen].sort((a, b) => b.player.pit.sv - a.player.pit.sv)[0];
  } else {
    pick = [...pen].sort((a, b) => a.player.pit.era - b.player.pit.era)[0];
  }
  changePitcher(g, pick);
}

export function aiOffense(g: GameState, _league: LeagueRates): OffCmd {
  const off = offenseOf(g);
  const batter = off.lineup[off.batterIndex];
  const r1 = g.bases[0];
  const r2 = g.bases[1];
  const r3 = g.bases[2];
  const close = Math.abs(off.runs - defenseOf(g).runs) <= 2;
  const late = g.inning >= 7;

  if (r1 && !r2 && batter.player.speed > 0.62 && g.outs < 2 && Math.random() < 0.18) {
    return "steal";
  }
  if ((r1 || r2) && !r3 && g.outs === 0 && close && late && batter.player.hit.ops < 0.7 && Math.random() < 0.45) {
    return "bunt";
  }
  if (r1 && !r2 && g.outs < 2 && batter.player.hit.avg > 0.26 && r1.player.speed > 0.5 && Math.random() < 0.12) {
    return "hitrun";
  }
  return "swing";
}

export function aiDefenseIbb(g: GameState): boolean {
  const off = offenseOf(g);
  const batter = off.lineup[off.batterIndex];
  const next = off.lineup[(off.batterIndex + 1) % 9];
  const lead = defenseOf(g).runs - off.runs;
  if (g.outs < 1) return false;
  if (!g.bases[1] && !g.bases[2]) return false;
  if (g.bases[0]) return false;
  if (g.inning < 8) return false;
  if (batter.player.hit.ops > 0.88 && next.player.hit.ops < batter.player.hit.ops - 0.12 && lead <= 2) {
    return Math.random() < 0.55;
  }
  return false;
}
