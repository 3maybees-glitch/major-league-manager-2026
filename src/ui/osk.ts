/** On-screen keyboard so the 1986 command set works on a phone. */

export type SendKey = (key: string) => void;

type KeyDef = { label: string; key: string; span?: number; kind?: "cmd" | "nav" | "mod" };

const NUM: KeyDef[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((n) => ({
  label: n,
  key: n,
}));

const DEFENSE: KeyDef[] = [
  { label: "D", key: "d", kind: "cmd" },
  { label: "G", key: "g", kind: "cmd" },
  { label: "I", key: "i", kind: "cmd" },
  { label: "O", key: "o", kind: "cmd" },
  { label: "W", key: "w", kind: "cmd" },
];
const OFFENSE: KeyDef[] = [
  { label: "P", key: "p", kind: "cmd" },
  { label: "R", key: "r", kind: "cmd" },
  { label: "B", key: "b", kind: "cmd" },
  { label: "S", key: "s", kind: "cmd" },
  { label: "U", key: "u", kind: "cmd" },
];
const OTHER: KeyDef[] = [
  { label: "L", key: "l", kind: "cmd" },
  { label: "H", key: "h", kind: "cmd" },
  { label: "E", key: "e", kind: "cmd" },
  { label: "M", key: "m", kind: "cmd" },
  { label: "T", key: "t", kind: "cmd" },
  { label: "Y", key: "y", kind: "cmd" },
  { label: "N", key: "n", kind: "cmd" },
  { label: "Q", key: "q", kind: "cmd" },
];

const NAV: KeyDef[] = [
  { label: "ESC", key: "Escape", kind: "nav" },
  { label: "↑", key: "ArrowUp", kind: "nav" },
  { label: "↓", key: "ArrowDown", kind: "nav" },
  { label: "PG↑", key: "PageUp", kind: "nav" },
  { label: "PG↓", key: "PageDown", kind: "nav" },
  { label: "SPACE", key: " ", span: 2, kind: "mod" },
  { label: "ENTER", key: "Enter", span: 2, kind: "mod" },
];

const QWERTY: KeyDef[][] = [
  [..."QWERTYUIOP"].map((c) => ({ label: c, key: c.toLowerCase() })),
  [..."ASDFGHJKL"].map((c) => ({ label: c, key: c.toLowerCase() })),
  [
    { label: "⌫", key: "Backspace", kind: "nav" },
    ...[..."ZXCVBNM"].map((c) => ({ label: c, key: c.toLowerCase() })),
    { label: "ENTER", key: "Enter", span: 2, kind: "mod" },
  ],
];

function prefersOnScreenKeys() {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 900px)").matches;
  const noHover = window.matchMedia("(hover: none)").matches;
  return coarse || noHover || narrow;
}

function btn(def: KeyDef) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `osk-key${def.kind ? ` osk-key--${def.kind}` : ""}`;
  el.textContent = def.label;
  el.dataset.key = def.key;
  if (def.span) el.style.flex = String(def.span);
  el.setAttribute("aria-label", def.label === "⌫" ? "Backspace" : def.label);
  return el;
}

function row(defs: KeyDef[]) {
  const el = document.createElement("div");
  el.className = "osk-row";
  for (const d of defs) el.append(btn(d));
  return el;
}

export function mountOnScreenKeyboard(root: HTMLElement, send: SendKey) {
  let mode: "play" | "type" = "play";
  let open = prefersOnScreenKeys();

  const panel = document.createElement("div");
  panel.className = "osk-panel";
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "On-screen keyboard");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "osk-toggle";
  toggle.setAttribute("aria-expanded", String(open));

  function renderPanel() {
    panel.replaceChildren();
    if (mode === "play") {
      panel.append(
        row(NUM),
        labeled("DEFENSE", DEFENSE),
        labeled("OFFENSE", OFFENSE),
        labeled("OTHER", OTHER),
        row(NAV),
      );
    } else {
      for (const r of QWERTY) panel.append(row(r));
      panel.append(row([{ label: "SPACE", key: " ", span: 6, kind: "mod" }]));
    }
  }

  function labeled(title: string, defs: KeyDef[]) {
    const wrap = document.createElement("div");
    wrap.className = "osk-group";
    const tag = document.createElement("span");
    tag.className = "osk-label";
    tag.textContent = title;
    wrap.append(tag, row(defs));
    return wrap;
  }

  function sync() {
    root.classList.toggle("is-open", open);
    root.hidden = false;
    toggle.textContent = open ? "Hide keys" : "Show keys";
    toggle.setAttribute("aria-expanded", String(open));
    const abc = root.querySelector(".osk-abc") as HTMLButtonElement | null;
    if (abc) abc.textContent = mode === "play" ? "ABC" : "PLAY";
  }

  const abc = document.createElement("button");
  abc.type = "button";
  abc.className = "osk-abc";
  abc.textContent = "ABC";

  const bar = document.createElement("div");
  bar.className = "osk-bar";
  bar.append(toggle, abc);

  root.replaceChildren(bar, panel);
  renderPanel();
  sync();

  toggle.addEventListener("click", () => {
    open = !open;
    sync();
    window.dispatchEvent(new Event("resize"));
  });
  abc.addEventListener("click", () => {
    mode = mode === "play" ? "type" : "play";
    renderPanel();
    sync();
    if (!open) {
      open = true;
      sync();
    }
    window.dispatchEvent(new Event("resize"));
  });

  root.addEventListener("pointerdown", (e) => {
    const target = (e.target as HTMLElement).closest(".osk-key") as HTMLElement | null;
    if (!target?.dataset.key) return;
    e.preventDefault();
    target.classList.add("is-down");
    send(target.dataset.key);
  });
  root.addEventListener("pointerup", () => {
    root.querySelectorAll(".osk-key.is-down").forEach((el) => el.classList.remove("is-down"));
  });
  root.addEventListener("pointercancel", () => {
    root.querySelectorAll(".osk-key.is-down").forEach((el) => el.classList.remove("is-down"));
  });

  return {
    get open() {
      return open;
    },
    setOpen(v: boolean) {
      open = v;
      sync();
    },
  };
}
