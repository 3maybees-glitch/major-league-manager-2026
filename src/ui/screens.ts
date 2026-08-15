import { aiDefenseIbb, aiOffense, aiRelieve, aiShouldRelieve } from "../engine/ai";
import {
  boxPages, changePitcher, defenseOf, fmtIp, gameTimeLabel,
  isUserDefense, isUserOffense, newGame, offenseOf, pinchHit, pinchRun, playPA,
} from "../engine/game";
import { loadRosters, touchCustomId } from "../engine/frontOffice";
import {
  daysUntilRefresh, loadOfficialLive, loadStatsMeta, markAttempt, pullWeeklyStats,
  recentFailedAttempt, statsAreStale, type StatsMeta,
} from "../engine/liveStats";
import { leagueRates, loadTeams } from "../engine/roster";
import {
  applyGameToSeason, gb, harvestStats, loadSeason, newSeason,
  nextUserGames, pct, saveSeason, simOneGame,
} from "../engine/season";
import type {
  Database, GamePlayer, GameState, LeagueRates, OffCmd, Player, SeasonSave, Team,
} from "../engine/types";
import { BLK, BRN, CYN, GRN, LGN, LGY, MAG, RED, Terminal, WHT, YEL } from "./cga";
import { drawField, drawHelp } from "./field";
import { drawGm, gmKey, isGmMode } from "./gm";

export type Mode =
  | "title"
  | "menu"
  | "pickAway"
  | "pickHome"
  | "pickMgr"
  | "lineup"
  | "field"
  | "help"
  | "pause"
  | "box"
  | "livebox"
  | "seasonHub"
  | "pickSeasonTeam"
  | "standings"
  | "leaders"
  | "stats"
  | "config"
  | "confirm"
  | "roster"
  | "pickReliever"
  | "pickPinch"
  | "pickRunner"
  | "pickAlign"
  | "gmHub"
  | "gmPickTeam"
  | "gmRoster"
  | "gmCard"
  | "gmTradePickB"
  | "gmCreate"
  | "gmEdit";

export class App {
  t: Terminal;
  db: Database;
  teams: Team[];
  league: LeagueRates;
  mode: Mode = "title";
  back: Mode = "menu";
  season: SeasonSave | null = null;
  game: GameState | null = null;
  away: Team | null = null;
  home: Team | null = null;
  mgr: GameState["userManages"] = "home";
  listIndex = 0;
  boxPage = 0;
  status = "";
  delayHandle = 0;
  execBlank = false;
  autoDelay = 7000;
  music = true;
  textOn = true;
  seasonPlay = false;
  confirmMsg = "";
  confirmYes: (() => void) | null = null;
  pickKind: "rel" | "ph" | "pr" = "rel";
  pickList: GamePlayer[] = [];
  leaderKind: "avg" | "hr" | "rbi" | "era" | "so" | "w" = "avg";
  gmPurpose: "view" | "tradeA" | "createOn" | "claim" = "view";
  gmTeam: Team | null = null;
  gmTeamB: Team | null = null;
  gmPlayer: Player | null = null;
  gmPlayerB: Player | null = null;
  form: { key: string; label: string; value: string }[] = [];
  formIndex = 0;
  statsMeta: StatsMeta;
  statsBusy = false;
  statsProgress = "";

  constructor(t: Terminal, db: Database) {
    this.t = t;
    this.db = db;
    this.teams = loadRosters() || loadOfficialLive() || loadTeams(db);
    touchCustomId(this.teams);
    this.league = leagueRates(db);
    this.season = loadSeason();
    this.statsMeta = loadStatsMeta(db.fetched);
  }

  reloadOfficial(): Team[] {
    return loadOfficialLive() || loadTeams(this.db);
  }

  start() {
    this.draw();
    if (statsAreStale(this.statsMeta)) this.refreshStats(false);
  }

  async refreshStats(force: boolean) {
    if (this.statsBusy) return;
    if (!force && !statsAreStale(this.statsMeta)) {
      this.status = `Stats are current. Next pull in ${daysUntilRefresh(this.statsMeta)} day(s).`;
      return;
    }
    if (!force && recentFailedAttempt()) {
      this.status = "Last stats pull failed — will try again later.";
      return;
    }
    markAttempt();
    this.statsBusy = true;
    this.statsProgress = "Contacting MLB Stats API…";
    this.draw();
    try {
      const { teams, league, meta } = await pullWeeklyStats(this.teams, (done, total, abbr) => {
        this.statsProgress = `Updating ${abbr}  (${done}/${total})`;
        this.draw();
      });
      this.teams = teams;
      this.league = league;
      this.statsMeta = meta;
      this.db = { ...this.db, fetched: meta.fetched, source: meta.source };
      this.status = `Stats updated ${meta.fetched.slice(0, 10)}  ·  ${meta.players} players`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network error";
      this.status = `Stats pull failed — using last snapshot. (${msg})`;
    } finally {
      this.statsBusy = false;
      this.statsProgress = "";
      this.draw();
    }
  }

