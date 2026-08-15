import { clockTime, due, offenseOf } from "../engine/game";
import type { GamePlayer, GameState, SideState } from "../engine/types";
import { BLK, BRN, CYN, GRN, LGN, LGY, MAG, RED, Terminal, WHT, YEL } from "./cga";

function innLine(side: SideState, thru = 12): string[] {
  const cells: string[] = [];
  for (let i = 0; i < thru; i++) {
    if (i < side.innings.length) cells.push(String(side.innings[i]).padStart(2));
    else cells.push("  ");
  }
  return cells;
}

function pad(s: string, n: number) {
  const t = s.length > n ? s.slice(0, n) : s;
  return t.padEnd(n);
}

export function drawField(t: Terminal, g: GameState) {
  t.clear(LGY, BLK);
  const vis = g.visitor;
  const hom = g.home;
  const off = offenseOf(g);
  const def = g.top ? g.home : g.visitor;
  const batter = off.lineup[off.batterIndex];

  // Scoreboard header
  t.write(0, 0, "Year Team", YEL);
  let x = 16;
  for (let i = 1; i <= 12; i++) {
    t.write(x, 0, String(i).padStart(2), CYN);
    x += 3;
  }
  t.write(x, 0, " R  H  E", CYN);
  t.write(64, 0, "Major League Manager", YEL);

  const drawTeamRow = (y: number, side: SideState, batting: boolean) => {
    const label = `${g.visitor === side ? "2026" : "2026"} ${pad(side.team.loc, 12)}`;
    t.write(0, y, pad(label, 16), batting ? YEL : LGN, batting ? BRN : BLK);
    let cx = 16;
    for (const c of innLine(side)) {
      t.write(cx, y, c, CYN);
      cx += 3;
    }
    t.write(cx, y, String(side.runs).padStart(2), CYN);
    t.write(cx + 3, y, String(side.hits).padStart(2), CYN);
    t.write(cx + 6, y, String(side.errors).padStart(2), CYN);
  };
  drawTeamRow(1, vis, g.top);
  drawTeamRow(2, hom, !g.top);

  t.write(64, 1, `Outs: ${g.outs}   ${clockTime(g)}`, YEL);
  t.write(64, 2, `Music: ${g.music ? "ON" : "OFF"} Text: ${g.textOn ? "ON" : "OFF"}`, YEL);

  const ac = batter.player.hit;
  const cl = batter.batting;
  const acAvg = ac.ab ? (ac.h / ac.ab) : 0;
  const clAvg = cl.ab ? (cl.h / cl.ab) : 0;
  const next = due(g)[1];
  t.write(0, 3, `Up:${pad(batter.player.short, 12)}`, LGN);
  t.write(16, 3, "HR RBI AVG", CYN);
  t.write(28, 3, `AC:${String(ac.hr).padStart(3)}${String(ac.rbi).padStart(4)} ${acAvg.toFixed(3).slice(1)}`, LGN);
  t.write(48, 3, `CL:${String(cl.hr).padStart(2)}${String(cl.rbi).padStart(3)} ${clAvg.toFixed(3).slice(1)}`, MAG);
  t.write(66, 3, `Next:${next ? next.player.short : ""}`, LGN);

  // Diamond asterisks
  const star = (sx: number, sy: number, fg = LGY) => t.put(sx, sy, "*", fg);

  // Outfield arc
  for (const [sx, sy] of [
    [18, 6], [22, 5], [26, 5], [30, 5], [34, 5], [38, 5], [42, 5], [46, 5], [50, 5], [54, 5], [58, 6],
    [16, 7], [14, 8], [13, 9], [14, 10], [16, 11],
    [60, 7], [62, 8], [63, 9], [62, 10], [60, 11],
    [18, 12], [22, 13], [26, 14], [30, 15], [34, 16],
    [58, 12], [54, 13], [50, 14], [46, 15], [42, 16],
    [38, 16], [36, 15], [40, 15],
  ] as [number, number][]) star(sx, sy);

  const place = (sx: number, sy: number, name: string, fg: number, bg = BLK) => {
    t.write(sx, sy, name, fg, bg);
  };

  const f = (pos: keyof SideState["defense"]) => def.defense[pos];
  place(16, 5, f("LF")?.player.short ?? "", GRN);
  place(35, 4, f("CF")?.player.short ?? "", GRN);
  place(54, 5, f("RF")?.player.short ?? "", GRN);
  place(26, 9, f("SS")?.player.short ?? "", GRN);
  place(44, 9, f("2B")?.player.short ?? "", GRN);
  place(14, 12, f("3B")?.player.short ?? "", GRN);
  place(56, 12, f("1B")?.player.short ?? "", GRN);
  place(34, 17, f("C")?.player.short ?? "", GRN);

  const pit = def.pitcher;
  place(30, 13, `${pit.player.name} (${pit.player.throws})`, LGN);

  // Runners
  const basePos: [number, number][] = [
    [52, 12], // 1B
    [36, 7],  // 2B
    [16, 12], // 3B
  ];
  g.bases.forEach((rnr, i) => {
    if (!rnr) return;
    const [bx, by] = basePos[i];
    t.write(bx, by, pad(rnr.player.short, 11), LGN, GRN);
  });

  t.write(2, 15, `Batter: ${batter.player.name}`, BRN);

  // Result boxes
  t.boxAscii(1, 17, 32, 6, CYN);
  t.boxAscii(47, 17, 32, 6, YEL);
  if (g.lastPlay && g.textOn) {
    const p = g.lastPlay;
    t.write(3, 18, (p.text[0] || "").slice(0, 28), LGY);
    t.write(3, 19, (p.text[1] || "").slice(0, 28), LGY);
    t.write(3, 21, p.result.slice(0, 28), YEL);
    const ev = [...p.scored, ...p.advanced].slice(0, 4);
    ev.forEach((line, i) => t.write(49, 18 + i, line.slice(0, 28), LGN));
  } else if (!g.lastPlay) {
    t.write(3, 19, "Play ball!", LGY);
    t.write(49, 19, "Hit SPACE to pitch", LGY);
  }

  t.write(0, 24, "OPTIONS - ", WHT);
  t.write(10, 24, "Defense: D G I O W", LGN);
  t.write(32, 24, "Offense: P R B S U", YEL);
  t.write(54, 24, "Other: L H E M T", MAG);
}

