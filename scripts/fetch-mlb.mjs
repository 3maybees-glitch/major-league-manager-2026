/**
 * Pull 2026 MLB active rosters + season stats from the public Stats API
 * and write src/data/mlb2026.json
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "mlb2026.json");
const SEASON = 2026;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "MajorLeagueManager2026/1.0 (personal sim)" },
    });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await sleep(600 * (i + 1));
      continue;
    }
    throw new Error(`${res.status} ${url}`);
  }
  throw new Error(`failed ${url}`);
}

function num(v, d = 0) {
  if (v == null || v === "") return d;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : d;
}

function ipToOuts(ip) {
  if (ip == null || ip === "") return 0;
  const s = String(ip);
  const [w, frac] = s.split(".");
  return parseInt(w || "0", 10) * 3 + parseInt(frac || "0", 10);
}

function parseHitting(stat) {
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

function parsePitching(stat) {
  if (!stat) return null;
  const ip = stat.inningsPitched ?? "0.0";
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

function parseFielding(stat) {
  if (!stat) return null;
  return {
    pos: stat.position?.abbreviation || "",
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

function pickStatGroup(stats, name) {
  if (!Array.isArray(stats)) return null;
  const g = stats.find((s) => s.group?.displayName === name);
  return g?.splits?.[0]?.stat ?? null;
}

function allFielding(stats) {
  if (!Array.isArray(stats)) return [];
  const g = stats.find((s) => s.group?.displayName === "fielding");
  if (!g?.splits) return [];
  return g.splits.map((s) => parseFielding(s.stat)).filter(Boolean);
}

async function main() {
  console.log("Fetching 2026 MLB teams…");
  const teamsJson = await getJson(
    `https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${SEASON}`
  );
  const rawTeams = teamsJson.teams.filter((t) => t.sport?.id === 1);
  rawTeams.sort((a, b) => a.name.localeCompare(b.name));

  const teams = [];
  for (const t of rawTeams) {
    process.stdout.write(`  ${t.abbreviation} ${t.name}… `);
    const rosterUrl =
      `https://statsapi.mlb.com/api/v1/teams/${t.id}/roster?rosterType=active&season=${SEASON}` +
      `&hydrate=person(stats(group=[hitting,pitching,fielding],type=[season],season=${SEASON}))`;
    const rosterJson = await getJson(rosterUrl);
    const players = [];
    for (const slot of rosterJson.roster || []) {
      const p = slot.person;
      const stats = p.stats || [];
      const hitting = parseHitting(pickStatGroup(stats, "hitting"));
      const pitching = parsePitching(pickStatGroup(stats, "pitching"));
      const fielding = allFielding(stats);
      const primary = slot.position?.abbreviation || p.primaryPosition?.abbreviation || "DH";
      players.push({
        id: p.id,
        name: p.fullName,
        last: p.lastName || p.fullName.split(" ").slice(-1)[0],
        first: p.firstName || p.fullName.split(" ")[0],
        bats: p.batSide?.code || "R",
        throws: p.pitchHand?.code || "R",
        pos: primary,
        jersey: slot.jerseyNumber || p.primaryNumber || "",
        hitting,
        pitching,
        fielding,
      });
    }
    teams.push({
      id: t.id,
      name: t.name,
      loc: t.shortName || t.locationName,
      nick: t.teamName,
      abbr: t.abbreviation,
      league: t.league?.name?.includes("American") ? "AL" : "NL",
      division: (t.division?.name || "").replace("American League ", "").replace("National League ", ""),
      venue: t.venue?.name || "",
      city: t.locationName,
      players,
    });
    console.log(`${players.length} players`);
    await sleep(80);
  }

  // League totals from the player pool (used as Log5 priors)
  const lgHit = {
    pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, so: 0, hbp: 0, sf: 0, sac: 0,
    sb: 0, cs: 0, gidp: 0, go: 0, ao: 0, r: 0,
  };
  const lgPit = {
    outs: 0, bf: 0, h: 0, hr: 0, bb: 0, so: 0, hbp: 0, er: 0, r: 0, go: 0, ao: 0,
  };
  for (const team of teams) {
    for (const p of team.players) {
      if (p.hitting && p.hitting.pa > 0) {
        for (const k of Object.keys(lgHit)) lgHit[k] += p.hitting[k] || 0;
      }
      if (p.pitching && p.pitching.bf > 0) {
        for (const k of Object.keys(lgPit)) lgPit[k] += p.pitching[k] || 0;
      }
    }
  }

  const payload = {
    season: SEASON,
    fetched: new Date().toISOString(),
    source: "statsapi.mlb.com",
    league: { hitting: lgHit, pitching: lgPit },
    teams,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload));
  const mb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(1);
  console.log(`Wrote ${OUT} (${mb} KB, ${teams.length} teams)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