  key(k: string) {
    if (isGmMode(this.mode)) {
      const cmd = k.length === 1 ? k.toUpperCase() : k;
      gmKey(this, cmd, k);
      this.draw();
      return;
    }
    const key = k.length === 1 ? k.toUpperCase() : k;
    if (this.mode === "field" && this.game && !this.game.over) {
      this.fieldKey(key);
      return;
    }
    switch (this.mode) {
      case "title":
        this.mode = "menu";
        break;
      case "menu":
        this.menuKey(key);
        break;
      case "pickAway":
      case "pickHome":
      case "pickSeasonTeam":
        this.pickTeamKey(key);
        break;
      case "pickMgr":
        this.mgrKey(key);
        break;
      case "lineup":
        if (key === "Enter" || key === " " || key === "P") this.playBall();
        else if (key === "Escape" || key === "Q") this.mode = "menu";
        break;
      case "help":
        this.mode = this.game && !this.game.over ? "field" : "menu";
        break;
      case "pause":
        this.mode = "field";
        this.armDelay();
        break;
      case "box":
        this.boxKey(key);
        break;
      case "livebox":
        this.mode = "field";
        this.armDelay();
        break;
      case "seasonHub":
        this.seasonKey(key);
        break;
      case "standings":
        this.mode = this.back;
        break;
      case "leaders":
        this.leaderKey(key);
        break;
      case "config":
        this.configKey(key);
        break;
      case "confirm":
        if (key === "Y") {
          this.confirmYes?.();
          this.confirmYes = null;
        } else {
          this.mode = this.back;
        }
        break;
      case "roster":
        this.mode = this.back;
        break;
      case "stats":
        this.mode = this.back;
        break;
      case "pickReliever":
      case "pickPinch":
      case "pickRunner":
        this.pickPlayerKey(key);
        break;
      case "pickAlign":
        this.alignKey(key);
        break;
    }
    this.draw();
  }

  menuKey(key: string) {
    if (key === "1") {
      this.seasonPlay = false;
      this.listIndex = 0;
      this.mode = "pickAway";
    } else if (key === "2") {
      this.mode = "seasonHub";
    } else if (key === "3") {
      this.back = "menu";
      this.mode = "standings";
    } else if (key === "4") {
      this.mode = "config";
    } else if (key === "5") {
      this.back = "menu";
      this.mode = "leaders";
    } else if (key === "6") {
      this.status = "";
      this.mode = "gmHub";
    } else if (key === "H") {
      this.back = "menu";
      this.mode = "help";
    } else if (key === "0" || key === "Q") {
      this.status = "Close the browser tab to exit.";
    }
  }

  pickTeamKey(key: string) {
    const n = this.teams.length;
    if (key === "ArrowDown" || key === "J") this.listIndex = (this.listIndex + 1) % n;
    else if (key === "ArrowUp" || key === "K") this.listIndex = (this.listIndex + n - 1) % n;
    else if (key === "PageDown") this.listIndex = Math.min(n - 1, this.listIndex + 15);
    else if (key === "PageUp") this.listIndex = Math.max(0, this.listIndex - 15);
    else if (key === "Enter" || key === " ") {
      const team = this.teams[this.listIndex];
      if (this.mode === "pickAway") {
        this.away = team;
        this.mode = "pickHome";
      } else if (this.mode === "pickHome") {
        this.home = team;
        this.mode = "pickMgr";
        this.listIndex = 0;
      } else {
        this.season = newSeason(this.teams, team.abbr);
        saveSeason(this.season);
        this.mode = "seasonHub";
      }
    } else if (key === "Escape" || key === "Q") {
      this.mode = this.mode === "pickHome" ? "pickAway" : "menu";
    } else if (/^[A-Z]$/.test(key)) {
      const i = this.teams.findIndex((tm, idx) => idx > this.listIndex && tm.loc.toUpperCase().startsWith(key));
      const j = this.teams.findIndex((tm) => tm.loc.toUpperCase().startsWith(key));
      if (i >= 0) this.listIndex = i;
      else if (j >= 0) this.listIndex = j;
    }
  }

  mgrKey(key: string) {
    if (key === "1") this.mgr = "home";
    else if (key === "2") this.mgr = "away";
    else if (key === "3") this.mgr = "both";
    else if (key === "4") this.mgr = "none";
    else if (key === "Enter" || key === " ") {
      this.mode = "lineup";
      return;
    } else if (key === "Escape") {
      this.mode = "pickHome";
      return;
    } else return;
    this.mode = "lineup";
  }

  playBall() {
    if (!this.away || !this.home) return;
    const aSt = this.season && this.away.abbr === this.season.userTeam ? this.season.rotationSlot : 0;
    const hSt = this.season && this.home.abbr === this.season.userTeam ? this.season.rotationSlot : 0;
    this.game = newGame(this.away, this.home, {
      userManages: this.mgr,
      awayStarter: aSt,
      homeStarter: hSt,
      delayMs: this.autoDelay,
    });
    this.game.music = this.music;
    this.game.textOn = this.textOn;
    this.mode = "field";
    this.armDelay();
  }

