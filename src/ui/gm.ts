import {
  addPlayer, applyEdits, clearRosters, createPlayer, deletePlayer, movePlayer, saveRosters,
  TEMPLATES, trade,
} from "../engine/frontOffice";
import type { CreateSpec } from "../engine/frontOffice";
import type { Hand, Player, Pos, Team } from "../engine/types";
import type { App } from "./screens";
import { BLK, BRN, CYN, GRN, LGN, LGY, MAG, RED, WHT, YEL } from "./cga";

export type GmMode =
  | "gmHub"
  | "gmPickTeam"
  | "gmRoster"
  | "gmCard"
  | "gmTradePickB"
  | "gmCreate"
  | "gmEdit";

export function isGmMode(m: string): m is GmMode {
  return m.startsWith("gm");
}

const POS_CYCLE: Pos[] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "P"];
const HAND_CYCLE: Hand[] = ["R", "L", "S"];

export function gmKey(app: App, key: string, raw: string): boolean {
  if (!isGmMode(app.mode)) return false;
  switch (app.mode) {
    case "gmHub":
      hubKey(app, key);
      break;
    case "gmPickTeam":
      pickTeamKey(app, key);
      break;
    case "gmRoster":
      rosterKey(app, key);
      break;
    case "gmCard":
      cardKey(app, key);
      break;
    case "gmTradePickB":
      pickTeamKey(app, key);
      break;
    case "gmCreate":
    case "gmEdit":
      formKey(app, key, raw);
      break;
  }
  return true;
}

function hubKey(app: App, key: string) {
  if (key === "1") {
    app.gmPurpose = "view";
    app.listIndex = 0;
    app.mode = "gmPickTeam";
  } else if (key === "2") {
    app.gmPurpose = "tradeA";
    app.listIndex = 0;
    app.gmPlayer = null;
    app.gmPlayerB = null;
    app.gmTeam = null;
    app.gmTeamB = null;
    app.mode = "gmPickTeam";
  } else if (key === "3") {
    app.gmPurpose = "createOn";
    app.listIndex = 0;
    app.mode = "gmPickTeam";
  } else if (key === "4") {
    app.gmPurpose = "claim";
    app.listIndex = 0;
    app.mode = "gmPickTeam";
  } else if (key === "5") {
    app.back = "gmHub";
    app.confirmMsg = "Restore official 2026 rosters? Trades and created players go away. (Y/N)";
    app.confirmYes = () => {
      clearRosters();
      app.teams = app.reloadOfficial();
      app.status = "Official 2026 rosters restored.";
      app.mode = "gmHub";
    };
    app.mode = "confirm";
  } else if (key === "0" || key === "Q" || key === "Escape") {
    app.mode = "menu";
  }
}

function pickTeamKey(app: App, key: string) {
  const n = app.teams.length;
  if (key === "ArrowDown" || key === "J") app.listIndex = (app.listIndex + 1) % n;
  else if (key === "ArrowUp" || key === "K") app.listIndex = (app.listIndex + n - 1) % n;
  else if (key === "Escape" || key === "Q") {
    app.mode = app.mode === "gmTradePickB" ? "gmRoster" : "gmHub";
  } else if (key === "Enter" || key === " ") {
    const team = app.teams[app.listIndex];
    if (app.gmPurpose === "claim" && app.gmPlayer) {
      app.status = movePlayer(app.teams, app.gmPlayer.id, team.abbr);
      app.gmPlayer = null;
      app.gmTeam = null;
      app.mode = "gmHub";
      return;
    }
    if (app.mode === "gmTradePickB") {
      app.gmTeamB = team;
      app.listIndex = 0;
      app.mode = "gmRoster";
      return;
    }
    if (app.gmPurpose === "tradeA" && app.gmPlayer) {
      app.gmTeamB = team;
      app.listIndex = 0;
      app.mode = "gmRoster";
      return;
    }
    app.gmTeam = team;
    app.listIndex = 0;
    if (app.gmPurpose === "createOn") {
      startForm(app, null);
      app.mode = "gmCreate";
    } else {
      app.mode = "gmRoster";
    }
  } else if (/^[A-Z]$/.test(key)) {
    const i = app.teams.findIndex((tm, idx) => idx > app.listIndex && tm.loc.toUpperCase().startsWith(key));
    const j = app.teams.findIndex((tm) => tm.loc.toUpperCase().startsWith(key));
    if (i >= 0) app.listIndex = i;
    else if (j >= 0) app.listIndex = j;
  }
}

