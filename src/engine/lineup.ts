import type { GamePlayer, Player, Pos, SideState, Team } from "./types";

const FIELD: Exclude<Pos, "DH" | "OF" | "IF" | "UT">[] =
  ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];

function emptyBatting() {
  return { ab: 0, r: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, so: 0, hbp: 0, sb: 0, cs: 0, sf: 0, sac: 0, gidp: 0, left: 0 };
}
function emptyPitching() {
  return { outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0, hbp: 0, wp: 0, bf: 0 } as GamePlayer["pitching"];
}

export function gp(player: Player, order: number, pos: GamePlayer["fieldPos"]): GamePlayer {
  return {
    player,
    battingOrder: order,
    fieldPos: pos,
    batting: emptyBatting(),
    pitching: emptyPitching(),
    entered: pos !== "BENCH",
  };
}

function ops(p: Player): number {
  const h = p.hit;
  if (h.ops) return h.ops;
  const ab = Math.max(1, h.ab);
  const pa = Math.max(1, h.pa);
  const tb = (h.h - h.d - h.t - h.hr) + 2 * h.d + 3 * h.t + 4 * h.hr;
  return (h.h + h.bb + h.hbp) / pa + tb / ab;
}

function canPlay(p: Player, pos: Pos): boolean {
  if (p.pos === pos) return true;
  if (p.fld.some((f) => f.pos === pos && f.g > 0)) return true;
  if (pos === "DH") return !p.isPitcher;
  if ((pos === "LF" || pos === "CF" || pos === "RF") && (p.pos === "LF" || p.pos === "CF" || p.pos === "RF" || p.pos === "OF")) return true;
  if ((pos === "2B" || pos === "SS" || pos === "3B") && (p.pos === "2B" || p.pos === "SS" || p.pos === "3B")) return true;
  return false;
}

export function splitRoster(team: Team) {
  const pitchers = team.players
    .filter((p) => p.isPitcher || p.twoWay)
    .sort((a, b) => (b.pit.gs * 20 + b.pit.outs) - (a.pit.gs * 20 + a.pit.outs));
  const bats = team.players
    .filter((p) => !p.isPitcher || p.twoWay)
    .sort((a, b) => ops(b) - ops(a));
  return { pitchers, bats };
}

export function defaultLineup(team: Team, starterIndex = 0): SideState {
  const { pitchers, bats } = splitRoster(team);
  const used = new Set<number>();
  const defense = {} as SideState["defense"];
  const assigned: GamePlayer[] = [];

  const take = (pos: Pos): Player => {
    const exact = bats.find((p) => !used.has(p.id) && p.pos === pos);
    if (exact) { used.add(exact.id); return exact; }
    const can = bats.find((p) => !used.has(p.id) && canPlay(p, pos));
    if (can) { used.add(can.id); return can; }
    const any = bats.find((p) => !used.has(p.id));
    if (any) { used.add(any.id); return any; }
    // fallback: a pitcher
    const pit = pitchers.find((p) => !used.has(p.id)) || pitchers[0] || team.players[0];
    used.add(pit.id);
    return pit;
  };

  for (const pos of FIELD) {
    const pl = take(pos);
    assigned.push(gp(pl, -1, pos));
  }
  const dhPlayer = take("DH");
  const dh = gp(dhPlayer, -1, "DH");
  assigned.push(dh);

  const byObp = [...assigned].sort((a, b) => {
    const ah = a.player.hit, bh = b.player.hit;
    return ((bh.h + bh.bb + bh.hbp) / Math.max(1, bh.pa)) - ((ah.h + ah.bb + ah.hbp) / Math.max(1, ah.pa));
  });
  const byPow = [...assigned].sort((a, b) => {
    const ah = a.player.hit, bh = b.player.hit;
    return (bh.hr + bh.d * 0.3) / Math.max(1, bh.pa) - (ah.hr + ah.d * 0.3) / Math.max(1, ah.pa);
  });
  const lineup: GamePlayer[] = [];
  const taken = new Set<number>();
  const takeInto = (gp0: GamePlayer | undefined) => {
    if (!gp0 || taken.has(gp0.player.id) || lineup.length >= 9) return;
    taken.add(gp0.player.id);
    gp0.battingOrder = lineup.length;
    lineup.push(gp0);
  };
  takeInto(byObp[0]);
  takeInto(byObp[1]);
  takeInto(byPow[0]);
  takeInto(byPow[1]);
  for (const c of byObp) takeInto(c);
  for (const c of assigned) takeInto(c);
  while (lineup.length < 9) {
    const p = team.players[lineup.length % team.players.length];
    const extra = gp(p, lineup.length, "DH");
    extra.battingOrder = lineup.length;
    lineup.push(extra);
  }

  const starters = pitchers.filter((p) => p.pit.gs > 0).slice(0, 5);
  const restP = pitchers.filter((p) => !starters.includes(p) || p.twoWay);
  const rotationPool = starters.length ? starters : pitchers.slice(0, 5);
  const startP = rotationPool[starterIndex % Math.max(1, rotationPool.length)] || pitchers[0] || team.players[0];
  const pitcher = gp(startP, -1, "P");
  pitcher.entered = true;

  const bullpen: GamePlayer[] = [];
  const seenP = new Set<number>([startP.id]);
  const closer = [...pitchers].sort((a, b) => b.pit.sv - a.pit.sv || a.pit.era - b.pit.era)[0];
  for (const p of [closer, ...restP, ...pitchers]) {
    if (!p || seenP.has(p.id)) continue;
    seenP.add(p.id);
    bullpen.push(gp(p, -1, "BENCH"));
  }

  const bench: GamePlayer[] = [];
  for (const p of team.players) {
    if (used.has(p.id) || p.id === startP.id) continue;
    if (p.isPitcher && !p.twoWay) continue;
    bench.push(gp(p, -1, "BENCH"));
  }

  const defMap = {} as SideState["defense"];
  for (const g of assigned) {
    if (g.fieldPos !== "DH" && g.fieldPos !== "BENCH" && g.fieldPos !== "P") {
      defMap[g.fieldPos as keyof SideState["defense"]] = g;
    }
  }
  defMap.P = pitcher;

  return {
    team,
    lineup,
    defense: defMap,
    bench,
    bullpen,
    rotation: rotationPool.map((p, i) => gp(p, -1, i === starterIndex % rotationPool.length ? "P" : "BENCH")),
    pitcher,
    dh,
    batterIndex: 0,
    runs: 0,
    hits: 0,
    errors: 0,
    lob: 0,
    innings: [],
  };
}

export function dueUp(side: SideState): GamePlayer[] {
  const out: GamePlayer[] = [];
  for (let i = 0; i < 3; i++) out.push(side.lineup[(side.batterIndex + i) % 9]);
  return out;
}

export function fielderAt(side: SideState, pos: keyof SideState["defense"]): GamePlayer {
  return side.defense[pos];
}