  fieldKey(key: string) {
    const g = this.game!;
    if (key === "H") { this.mode = "help"; this.clearDelay(); return; }
    if (key === "E") { this.mode = "pause"; this.clearDelay(); return; }
    if (key === "M") { g.music = !g.music; this.music = g.music; return; }
    if (key === "T") { g.textOn = !g.textOn; this.textOn = g.textOn; return; }
    if (key === "L") { this.mode = "livebox"; this.clearDelay(); return; }
    if (key === "Q" || key === "Escape") {
      this.back = "field";
      this.confirmMsg = "Quit this game?  (Y/N)";
      this.confirmYes = () => {
        this.clearDelay();
        this.game = null;
        this.mode = this.seasonPlay ? "seasonHub" : "menu";
      };
      this.mode = "confirm";
      this.clearDelay();
      return;
    }
    if (g.over) {
      this.gotoBox();
      return;
    }

    const userOff = isUserOffense(g);
    const userDef = isUserDefense(g);

    if (key === " " || key === "Enter") {
      this.takePitch("swing");
      return;
    }
    if (userOff && key === "B") { this.takePitch("bunt"); return; }
    if (userOff && key === "S") { this.takePitch("steal"); return; }
    if (userOff && key === "U") { this.takePitch("hitrun"); return; }
    if (userOff && key === "P") { this.openPinch(); return; }
    if (userOff && key === "R") { this.openRunner(); return; }
    if (userDef && key === "I") { this.takePitch("ibb"); return; }
    if (userDef && key === "O") { g.pitchAround = true; this.takePitch("swing"); return; }
    if (userDef && key === "G") { this.openBullpen(); return; }
    if (userDef && key === "D") { this.mode = "pickAlign"; this.clearDelay(); return; }
    if (key === "W") { this.takePitch("swing"); return; }
  }

  openBullpen() {
    const g = this.game!;
    this.pickList = defenseOf(g).bullpen.filter((p) => p.player.isPitcher || p.player.twoWay);
    this.pickKind = "rel";
    this.listIndex = 0;
    this.mode = "pickReliever";
    this.clearDelay();
  }
  openPinch() {
    const g = this.game!;
    this.pickList = offenseOf(g).bench.filter((p) => !p.player.isPitcher || p.player.twoWay);
    this.pickKind = "ph";
    this.listIndex = 0;
    this.mode = "pickPinch";
    this.clearDelay();
  }
  openRunner() {
    const g = this.game!;
    if (!g.bases.some(Boolean)) { this.status = "No runner to replace."; return; }
    this.pickList = offenseOf(g).bench.filter((p) => !p.player.isPitcher);
    this.pickKind = "pr";
    this.listIndex = 0;
    this.mode = "pickRunner";
    this.clearDelay();
  }

  pickPlayerKey(key: string) {
    const n = this.pickList.length;
    if (!n) {
      if (key) { this.mode = "field"; this.armDelay(); }
      return;
    }
    if (key === "ArrowDown" || key === "J") this.listIndex = (this.listIndex + 1) % n;
    else if (key === "ArrowUp" || key === "K") this.listIndex = (this.listIndex + n - 1) % n;
    else if (key === "Escape") { this.mode = "field"; this.armDelay(); }
    else if (key === "Enter" || key === " ") {
      const g = this.game!;
      const who = this.pickList[this.listIndex];
      if (this.pickKind === "rel") changePitcher(g, who);
      else if (this.pickKind === "ph") pinchHit(g, who);
      else {
        const base = (g.bases[2] ? 2 : g.bases[1] ? 1 : 0) as 0 | 1 | 2;
        pinchRun(g, who, base);
      }
      this.mode = "field";
      this.armDelay();
    }
  }

  alignKey(key: string) {
    const g = this.game!;
    if (key === "1") g.align = "regular";
    else if (key === "2") g.align = "in";
    else if (key === "3") g.align = "back";
    else if (key === "4") g.align = "corners";
    this.mode = "field";
    this.armDelay();
  }

  takePitch(cmd: OffCmd) {
    const g = this.game!;
    this.clearDelay();
    if (isUserDefense(g) === false && aiShouldRelieve(g)) aiRelieve(g);
    if (isUserDefense(g) === false && aiDefenseIbb(g) && cmd === "swing") cmd = "ibb";
    if (isUserOffense(g) === false && cmd === "swing") cmd = aiOffense(g, this.league);
    playPA(g, this.league, cmd);
    if (g.over) {
      this.finishGame();
      return;
    }
    this.armDelay();
  }

  finishGame() {
    const g = this.game!;
    if (this.season && this.seasonPlay) {
      harvestStats(this.season, g);
      applyGameToSeason(this.season, g.visitor.team.abbr, g.home.team.abbr, g.visitor.runs, g.home.runs);
      const slot = this.season.schedule.find((x) => !x.played && x.home === g.home.team.abbr && x.away === g.visitor.team.abbr);
      if (slot) {
        slot.played = true;
        slot.aw = g.visitor.runs;
        slot.hw = g.home.runs;
      }
      if (g.home.team.abbr === this.season.userTeam || g.visitor.team.abbr === this.season.userTeam) {
        this.season.rotationSlot = (this.season.rotationSlot + 1) % 5;
      }
      saveSeason(this.season);
    }
    this.gotoBox();
  }

  gotoBox() {
    this.clearDelay();
    this.boxPage = 0;
    this.mode = "box";
  }

  boxKey(key: string) {
    if (key === "Escape" || key === "Q") {
      this.game = null;
      this.mode = this.seasonPlay ? "seasonHub" : "menu";
      return;
    }
    this.boxPage++;
    if (this.boxPage > 4) {
      this.game = null;
      this.mode = this.seasonPlay ? "seasonHub" : "menu";
    }
  }

  seasonKey(key: string) {
    if (key === "1") {
      if (!this.season) {
        this.listIndex = 0;
        this.mode = "pickSeasonTeam";
        return;
      }
      this.startNextSeasonGame();
    } else if (key === "2") {
      this.listIndex = 0;
      this.confirmMsg = "Start a NEW season? Old save will be erased. (Y/N)";
      this.back = "seasonHub";
      this.confirmYes = () => {
        this.listIndex = 0;
        this.mode = "pickSeasonTeam";
      };
      this.mode = "confirm";
    } else if (key === "3") {
      this.back = "seasonHub";
      this.mode = "standings";
    } else if (key === "4") {
      this.back = "seasonHub";
      this.mode = "leaders";
    } else if (key === "5") {
      this.simSeasonDay();
    } else if (key === "6") {
      this.simUntilUser();
    } else if (key === "0" || key === "Q" || key === "Escape") {
      this.mode = "menu";
    }
  }