function rosterOf(app: App): { team: Team; players: Player[] } | null {
  const team = app.mode === "gmRoster" && app.gmPurpose === "tradeA" && app.gmPlayer && app.gmTeamB
    ? app.gmTeamB
    : app.gmTeam;
  if (!team) return null;
  const players = [...team.players].sort((a, b) => {
    if (a.isPitcher !== b.isPitcher) return a.isPitcher ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  return { team, players };
}

function rosterKey(app: App, key: string) {
  const pack = rosterOf(app);
  if (!pack) { app.mode = "gmHub"; return; }
  const { team, players } = pack;
  const n = players.length;
  if (!n) { app.mode = "gmHub"; return; }
  if (key === "ArrowDown" || key === "J") app.listIndex = (app.listIndex + 1) % n;
  else if (key === "ArrowUp" || key === "K") app.listIndex = (app.listIndex + n - 1) % n;
  else if (key === "PageDown") app.listIndex = Math.min(n - 1, app.listIndex + 12);
  else if (key === "PageUp") app.listIndex = Math.max(0, app.listIndex - 12);
  else if (key === "Escape" || key === "Q") {
    if (app.gmPurpose === "tradeA" && app.gmPlayer && app.gmTeamB) {
      app.gmTeamB = null;
      app.mode = "gmTradePickB";
    } else app.mode = "gmHub";
  } else if (key === "Enter" || key === " ") {
    const p = players[app.listIndex];
    if (app.gmPurpose === "tradeA" && !app.gmPlayer) {
      app.gmPlayer = p;
      app.gmTeam = team;
      app.listIndex = 0;
      app.mode = "gmTradePickB";
    } else if (app.gmPurpose === "tradeA" && app.gmPlayer && app.gmTeamB) {
      app.gmPlayerB = p;
      app.back = "gmHub";
      app.confirmMsg = `Trade ${app.gmPlayer.short} (${app.gmTeam?.abbr}) for ${p.short} (${team.abbr})? (Y/N)`;
      app.confirmYes = () => {
        app.status = trade(app.teams, app.gmPlayer!.id, p.id);
        app.gmPlayer = null;
        app.gmPlayerB = null;
        app.gmTeam = null;
        app.gmTeamB = null;
        app.mode = "gmHub";
      };
      app.mode = "confirm";
    } else if (app.gmPurpose === "claim") {
      app.gmPlayer = p;
      app.gmTeam = team;
      app.listIndex = 0;
      app.mode = "gmPickTeam";
    } else {
      app.gmPlayer = p;
      app.gmTeam = team;
      app.mode = "gmCard";
    }
  } else if (key === "C" && app.gmTeam) {
    startForm(app, null);
    app.mode = "gmCreate";
  } else if (key === "N" && app.gmPurpose === "tradeA" && app.gmPlayer && app.gmTeamB) {
    app.back = "gmHub";
    app.confirmMsg = `Send ${app.gmPlayer.short} to ${app.gmTeamB.abbr} for nothing? (Y/N)`;
    app.confirmYes = () => {
      app.status = movePlayer(app.teams, app.gmPlayer!.id, app.gmTeamB!.abbr);
      app.gmPlayer = null;
      app.gmTeam = null;
      app.gmTeamB = null;
      app.mode = "gmHub";
    };
    app.mode = "confirm";
  }
}

function cardKey(app: App, key: string) {
  const p = app.gmPlayer;
  const team = app.gmTeam;
  if (!p || !team) { app.mode = "gmRoster"; return; }
  if (key === "E") {
    startForm(app, p);
    app.mode = "gmEdit";
  } else if (key === "D") {
    app.back = "gmCard";
    app.confirmMsg = `Release ${p.name} from ${team.abbr}? (Y/N)`;
    app.confirmYes = () => {
      app.status = deletePlayer(app.teams, p.id);
      app.gmPlayer = null;
      app.listIndex = 0;
      app.mode = "gmRoster";
    };
    app.mode = "confirm";
  } else if (key === "T") {
    app.gmPurpose = "tradeA";
    app.mode = "gmTradePickB";
    app.listIndex = 0;
  } else if (key === "M") {
    app.gmPurpose = "claim";
    app.listIndex = 0;
    app.mode = "gmPickTeam";
    // after dest team selected we need to claim — handle in pickTeam
  } else {
    app.mode = "gmRoster";
  }
}

interface FormRow { key: keyof CreateSpec | "name"; label: string; value: string }

function startForm(app: App, p: Player | null) {
  const isP = p ? p.isPitcher : false;
  app.formIndex = 0;
  app.form = [
    { key: "name", label: "Name", value: p?.name ?? "Rookie Ballplayer" },
    { key: "pos", label: "Pos", value: p?.pos ?? "RF" },
    { key: "bats", label: "Bats", value: p?.bats ?? "R" },
    { key: "throws", label: "Throws", value: p?.throws ?? "R" },
    { key: "avg", label: "AVG", value: p ? (p.hit.ab ? (p.hit.h / p.hit.ab).toFixed(3) : ".250") : ".265" },
    { key: "hr", label: "HR", value: String(p?.hit.hr ?? 16) },
    { key: "rbi", label: "RBI", value: String(p?.hit.rbi ?? 60) },
    { key: "sb", label: "SB", value: String(p?.hit.sb ?? 8) },
    { key: "bb", label: "BB", value: String(p?.hit.bb ?? 40) },
    { key: "so", label: "SO", value: String(p?.hit.so ?? 95) },
    { key: "era", label: "ERA", value: (p?.pit.era ?? 3.90).toFixed(2) },
    { key: "w", label: "W", value: String(p?.pit.w ?? (isP ? 8 : 0)) },
    { key: "l", label: "L", value: String(p?.pit.l ?? (isP ? 7 : 0)) },
    { key: "sv", label: "SV", value: String(p?.pit.sv ?? 0) },
    { key: "gs", label: "GS", value: String(p?.pit.gs ?? (isP ? 18 : 0)) },
    { key: "k9", label: "K/9", value: p && p.pit.outs ? ((p.pit.so * 27) / p.pit.outs).toFixed(1) : "8.8" },
    { key: "bb9", label: "BB/9", value: p && p.pit.outs ? ((p.pit.bb * 27) / p.pit.outs).toFixed(1) : "3.1" },
  ];
  void isP;
}

function specFromForm(app: App): CreateSpec {
  const g = (k: string) => app.form.find((f) => f.key === k)?.value ?? "";
  const num = (k: string, d: number) => {
    const n = parseFloat(g(k));
    return Number.isFinite(n) ? n : d;
  };
  const posRaw = g("pos").toUpperCase();
  const pos = (POS_CYCLE as string[]).includes(posRaw) ? posRaw as Pos : "DH";
  const bats = (HAND_CYCLE as string[]).includes(g("bats").toUpperCase()) ? g("bats").toUpperCase() as Hand : "R";
  const throws = g("throws").toUpperCase() === "L" ? "L" : "R";
  return {
    name: g("name"),
    pos, bats, throws,
    avg: num("avg", 0.255),
    hr: num("hr", 14),
    rbi: num("rbi", 55),
    sb: num("sb", 6),
    bb: num("bb", 38),
    so: num("so", 95),
    era: num("era", 3.9),
    w: num("w", 8),
    l: num("l", 7),
    sv: num("sv", 0),
    gs: num("gs", pos === "P" ? 18 : 0),
    k9: num("k9", 8.6),
    bb9: num("bb9", 3.1),
  };
}

function formKey(app: App, key: string, raw: string) {
  const row = app.form[app.formIndex];
  if (key === "Escape") {
    app.mode = app.gmTeam ? "gmRoster" : "gmHub";
    return;
  }
  if (key === "ArrowUp" || key === "K" && raw === "ArrowUp") {
    app.formIndex = (app.formIndex + app.form.length - 1) % app.form.length;
    return;
  }
  if (key === "Tab" || key === "Enter" || key === "ArrowDown") {
    if (key === "Enter" && app.formIndex === app.form.length - 1) {
      commitForm(app);
      return;
    }
    app.formIndex = (app.formIndex + 1) % app.form.length;
    return;
  }
  if (key === "F" && raw === "F") {
    commitForm(app);
    return;
  }
  if (/^[1-6]$/.test(key) && app.mode === "gmCreate") {
    const tmpl = TEMPLATES[Number(key) - 1];
    if (tmpl) {
      for (const [k, v] of Object.entries(tmpl.spec)) {
        const f = app.form.find((x) => x.key === k);
        if (f) f.value = String(v);
      }
      app.status = `Template: ${tmpl.name}`;
    }
    return;
  }
  if (!row) return;
  if (row.key === "pos" && (key === " " || key === "ArrowRight")) {
    const i = POS_CYCLE.indexOf(row.value as Pos);
    row.value = POS_CYCLE[(i + 1 + POS_CYCLE.length) % POS_CYCLE.length];
    return;
  }
  if ((row.key === "bats" || row.key === "throws") && (key === " " || key === "ArrowRight")) {
    const cycle = row.key === "bats" ? HAND_CYCLE : (["R", "L"] as Hand[]);
    const i = cycle.indexOf(row.value as Hand);
    row.value = cycle[(i + 1 + cycle.length) % cycle.length];
    return;
  }
  if (key === "Backspace") {
    row.value = row.value.slice(0, -1);
    return;
  }
  if (raw.length === 1 && raw >= " " && raw <= "~") {
    if (row.value.length < 22) row.value += raw;
  }
}

function commitForm(app: App) {
  const spec = specFromForm(app);
  if (app.mode === "gmEdit" && app.gmPlayer) {
    applyEdits(app.gmPlayer, spec);
    saveRosters(app.teams);
    app.status = `${app.gmPlayer.name} ratings updated.`;
    app.mode = "gmCard";
    return;
  }
  const club = app.gmTeam;
  if (!club) { app.mode = "gmHub"; return; }
  const p = createPlayer(spec);
  app.status = addPlayer(app.teams, club.abbr, p);
  app.gmPlayer = p;
  app.mode = "gmCard";
}

export function drawGm(app: App): boolean {
  if (!isGmMode(app.mode)) return false;
  switch (app.mode) {
    case "gmHub": drawHub(app); break;
    case "gmPickTeam":
    case "gmTradePickB":
      app.drawTeamPick(app.mode === "gmTradePickB"
        ? `TRADE — pick the OTHER club${app.gmPlayer ? `  (sending ${app.gmPlayer.short})` : ""}`
        : app.gmPurpose === "createOn" ? "SIGN A PLAYER — pick the club"
        : app.gmPurpose === "claim" ? "CLAIM / ASSIGN — pick the club"
        : app.gmPurpose === "tradeA" ? "TRADE — pick the FIRST club"
        : "OPEN A ROSTER");
      break;
    case "gmRoster": drawRoster(app); break;
    case "gmCard": drawCard(app); break;
    case "gmCreate":
    case "gmEdit":
      drawForm(app);
      break;
  }
  return true;
}

function drawHub(app: App) {
  const t = app.t;
  t.clear();
  t.boxAscii(8, 1, 64, 22, GRN);
  t.writeC(3, "TRADES / CREATE / EDIT PLAYERS", YEL);
  t.writeC(4, "The front office  —  1986 disk option 2", LGY);
  t.write(16, 7, "1", YEL); t.write(20, 7, "Open a roster   (view, edit, release)", LGN);
  t.write(16, 9, "2", YEL); t.write(20, 9, "Make a trade    (1-for-1 or 1-for-none)", LGN);
  t.write(16, 11, "3", YEL); t.write(20, 11, "Create a player and sign him", LGN);
  t.write(16, 13, "4", YEL); t.write(20, 13, "View a roster, then assign elsewhere", LGN);
  t.write(16, 15, "5", YEL); t.write(20, 15, "Restore official 2026 rosters", LGN);
  t.write(16, 18, "0", YEL); t.write(20, 18, "Back to the main menu", LGY);
  if (app.status) t.write(10, 21, app.status.slice(0, 60), CYN);
}

function drawRoster(app: App) {
  const t = app.t;
  t.clear();
  const pack = rosterOf(app);
  if (!pack) return;
  const { team, players } = pack;
  const trading = !!(app.gmPurpose === "tradeA" && app.gmPlayer && app.gmTeamB);
  t.writeC(0, trading
    ? `PICK RETURN FROM ${team.abbr}   (N = send ${app.gmPlayer!.short} for nothing)`
    : `${team.name}  —  ${players.length} men`, YEL);
  t.write(0, 1, "  POS  NAME                 B/T    AVG   HR  RBI   ERA   W-L  SV", LGY);
  const top = Math.max(0, Math.min(app.listIndex - 10, Math.max(0, players.length - 20)));
  const view = players.slice(top, top + 20);
  view.forEach((p, i) => {
    const idx = top + i;
    const sel = idx === app.listIndex;
    const avg = p.hit.ab ? (p.hit.h / p.hit.ab).toFixed(3) : " .---";
    const line = `${p.pos.padEnd(3)}  ${p.name.slice(0, 20).padEnd(20)} ${p.bats}/${p.throws}   ${avg}  ${String(p.hit.hr).padStart(2)}  ${String(p.hit.rbi).padStart(3)}  ${p.isPitcher || p.twoWay ? p.pit.era.toFixed(2) : "    "}  ${p.isPitcher || p.twoWay ? `${p.pit.w}-${p.pit.l}` : "   "}  ${p.pit.sv || ""}`;
    t.write(1, 2 + i, line, sel ? YEL : LGN, sel ? BRN : BLK);
  });
  t.write(0, 23, trading
    ? "ENTER complete trade   N nothing coming back   ESC cancel"
    : "ENTER card   C create on this club   ESC back", CYN);
}

function drawCard(app: App) {
  const t = app.t;
  t.clear();
  const p = app.gmPlayer;
  const team = app.gmTeam;
  if (!p || !team) return;
  t.boxAscii(6, 1, 68, 22, CYN);
  t.writeC(2, p.name.toUpperCase(), YEL);
  t.writeC(3, `${team.abbr}  #${p.jersey || "--"}  ${p.pos}   Bats ${p.bats}  Throws ${p.throws}`, LGN);
  if (p.id >= 9_000_000) t.writeC(4, "(created player)", MAG);
  const h = p.hit;
  const avg = h.ab ? (h.h / h.ab).toFixed(3) : ".000";
  t.write(10, 6, "BATTING", CYN);
  t.write(10, 7, `G ${h.g}   AB ${h.ab}   R ${h.r}   H ${h.h}   2B ${h.d}   3B ${h.t}   HR ${h.hr}`, LGY);
  t.write(10, 8, `RBI ${h.rbi}   BB ${h.bb}   SO ${h.so}   SB ${h.sb}   CS ${h.cs}`, LGY);
  t.write(10, 9, `AVG ${avg}   OBP ${h.obp.toFixed(3)}   SLG ${h.slg.toFixed(3)}   OPS ${h.ops.toFixed(3)}`, YEL);
  const pit = p.pit;
  t.write(10, 11, "PITCHING", CYN);
  t.write(10, 12, `G ${pit.g}   GS ${pit.gs}   W-L ${pit.w}-${pit.l}   SV ${pit.sv}   IP ${pit.ip}`, LGY);
  t.write(10, 13, `H ${pit.h}   ER ${pit.er}   BB ${pit.bb}   SO ${pit.so}   HR ${pit.hr}`, LGY);
  t.write(10, 14, `ERA ${pit.era.toFixed(2)}   WHIP ${pit.whip.toFixed(2)}`, YEL);
  t.write(10, 16, `Speed ${(p.speed * 100).toFixed(0)}   Field ${(p.field * 100).toFixed(0)}   Arm ${(p.arm * 100).toFixed(0)}`, LGN);
  t.write(10, 19, "E edit   D delete/release   T trade him   any other key back", MAG);
}

function drawForm(app: App) {
  const t = app.t;
  t.clear();
  t.writeC(0, app.mode === "gmEdit" ? "EDIT PLAYER" : `CREATE PLAYER  —  ${app.gmTeam?.abbr || ""}`, YEL);
  t.writeC(1, "↑↓ fields   type to edit   SPACE cycles Pos/Bats/Throws   F finish", LGY);
  if (app.mode === "gmCreate") {
    t.write(2, 2, "Templates: 1 Contact  2 Slugger  3 Speed  4 Ace  5 Closer  6 Replacement", CYN);
  }
  app.form.forEach((row, i) => {
    const y = 3 + i;
    const sel = i === app.formIndex;
    t.write(8, y, row.label.padEnd(8), sel ? YEL : LGY);
    t.write(18, y, (row.value || "").padEnd(24), sel ? WHT : LGN, sel ? BRN : BLK);
  });
  t.write(2, 23, "ENTER next field    F save    ESC cancel", MAG);
  if (app.status) t.write(2, 24, app.status.slice(0, 76), CYN);
}

/** Used after picking a dest team while claiming a player already on the card. */
export function finishClaimIfNeeded(app: App) {
  if (app.gmPurpose === "claim" && app.gmPlayer && app.mode === "gmRoster" && app.gmTeam) {
    // opened dest as gmTeam — if we came from card via M, gmPlayer is set
  }
}
export type { FormRow };
