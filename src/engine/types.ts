export type Hand = "L" | "R" | "S";
export type Pos = "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF" | "DH" | "P" | "OF" | "IF" | "UT";

export interface HittingRaw {
  g: number; pa: number; ab: number; r: number; h: number;
  d: number; t: number; hr: number; rbi: number; bb: number; ibb: number;
  so: number; hbp: number; sb: number; cs: number; sf: number; sac: number;
  gidp: number; go: number; ao: number; avg: number; obp: number; slg: number; ops: number;
}

export interface PitchingRaw {
  g: number; gs: number; gf: number; w: number; l: number; sv: number; hld: number;
  ip: string; outs: number; h: number; r: number; er: number; hr: number;
  bb: number; ibb: number; so: number; hbp: number; wp: number; bf: number;
  go: number; ao: number; era: number; whip: number;
}

export interface FieldingRaw {
  pos: string; g: number; gs: number; po: number; a: number; e: number;
  ch: number; fp: number; inn: number; cs: number; sb: number; pb: number;
}

export interface PlayerRaw {
  id: number;
  name: string;
  last: string;
  first: string;
  bats: string;
  throws: string;
  pos: string;
  jersey: string;
  hitting: HittingRaw | null;
  pitching: PitchingRaw | null;
  fielding: FieldingRaw[];
}

export interface TeamRaw {
  id: number;
  name: string;
  loc: string;
  nick: string;
  abbr: string;
  league: "AL" | "NL";
  division: string;
  venue: string;
  city: string;
  players: PlayerRaw[];
}

export interface LeagueRaw {
  hitting: Record<string, number>;
  pitching: Record<string, number>;
}

export interface Database {
  season: number;
  fetched: string;
  source: string;
  league: LeagueRaw;
  teams: TeamRaw[];
}

export interface Player {
  id: number;
  name: string;
  last: string;
  short: string; // D.Jeter
  bats: Hand;
  throws: Hand;
  pos: Pos;
  jersey: string;
  isPitcher: boolean;
  twoWay: boolean;
  hit: HittingRaw;
  pit: PitchingRaw;
  fld: FieldingRaw[];
  speed: number; // 0-1
  arm: number;   // 0-1
  field: number; // 0-1 fielding skill
  catcherArm: number;
}

export interface Team {
  id: number;
  name: string;
  loc: string;
  nick: string;
  abbr: string;
  league: "AL" | "NL";
  division: string;
  venue: string;
  city: string;
  park: number; // HR factor
  players: Player[];
}

export interface LeagueRates {
  k: number; bb: number; hbp: number; hr: number;
  h: number; d: number; t: number; single: number;
  babip: number; go: number; sb: number; cs: number;
  avg: number; obp: number;
}

export type Outcome =
  | "K" | "BB" | "IBB" | "HBP"
  | "1B" | "2B" | "3B" | "HR"
  | "GO" | "FO" | "LO" | "PO"
  | "GIDP" | "FC" | "SF" | "SAC" | "ROE"
  | "CS" | "SB" | "PK" | "WP" | "PB" | "BK";

export interface PlayResult {
  outcome: Outcome;
  text: string[];       // 2 flavor lines
  result: string;       // LONG DOUBLE
  fielder?: string;
  loc?: "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF" | "P" | "C";
  outsOnPlay: number;
  runs: number;
  rbi: number;
  earned: number;
  scored: string[];
  advanced: string[];   // "J.Howell on second"
  error?: boolean;
  dp?: boolean;
}

export interface GamePlayer {
  player: Player;
  battingOrder: number; // 0-8, -1 bench
  fieldPos: Pos | "BENCH";
  batting: {
    ab: number; r: number; h: number; d: number; t: number; hr: number;
    rbi: number; bb: number; so: number; hbp: number; sb: number; cs: number;
    sf: number; sac: number; gidp: number; left: number;
  };
  pitching: {
    outs: number; h: number; r: number; er: number; bb: number; so: number;
    hr: number; hbp: number; wp: number; bf: number; decided?: "W" | "L" | "S" | "H" | "BS";
  };
  entered: boolean;
}

export interface SideState {
  team: Team;
  lineup: GamePlayer[];     // 9 batting slots (may change)
  defense: Record<Exclude<Pos, "DH" | "OF" | "IF" | "UT">, GamePlayer>;
  bench: GamePlayer[];
  bullpen: GamePlayer[];
  rotation: GamePlayer[];
  pitcher: GamePlayer;
  dh: GamePlayer | null;
  batterIndex: number;
  runs: number;
  hits: number;
  errors: number;
  lob: number;
  innings: number[]; // runs per inning
}

export type DefenseAlign = "regular" | "in" | "back" | "corners";

export interface GameState {
  visitor: SideState;
  home: SideState;
  inning: number;
  top: boolean;
  outs: number;
  bases: [GamePlayer | null, GamePlayer | null, GamePlayer | null];
  balls: number;
  strikes: number;
  log: PlayResult[];
  startedAt: number;
  simMinutes: number;
  delayMs: number;
  music: boolean;
  textOn: boolean;
  align: DefenseAlign;
  pitchAround: boolean;
  userManages: "home" | "away" | "both" | "none";
  lastPlay: PlayResult | null;
  over: boolean;
  gwRbi: string | null;
  winner: "home" | "away" | null;
  hbpNotes: string[];
  sacNotes: string[];
  sfNotes: string[];
}

export type OffCmd = "swing" | "bunt" | "steal" | "hitrun" | "pinch" | "pinchrun" | "ibb";
export type DefCmd = "pitch" | "ibb" | "around" | "reliever" | "infield";

export interface SeasonRecord {
  abbr: string;
  w: number;
  l: number;
  rs: number;
  ra: number;
}

export interface SeasonGame {
  day: number;
  away: string;
  home: string;
  played: boolean;
  aw?: number;
  hw?: number;
}

export interface AccumBatting {
  g: number; ab: number; r: number; h: number; d: number; t: number; hr: number;
  rbi: number; bb: number; so: number; hbp: number; sb: number; cs: number; sf: number;
}

export interface AccumPitching {
  g: number; gs: number; w: number; l: number; sv: number;
  outs: number; h: number; r: number; er: number; bb: number; so: number; hr: number;
}

export interface SeasonSave {
  version: 1;
  season: number;
  userTeam: string;
  day: number;
  schedule: SeasonGame[];
  standings: Record<string, SeasonRecord>;
  batting: Record<number, AccumBatting>;
  pitching: Record<number, AccumPitching>;
  rotationSlot: number;
  created: string;
}