  startNextSeasonGame() {
    if (!this.season) return;
    const next = nextUserGames(this.season, 1)[0];
    if (!next) {
      this.status = "Season complete — check standings.";
      return;
    }
    // sim other games on earlier/same day first
    this.simThrough(next.day, next);
    const away = this.teams.find((t) => t.abbr === next.away)!;
    const home = this.teams.find((t) => t.abbr === next.home)!;
    this.away = away;
    this.home = home;
    this.mgr = next.home === this.season.userTeam ? "home" : "away";
    this.seasonPlay = true;
    this.mode = "lineup";
  }

  simThrough(day: number, skip?: { home: string; away: string }) {
    if (!this.season) return;
    for (const g of this.season.schedule) {
      if (g.played) continue;
      if (g.day > day) break;
      if (skip && g.home === skip.home && g.away === skip.away) continue;
      if (g.home === this.season.userTeam || g.away === this.season.userTeam) {
        if (g.day < day) {
          // user missed it — auto sim
        } else continue;
      }
      this.simMarked(g);
    }
    saveSeason(this.season);
  }

  simMarked(g: SeasonSave["schedule"][0]) {
    if (!this.season || g.played) return;
    const away = this.teams.find((t) => t.abbr === g.away)!;
    const home = this.teams.find((t) => t.abbr === g.home)!;
    const sim = simOneGame(away, home, this.league, 0, 0);
    harvestStats(this.season, sim);
    applyGameToSeason(this.season, g.away, g.home, sim.visitor.runs, sim.home.runs);
    g.played = true;
    g.aw = sim.visitor.runs;
    g.hw = sim.home.runs;
  }

  simSeasonDay() {
    if (!this.season) { this.status = "No season yet."; return; }
    const day = this.season.day;
    for (const g of this.season.schedule.filter((x) => x.day === day && !x.played)) {
      this.simMarked(g);
    }
    this.season.day++;
    saveSeason(this.season);
    this.status = `Simulated day ${day}.`;
  }

  simUntilUser() {
    if (!this.season) return;
    const next = nextUserGames(this.season, 1)[0];
    if (!next) { this.status = "No games left."; return; }
    this.simThrough(next.day, next);
    this.season.day = next.day;
    saveSeason(this.season);
    this.status = `Ready: ${next.away} at ${next.home} (Day ${next.day})`;
  }

  leaderKey(key: string) {
    const map: Record<string, typeof this.leaderKind> = {
      "1": "avg", "2": "hr", "3": "rbi", "4": "era", "5": "so", "6": "w",
    };
    if (map[key]) this.leaderKind = map[key];
    else this.mode = this.back;
  }

  configKey(key: string) {
    if (key === "1") this.autoDelay = 2000;
    else if (key === "2") this.autoDelay = 7000;
    else if (key === "3") this.autoDelay = 0;
    else if (key === "4") this.music = !this.music;
    else if (key === "5") this.textOn = !this.textOn;
    else if (key === "6") {
      this.refreshStats(true);
      return;
    } else { this.mode = "menu"; return; }
  }

  armDelay() {
    this.clearDelay();
    const g = this.game;
    if (!g || g.over || this.autoDelay <= 0) return;
    // If computer manages this half, fire sooner
    const cpu = !isUserOffense(g) && !isUserDefense(g);
    const ms = cpu ? Math.min(350, this.autoDelay) : this.autoDelay;
    this.delayHandle = window.setTimeout(() => {
      if (this.mode === "field" && this.game && !this.game.over) {
        this.takePitch("swing");
        this.draw();
      }
    }, ms);
  }

  clearDelay() {
    if (this.delayHandle) {
      clearTimeout(this.delayHandle);
      this.delayHandle = 0;
    }
  }

  draw() {
    const t = this.t;
    if (drawGm(this)) {
      t.paint();
      return;
    }
    switch (this.mode) {
      case "title": this.drawTitle(); break;
      case "menu": this.drawMenu(); break;
      case "pickAway": this.drawTeamPick("SELECT VISITING TEAM"); break;
      case "pickHome": this.drawTeamPick("SELECT HOME TEAM"); break;
      case "pickSeasonTeam": this.drawTeamPick("CHOOSE YOUR CLUB — 2026"); break;
      case "pickMgr": this.drawMgr(); break;
      case "lineup": this.drawLineup(); break;
      case "field":
        if (this.game) drawField(t, this.game);
        break;
      case "help": drawHelp(t); break;
      case "pause":
        t.clear();
        t.writeC(12, "EXECUTIVE PAUSE", YEL);
        t.writeC(14, "(boss-friendly blank screen — hit any key)", LGY);
        break;
      case "box": this.drawBox(); break;
      case "livebox": this.drawLiveBox(); break;
      case "seasonHub": this.drawSeason(); break;
      case "standings": this.drawStandings(); break;
      case "leaders": this.drawLeaders(); break;
      case "config": this.drawConfig(); break;
      case "confirm":
        t.clear();
        t.writeC(11, this.confirmMsg, YEL);
        t.writeC(14, "Y = yes     N = no", LGY);
        break;
      case "pickReliever":
      case "pickPinch":
      case "pickRunner":
        this.drawPickPlayer();
        break;
      case "pickAlign": this.drawAlign(); break;
      default:
        t.clear();
        t.writeC(12, this.mode, YEL);
    }
    t.paint();
  }