export function drawHelp(t: Terminal) {
  t.clear();
  t.writeC(1, "MAJOR LEAGUE MANAGER 2026 — THE BIG SHOW", YEL);
  t.writeC(2, "Keyboard commands  (original 1986 layout)", LGY);
  const lines: [string, string, number][] = [
    ["SPACE / ENTER", "Swing away  (default after delay)", LGN],
    ["D", "Defense alignment  (regular / in / back)", LGN],
    ["G", "Get a pitcher  (bullpen)", LGN],
    ["I", "Intentional walk", LGN],
    ["O", "Pitch arOund", LGN],
    ["W", "Wait / hold  (then swing)", LGN],
    ["P", "Pinch hitter", YEL],
    ["R", "Pinch runner", YEL],
    ["B", "Bunt", YEL],
    ["S", "Steal", YEL],
    ["U", "Hit and rUn", YEL],
    ["L", "Look at lineup / live box", MAG],
    ["H", "This help", MAG],
    ["E", "Executive pause  (blank the screen)", MAG],
    ["M", "Music on/off", MAG],
    ["T", "Text on/off", MAG],
    ["Q", "Quit the game (confirm)", RED],
  ];
  lines.forEach((row, i) => {
    t.write(12, 4 + i, pad(row[0], 16), row[2]);
    t.write(30, 4 + i, row[1], LGY);
  });
  t.writeC(22, "Front office is menu 6 — trade, create, edit, release", CYN);
  t.writeC(23, "(Strike any key to return)", WHT);
}

export function fieldersList(side: SideState): { pos: string; gp: GamePlayer }[] {
  const order = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "P"] as const;
  return order.map((pos) => ({
    pos,
    gp: pos === "P" ? side.pitcher : pos === "DH" ? side.dh! : side.defense[pos as keyof SideState["defense"]],
  })).filter((x) => x.gp);
}
