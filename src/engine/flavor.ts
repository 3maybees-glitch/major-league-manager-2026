import { pick } from "./log5";
import type { Outcome, PlayResult } from "./types";

const HIT_LINE: Record<string, string[]> = {
  "1B": [
    "A sharp single to",
    "Looped a single into",
    "Blooped one into",
    "Ripped a single through",
    "Punched a single to",
    "A seeing-eye single toward",
  ],
  "2B": [
    "Ripped down the line in",
    "Lashed a two-bagger to",
    "Split the gap in",
    "A long double off the wall in",
    "Drove one into the corner in",
  ],
  "3B": [
    "Rattled around in",
    "A triple into the gap in",
    "Chased it into the corner in",
  ],
  HR: [
    "Crushed a moon-shot to",
    "Parked one deep in",
    "A towering drive to",
    "Dialed long-distance to",
    "Swatted a big fly to",
  ],
};

const OUT_LINE: Record<string, string[]> = {
  GO: [
    "A roller near",
    "A slow chopper to",
    "A two-hopper to",
    "A worm-killer toward",
    "Tapped one to",
    "A comebacker near",
  ],
  FO: [
    "A short fly to",
    "Lifted a fly ball to",
    "A long fly toward",
    "Flied out to",
  ],
  LO: [
    "A liner at",
    "Lined one at",
    "A sinking liner to",
  ],
  PO: [
    "Popped it up near",
    "A pop-fly to",
    "Popped foul toward",
  ],
};

const FIELD_NAME: Record<string, string> = {
  P: "the mound",
  C: "the catcher",
  "1B": "first base",
  "2B": "second",
  "3B": "third",
  SS: "shortstop",
  LF: "left field",
  CF: "center field",
  RF: "right field",
};

const FIELD_SHORT: Record<string, string> = {
  P: "PITCHER",
  C: "CATCHER",
  "1B": "FIRST BASE",
  "2B": "SECOND",
  "3B": "THIRD",
  SS: "SHORTSTOP",
  LF: "LEFT FIELD",
  CF: "CENTER FIELD",
  RF: "RIGHT FIELD",
};

function dist(outcome: Outcome): string {
  if (outcome === "HR") return "LONG";
  if (outcome === "3B") return "LONG";
  if (outcome === "2B") return Math.random() < 0.45 ? "LONG" : "MEDIUM";
  if (outcome === "1B") return pick(["SHORT", "MEDIUM", "MEDIUM"]);
  if (outcome === "FO") return pick(["SHORT", "MEDIUM", "LONG"]);
  return "";
}

export function describe(
  outcome: Outcome,
  loc: PlayResult["loc"] | undefined,
  fielder: string | undefined
): { text: string[]; result: string } {
  const place = loc ? FIELD_NAME[loc] : "the outfield";
  const tag = loc ? FIELD_SHORT[loc] : "";
  const who = fielder || "the fielder";

  if (outcome === "K") {
    return {
      text: [pick(["Took a called third strike", "Swung through a high heater", "Chased one in the dirt", "Fanned on a breaking ball"])],
      result: pick(["STRIKEOUT", "STRUCK HIM OUT", "WHIFF"]),
    };
  }
  if (outcome === "BB") {
    return {
      text: [pick(["Worked a full-count walk", "Four wide ones", "Laid off a close pitch"])],
      result: "WALK",
    };
  }
  if (outcome === "IBB") {
    return { text: ["Pitcher puts him on"], result: "INTENTIONAL WALK" };
  }
  if (outcome === "HBP") {
    return { text: [pick(["Plunked on the elbow", "Nicked on the jersey"])], result: "HIT BY PITCH" };
  }
  if (outcome === "SB") {
    return { text: ["Breaks for the next bag"], result: "STOLEN BASE" };
  }
  if (outcome === "CS") {
    return { text: ["Throw is there in time"], result: "CAUGHT STEALING" };
  }
  if (outcome === "WP") {
    return { text: ["The pitch skips away"], result: "WILD PITCH" };
  }
  if (outcome === "PB") {
    return { text: ["It gets past the catcher"], result: "PASSED BALL" };
  }
  if (outcome === "SAC") {
    return {
      text: [`Squared and dropped one toward ${place}`, `${who} takes the sure out`],
      result: "SACRIFICE BUNT",
    };
  }
  if (outcome === "SF") {
    return {
      text: [`A sacrifice fly to ${place}`, `${who} makes the catch`],
      result: `SAC FLY ${tag}`,
    };
  }
  if (outcome === "GIDP") {
    return {
      text: [`A tailor-made double-play ball to ${place}`, `${who} starts two`],
      result: "DOUBLE PLAY",
    };
  }
  if (outcome === "FC") {
    return {
      text: [`A hopper to ${place}`, `${who} takes the lead runner`],
      result: "FIELDER'S CHOICE",
    };
  }
  if (outcome === "ROE") {
    return {
      text: [`A playable ball to ${place}`, `${who} boots it`],
      result: "REACHED ON ERROR",
    };
  }
  if (outcome === "HR") {
    const d = dist("HR");
    return {
      text: [`${pick(HIT_LINE.HR)} ${place}`, "It's out of here"],
      result: `${d} HOME RUN`.trim(),
    };
  }
  if (outcome === "1B" || outcome === "2B" || outcome === "3B") {
    const label = outcome === "1B" ? "SINGLE" : outcome === "2B" ? "DOUBLE" : "TRIPLE";
    const d = dist(outcome);
    const chase = pick([
      `${who} gives chase`,
      `${who} cuts it off`,
      `It finds grass in ${place}`,
    ]);
    return {
      text: [`${pick(HIT_LINE[outcome])} ${place}`, chase],
      result: `${d} ${label}`.trim(),
    };
  }
  if (outcome === "GO" || outcome === "FO" || outcome === "LO" || outcome === "PO") {
    const kind =
      outcome === "GO" ? "GROUNDOUT" :
      outcome === "FO" ? "FLYOUT" :
      outcome === "LO" ? "LINEOUT" : "POP-UP";
    const d = dist(outcome === "FO" ? "FO" : "1B");
    return {
      text: [
        `${pick(OUT_LINE[outcome])} ${place}`,
        `${who} ${outcome === "GO" ? "gets the out" : "makes the play"}`,
      ],
      result: `${d ? d + " " : ""}${kind} ${tag}`.trim(),
    };
  }
  return { text: ["Play over"], result: outcome };
}

export function locFromOut(kind: "GO" | "FO" | "LO" | "PO"): PlayResult["loc"] {
  if (kind === "GO") return pick(["P", "C", "1B", "2B", "3B", "SS", "SS", "2B"]);
  if (kind === "PO") return pick(["P", "C", "1B", "3B", "SS"]);
  if (kind === "LO") return pick(["1B", "2B", "3B", "SS", "P", "LF", "CF", "RF"]);
  return pick(["LF", "CF", "RF", "LF", "CF"]);
}

export function locFromHit(kind: "1B" | "2B" | "3B" | "HR"): PlayResult["loc"] {
  if (kind === "HR") return pick(["LF", "CF", "RF", "LF", "RF"]);
  if (kind === "3B") return pick(["RF", "CF", "LF"]);
  if (kind === "2B") return pick(["LF", "CF", "RF", "LF", "RF"]);
  return pick(["1B", "2B", "3B", "SS", "LF", "CF", "RF", "LF"]);
}