  drawTitle() {
    const t = this.t;
    t.clear();
    t.boxAscii(8, 1, 64, 22, GRN);
    t.writeC(3, 'Welcome to "Major League Manager"  2026 Edition', LGN);
    t.writeC(5, "THE BIG SHOW", YEL);
    t.writeC(7, "Official 2026 MLB stats  —  all 30 clubs", CYN);
    t.writeC(9, "Made by Maybee Creations", YEL);
    t.writeC(10, "In honor of the 1986 original version", BRN);
    t.writeC(12, "Darren Maybee", LGN);
    t.writeC(13, "with credit towards Bob Gardner", LGY);
    t.writeC(15, this.statsBusy
      ? this.statsProgress
      : `Stats as of ${this.statsMeta.fetched.slice(0, 10)}  ·  weekly auto-update`, CYN);
    t.writeC(17, "Strike any key to step into the show", LGN);
    t.writeC(19, "Log5 pitcher-batter engine  ·  full box scores", LGY);
    t.writeC(20, "Not affiliated with MLB. Stats used for a personal sim.", LGY);
  }

  drawMenu() {
    const t = this.t;
    t.clear();
    t.boxAscii(10, 2, 60, 20, GRN);
    t.writeC(3, "MAJOR LEAGUE MANAGER 2026", YEL);
    t.writeC(4, "The Big Show", LGN);
    t.write(16, 6, "1", YEL); t.write(20, 6, "Play a baseball game   (exhibition)", LGN);
    t.write(16, 8, "2", YEL); t.write(20, 8, "Season  —  The Big Show", LGN);
    t.write(16, 10, "3", YEL); t.write(20, 10, "League standings", LGN);
    t.write(16, 12, "4", YEL); t.write(20, 12, "Change configuration", LGN);
    t.write(16, 14, "5", YEL); t.write(20, 14, "Statistics / leaders", LGN);
    t.write(16, 16, "6", YEL); t.write(20, 16, "Trades / Create / Edit players", LGN);
    t.write(16, 18, "H", YEL); t.write(20, 18, "Help     0  Exit", LGN);
    if (this.statsBusy) t.writeC(22, this.statsProgress, YEL);
    else if (this.status) t.writeC(23, this.status, CYN);
  }

  drawTeamPick(title: string) {
    const t = this.t;
    t.clear();
    t.writeC(0, title, YEL);
    t.writeC(1, "↑↓ move    ENTER select    type a letter to jump    ESC back", LGY);
    const start = Math.max(0, this.listIndex - 10);
    const al = this.teams.filter((x) => x.league === "AL");
    const nl = this.teams.filter((x) => x.league === "NL");
    const col = (arr: Team[], x0: number, y0: number, tag: string) => {
      t.write(x0, y0, tag, CYN);
      arr.forEach((tm, i) => {
        const idx = this.teams.indexOf(tm);
        const sel = idx === this.listIndex;
        t.write(x0, y0 + 1 + i, `${tm.abbr.padEnd(4)} ${tm.loc}`, sel ? YEL : LGN, sel ? BRN : BLK);
      });
    };
    col(al, 8, 3, "AMERICAN LEAGUE");
    col(nl, 44, 3, "NATIONAL LEAGUE");
    const tm = this.teams[this.listIndex];
    t.write(2, 22, `${tm.name}  ·  ${tm.venue}  ·  ${tm.players.length} on the active roster`, CYN);
    t.write(2, 23, `${tm.league} ${tm.division}`, LGY);
    void start;
  }

  drawMgr() {
    const t = this.t;
    t.clear();
    t.writeC(3, "WHO MANAGES THIS GAME?", YEL);
    t.writeC(5, `${this.away?.name}  at  ${this.home?.name}`, LGN);
    t.write(18, 8, "1", YEL); t.write(22, 8, `You manage ${this.home?.nick} (home)`, LGN);
    t.write(18, 10, "2", YEL); t.write(22, 10, `You manage ${this.away?.nick} (visitors)`, LGN);
    t.write(18, 12, "3", YEL); t.write(22, 12, "You manage both clubs", LGN);
    t.write(18, 14, "4", YEL); t.write(22, 14, "Computer vs computer  (watch / quick)", LGN);
    t.writeC(18, "1-4 then the lineup card", LGY);
  }

  drawLineup() {
    const t = this.t;
    t.clear();
    if (!this.away || !this.home) return;
    const preview = newGame(this.away, this.home, { userManages: this.mgr });
    t.writeC(0, "STARTING LINEUPS", YEL);
    const col = (side: typeof preview.home, x: number) => {
      t.write(x, 1, `2026 ${side.team.loc}`, CYN);
      t.write(x, 2, "#  POS  NAME              AVG   HR  RBI", LGY);
      side.lineup.forEach((p, i) => {
        const h = p.player.hit;
        const avg = h.ab ? (h.h / h.ab).toFixed(3).slice(1) : ".000";
        t.write(x, 3 + i, `${String(i + 1).padStart(2)}  ${p.fieldPos.padEnd(3)}  ${p.player.name.slice(0, 16).padEnd(16)} ${avg}  ${String(h.hr).padStart(2)}  ${String(h.rbi).padStart(3)}`, LGN);
      });
      const pit = side.pitcher.player;
      t.write(x, 13, `P   ${pit.name.slice(0, 16)}  ${pit.pit.w}-${pit.pit.l}  ${pit.pit.era.toFixed(2)} ERA`, YEL);
    };
    col(preview.visitor, 0);
    col(preview.home, 41);
    t.writeC(16, `You manage: ${this.mgr === "none" ? "nobody (CPU)" : this.mgr}`, MAG);
    t.writeC(18, "P / ENTER  —  Play ball", YEL);
    t.writeC(19, "Q          —  Back to menu", LGY);
  }

