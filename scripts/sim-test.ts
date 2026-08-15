import db from "../src/data/mlb2026.json";
import { newGame, playPA } from "../src/engine/game";
import { leagueRates, loadTeams } from "../src/engine/roster";
import type { Database } from "../src/engine/types";

const data = db as unknown as Database;
const teams = loadTeams(data);
const league = leagueRates(data);

let runs = 0, games = 0, fail = 0, extras = 0;
const pairings = [
  ["NYY", "BOS"], ["LAD", "SF"], ["CHC", "STL"], ["ATL", "PHI"],
  ["HOU", "TEX"], ["TB", "TOR"], ["CLE", "DET"], ["SD", "AZ"],
];

for (const [a, h] of pairings) {
  const away = teams.find((t) => t.abbr === a)!;
  const home = teams.find((t) => t.abbr === h)!;
  for (let i = 0; i < 8; i++) {
    const g = newGame(away, home, { userManages: "none", delayMs: 0 });
    let n = 0;
    while (!g.over && n++ < 500) playPA(g, league, "swing");
    if (!g.over) { fail++; console.log("STUCK", a, h, g.inning, g.outs, g.visitor.runs, g.home.runs); }
    else {
      games++;
      runs += g.visitor.runs + g.home.runs;
      if (g.inning > 9) extras++;
      console.log(`${a} ${g.visitor.runs} @ ${h} ${g.home.runs}  (${g.inning} inn, ${g.log.length} PA)`);
    }
  }
}
console.log(`\n${games} complete, ${fail} stuck, ${(runs / Math.max(1, games)).toFixed(2)} RPG combined, ${extras} extras`);