  drawBox() {
    const t = this.t;
    t.clear();
    if (!this.game) return;
    const g = this.game;
    const pages = boxPages(g);
    const red = RED;
    if (this.boxPage === 0) this.drawBatPage(pages.awayBat, red);
    else if (this.boxPage === 1) this.drawBatPage(pages.homeBat, red);
    else if (this.boxPage === 2) this.drawPitPage(pages.awayPit, red);
    else if (this.boxPage === 3) this.drawPitPage(pages.homePit, red);
    else {
      t.write(6, 4, `Game winning RBI - ${g.gwRbi || "NONE"}`, red);
      t.write(18, 7, "  1  2  3  4  5  6  7  8  9", red);
      const line = (y: number, side: typeof g.home) => {
        const cells = [];
        for (let i = 0; i < 9; i++) cells.push(i < side.innings.length ? String(side.innings[i]) : "0");
        t.write(4, y, `2026 ${side.team.loc.padEnd(12)} ${cells.map((c) => c.padStart(2)).join(" ")}   ${String(side.runs).padStart(2)}  ${String(side.hits).padStart(2)}  ${String(side.errors).padStart(2)}`, red);
      };
      t.write(50, 7, "R  HIT ERR", red);
      line(8, g.visitor);
      line(9, g.home);
      let y = 12;
      if (g.hbpNotes.length) {
        t.write(6, y++, `Hit by pitched ball: ${g.hbpNotes.join(", ")}`, red);
      }
      if (g.sacNotes.length) t.write(6, y++, `Sacrifice hits: ${g.sacNotes.join(", ")}`, red);
      if (g.sfNotes.length) t.write(6, y++, `Sacrifice flies: ${g.sfNotes.join(", ")}`, red);
      t.write(6, y + 1, `Time of game ${gameTimeLabel(g)}`, red);
      t.writeC(22, "(Hit any key to proceed)", WHT);
    }
  }

  drawBatPage(pack: ReturnType<typeof boxPages>["awayBat"], fg: number) {
    const t = this.t;
    t.writeC(1, `2026  ${pack.side.team.loc}   ( ${pack.side.runs} )`, fg);
    t.write(4, 3, "NAME            AB  RUNS HITS  2B  3B  HR  RBI  SB  WALK  SO", fg);
    pack.list.forEach((p, i) => {
      const b = p.batting;
      const line =
        `${p.player.last.toUpperCase().padEnd(14)} ${String(b.ab).padStart(3)}  ${String(b.r).padStart(3)}  ${String(b.h).padStart(3)}  ${String(b.d).padStart(3)}  ${String(b.t).padStart(3)}  ${String(b.hr).padStart(3)}  ${String(b.rbi).padStart(3)}  ${String(b.sb).padStart(3)}  ${String(b.bb).padStart(3)}  ${String(b.so).padStart(3)}`;
      t.write(4, 4 + i, line, fg);
    });
    const tot = pack.tot;
    t.write(4, 4 + pack.list.length + 1, "-------------- ---  ---  ---  ---  ---  ---  ---  ---  ---  ---", fg);
    t.write(4, 4 + pack.list.length + 2,
      `TEAM TOTAL     ${String(tot.ab).padStart(3)}  ${String(tot.r).padStart(3)}  ${String(tot.h).padStart(3)}  ${String(tot.d).padStart(3)}  ${String(tot.t).padStart(3)}  ${String(tot.hr).padStart(3)}  ${String(tot.rbi).padStart(3)}  ${String(tot.sb).padStart(3)}  ${String(tot.bb).padStart(3)}  ${String(tot.so).padStart(3)}`, fg);
    t.writeC(23, "(Strike any key to proceed)", WHT);
  }

  drawPitPage(pack: ReturnType<typeof boxPages>["awayPit"], fg: number) {
    const t = this.t;
    t.write(10, 4, "NAME              IP  HITS RUNS  ER  WALK  SO", fg);
    pack.list.forEach((p, i) => {
      const d = p.pitching.decided ? ` (${p.pitching.decided})` : "    ";
      const line = `${p.player.last.toUpperCase().padEnd(12)}${d.padEnd(5)} ${fmtIp(p.pitching.outs).padStart(4)}  ${String(p.pitching.h).padStart(3)}  ${String(p.pitching.r).padStart(3)}  ${String(p.pitching.er).padStart(3)}  ${String(p.pitching.bb).padStart(3)}  ${String(p.pitching.so).padStart(3)}`;
      t.write(10, 6 + i, line, fg);
    });
    const tot = pack.tot;
    t.write(10, 7 + pack.list.length, "---------------------- ----  ---  ---  ---  ---  ---", fg);
    t.write(10, 8 + pack.list.length,
      `TEAM TOTAL            ${fmtIp(tot.outs).padStart(4)}  ${String(tot.h).padStart(3)}  ${String(tot.r).padStart(3)}  ${String(tot.er).padStart(3)}  ${String(tot.bb).padStart(3)}  ${String(tot.so).padStart(3)}`, fg);
    t.writeC(22, "(Strike any key to proceed)", WHT);
  }

  drawLiveBox() {
    if (!this.game) return;
    this.boxPage = 0;
    this.drawBox();
    this.t.writeC(24, "Live card — any key returns to the field", YEL);
  }

  drawSeason() {
    const t = this.t;
    t.clear();
    t.boxAscii(8, 1, 64, 22, GRN);
    t.writeC(2, "THE BIG SHOW  —  2026 SEASON", YEL);
    if (!this.season) {
      t.writeC(8, "No season on disk.", LGY);
      t.writeC(10, "1  Begin a season   (pick your club)", LGN);
      t.writeC(18, "0  Back", LGY);
      return;
    }
    const rec = this.season.standings[this.season.userTeam];
    const next = nextUserGames(this.season, 5);
    const played = this.season.schedule.filter((g) => g.played).length;
    t.writeC(4, `Club: ${this.season.userTeam}    ${rec.w}-${rec.l}    RS ${rec.rs}  RA ${rec.ra}`, LGN);
    t.writeC(5, `Day ${this.season.day}   Games in the books: ${played}`, CYN);
    t.write(14, 7, "1  Play next game", YEL);
    t.write(14, 8, "2  New season", YEL);
    t.write(14, 9, "3  Standings", YEL);
    t.write(14, 10, "4  League leaders  (saved stats)", YEL);
    t.write(14, 11, "5  Simulate one calendar day", YEL);
    t.write(14, 12, "6  Simulate until your next game", YEL);
    t.write(14, 13, "0  Back to menu", YEL);
    t.write(12, 15, "UPCOMING", CYN);
    next.forEach((g, i) => {
      t.write(12, 16 + i, `Day ${String(g.day).padStart(3)}  ${g.away} at ${g.home}`, LGN);
    });
    if (this.status) t.write(8, 22, this.status.slice(0, 62), MAG);
  }

  drawStandings() {
    const t = this.t;
    t.clear();
    t.writeC(0, "2026 STANDINGS", YEL);
    const recs = this.season
      ? this.teams.map((tm) => this.season!.standings[tm.abbr] || { abbr: tm.abbr, w: 0, l: 0, rs: 0, ra: 0 })
      : [];
    const groups = ["AL East", "AL Central", "AL West", "NL East", "NL Central", "NL West"];
    // map team division
    const divOf = (abbr: string) => {
      const tm = this.teams.find((x) => x.abbr === abbr);
      return tm ? `${tm.league} ${tm.division}` : "";
    };
    let col = 0;
    let row = 2;
    groups.forEach((name, gi) => {
      if (gi === 3) { col = 40; row = 2; }
      t.write(col + 1, row, name.toUpperCase(), CYN);
      t.write(col + 1, row + 1, "TEAM   W   L   PCT   GB", LGY);
      const club = this.season
        ? recs.filter((r) => divOf(r.abbr) === name).sort((a, b) => b.w - a.w || a.l - b.l)
        : this.teams.filter((tm) => `${tm.league} ${tm.division}` === name).map((tm) => ({ abbr: tm.abbr, w: 0, l: 0, rs: 0, ra: 0 }));
      const lead = club[0];
      club.forEach((r, i) => {
        t.write(col + 1, row + 2 + i, `${r.abbr.padEnd(5)}${String(r.w).padStart(3)} ${String(r.l).padStart(3)}  ${pct(r)}  ${gb(r, lead)}`, LGN);
      });
      row += 8;
    });
    t.writeC(24, "Any key returns", WHT);
  }

  drawLeaders() {
    const t = this.t;
    t.clear();
    t.writeC(0, "LEAGUE LEADERS  —  1 AVG  2 HR  3 RBI  4 ERA  5 SO  6 W", YEL);
    const kind = this.leaderKind;
    t.writeC(1, `Category: ${kind.toUpperCase()}`, CYN);

    const rows: { name: string; team: string; val: string }[] = [];
    if (this.season && Object.keys(this.season.batting).length) {
      const findTeam = (id: number) => {
        for (const tm of this.teams) {
          const p = tm.players.find((x) => x.id === id);
          if (p) return { p, tm };
        }
        return null;
      };
      if (kind === "avg" || kind === "hr" || kind === "rbi") {
        const list = Object.entries(this.season.batting).map(([id, b]) => {
          const hit = findTeam(Number(id));
          return { id: Number(id), b, hit };
        }).filter((x) => x.hit);
        list.sort((a, b) => {
          if (kind === "hr") return b.b.hr - a.b.hr;
          if (kind === "rbi") return b.b.rbi - a.b.rbi;
          const aa = a.b.ab >= 15 ? a.b.h / a.b.ab : 0;
          const ba = b.b.ab >= 15 ? b.b.h / b.b.ab : 0;
          return ba - aa;
        });
        for (const r of list.slice(0, 20)) {
          const val = kind === "hr" ? String(r.b.hr) : kind === "rbi" ? String(r.b.rbi) : (r.b.ab ? (r.b.h / r.b.ab).toFixed(3) : ".000");
          rows.push({ name: r.hit!.p.name, team: r.hit!.tm.abbr, val });
        }
      } else {
        const list = Object.entries(this.season.pitching).map(([id, p]) => {
          const hit = findTeam(Number(id));
          return { id: Number(id), p, hit };
        }).filter((x) => x.hit);
        list.sort((a, b) => {
          if (kind === "so") return b.p.so - a.p.so;
          if (kind === "w") return b.p.w - a.p.w;
          const ae = a.p.outs >= 9 ? a.p.er / (a.p.outs / 27) : 99;
          const be = b.p.outs >= 9 ? b.p.er / (b.p.outs / 27) : 99;
          return ae - be;
        });
        for (const r of list.slice(0, 20)) {
          const val = kind === "so" ? String(r.p.so) : kind === "w" ? String(r.p.w) : (r.p.outs ? (r.p.er / (r.p.outs / 27)).toFixed(2) : "-");
          rows.push({ name: r.hit!.p.name, team: r.hit!.tm.abbr, val });
        }
      }
    } else {
      // Use real 2026 season stats as the "disk"
      if (kind === "avg" || kind === "hr" || kind === "rbi") {
        const bats: { name: string; team: string; avg: number; hr: number; rbi: number; ab: number }[] = [];
        for (const tm of this.teams) {
          for (const p of tm.players) {
            if (p.hit.ab < 80) continue;
            bats.push({ name: p.name, team: tm.abbr, avg: p.hit.ab ? p.hit.h / p.hit.ab : 0, hr: p.hit.hr, rbi: p.hit.rbi, ab: p.hit.ab });
          }
        }
        bats.sort((a, b) => kind === "hr" ? b.hr - a.hr : kind === "rbi" ? b.rbi - a.rbi : b.avg - a.avg);
        for (const r of bats.slice(0, 20)) {
          rows.push({ name: r.name, team: r.team, val: kind === "hr" ? String(r.hr) : kind === "rbi" ? String(r.rbi) : r.avg.toFixed(3) });
        }
      } else {
        const pits: { name: string; team: string; era: number; so: number; w: number; outs: number }[] = [];
        for (const tm of this.teams) {
          for (const p of tm.players) {
            if (p.pit.outs < 30) continue;
            pits.push({ name: p.name, team: tm.abbr, era: p.pit.era, so: p.pit.so, w: p.pit.w, outs: p.pit.outs });
          }
        }
        pits.sort((a, b) => kind === "so" ? b.so - a.so : kind === "w" ? b.w - a.w : a.era - b.era);
        for (const r of pits.slice(0, 20)) {
          rows.push({ name: r.name, team: r.team, val: kind === "so" ? String(r.so) : kind === "w" ? String(r.w) : r.era.toFixed(2) });
        }
      }
    }
    t.write(8, 3, "   PLAYER                   TM     ", LGY);
    rows.forEach((r, i) => {
      t.write(8, 4 + i, `${String(i + 1).padStart(2)} ${r.name.slice(0, 22).padEnd(22)} ${r.team.padEnd(4)} ${r.val}`, LGN);
    });
    t.writeC(24, "1-6 change category    any other key returns", WHT);
  }

  drawConfig() {
    const t = this.t;
    t.clear();
    t.writeC(3, "CONFIGURATION", YEL);
    t.write(16, 6, "1  Fast delay   (2 seconds)", LGN);
    t.write(16, 8, "2  Classic delay (7 seconds)  [original default]", LGN);
    t.write(16, 10, "3  Manual only  (no auto-swing)", LGN);
    t.write(16, 12, `4  Music  now ${this.music ? "ON" : "OFF"}`, LGN);
    t.write(16, 14, `5  Play text  now ${this.textOn ? "ON" : "OFF"}`, LGN);
    t.write(16, 16, "6  Pull latest MLB stats now", YEL);
    t.writeC(18, this.statsBusy
      ? this.statsProgress
      : `Last pull: ${this.statsMeta.fetched.slice(0, 10)}   next auto in ${daysUntilRefresh(this.statsMeta)} day(s)`, CYN);
    t.writeC(20, `Current delay: ${this.autoDelay === 0 ? "OFF" : this.autoDelay / 1000 + "s"}`, LGY);
    t.writeC(22, "Any other key returns", LGY);
  }

  drawPickPlayer() {
    const t = this.t;
    t.clear();
    const title = this.pickKind === "rel" ? "BULLPEN" : this.pickKind === "ph" ? "PINCH HITTER" : "PINCH RUNNER";
    t.writeC(1, title, YEL);
    if (!this.pickList.length) {
      t.writeC(10, "Nobody available.", LGY);
      t.writeC(12, "Any key returns", WHT);
      return;
    }
    this.pickList.forEach((p, i) => {
      const sel = i === this.listIndex;
      const extra = this.pickKind === "rel"
        ? `${p.player.pit.w}-${p.player.pit.l}  ${p.player.pit.era.toFixed(2)}  ${p.player.pit.sv} SV`
        : `${(p.player.hit.ab ? p.player.hit.h / p.player.hit.ab : 0).toFixed(3)}  ${p.player.hit.hr} HR  SPD ${(p.player.speed * 100).toFixed(0)}`;
      t.write(8, 3 + i, `${p.player.throws}/${p.player.bats}  ${p.player.name.slice(0, 22).padEnd(22)} ${extra}`, sel ? YEL : LGN, sel ? BRN : BLK);
    });
    t.writeC(23, "↑↓  ENTER to select   ESC cancel", LGY);
  }

  drawAlign() {
    const t = this.t;
    t.clear();
    t.writeC(6, "INFIELD ALIGNMENT", YEL);
    t.write(20, 9, "1  Regular", LGN);
    t.write(20, 11, "2  Infield in   (cut the run)", LGN);
    t.write(20, 13, "3  Infield back", LGN);
    t.write(20, 15, "4  Guard the lines", LGN);
  }
}

function DGY() { return 8; }
