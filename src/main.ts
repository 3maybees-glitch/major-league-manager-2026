import db from "./data/mlb2026.json";
import type { Database } from "./engine/types";
import "./styles.css";
import { Terminal } from "./ui/cga";
import { mountOnScreenKeyboard } from "./ui/osk";
import { App } from "./ui/screens";

const canvas = document.getElementById("screen") as HTMLCanvasElement;
const term = new Terminal(canvas);
const app = new App(term, db as unknown as Database);

const LOGICAL_W = 640;
const LOGICAL_H = 400;
const ASPECT = LOGICAL_H / LOGICAL_W;
/** A bit smaller than the old 1040px cap so the CRT fits typical laptop windows. */
const MAX_CSS_W = 860;

function frameSize(el: HTMLElement | null) {
  if (!el) return { x: 40, y: 40 };
  const cs = getComputedStyle(el);
  return {
    x: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth),
    y: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth),
  };
}

function scaleCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const crt = document.getElementById("crt");
  const hint = document.querySelector(".hint") as HTMLElement | null;
  const osk = document.getElementById("osk");
  const frame = frameSize(crt);
  const hintH = hint
    ? hint.getBoundingClientRect().height + parseFloat(getComputedStyle(hint).marginTop || "0")
    : 36;
  const oskH = osk
    ? osk.getBoundingClientRect().height + parseFloat(getComputedStyle(osk).marginTop || "0")
    : 0;
  const gutter = 16;
  const viewW = window.visualViewport?.width ?? window.innerWidth;
  const viewH = window.visualViewport?.height ?? window.innerHeight;
  const availW = viewW - gutter - frame.x;
  const availH = viewH - gutter - frame.y - hintH - oskH;

  let cssW = Math.min(availW, MAX_CSS_W);
  let cssH = cssW * ASPECT;
  if (cssH > availH) {
    cssH = availH;
    cssW = cssH / ASPECT;
  }
  cssW = Math.max(280, Math.floor(cssW));
  cssH = Math.round(cssW * ASPECT);

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = LOGICAL_W * dpr;
  canvas.height = LOGICAL_H * dpr;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  term.cw = LOGICAL_W / 80;
  term.ch = LOGICAL_H / 25;
  app.draw();
}

window.addEventListener("resize", scaleCanvas);
window.visualViewport?.addEventListener("resize", scaleCanvas);
scaleCanvas();
app.start();

window.addEventListener("keydown", (e) => {
  const nav = ["ArrowUp", "ArrowDown", "Enter", "Escape", "PageUp", "PageDown", "Tab", "Backspace"];
  if (e.key === " " || nav.includes(e.key)) e.preventDefault();
  app.key(e.key);
});

function touchish() {
  return window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(hover: none)").matches;
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.focus();
  if (!touchish()) return;
  e.preventDefault();
  app.key(" ");
});
canvas.addEventListener("click", () => canvas.focus());
canvas.tabIndex = 0;
canvas.focus();

const oskRoot = document.getElementById("osk");
if (oskRoot) {
  mountOnScreenKeyboard(oskRoot, (key) => app.key(key));
  requestAnimationFrame(scaleCanvas);
}

// Phones have no keyboard — leave the splash up briefly, then enter the menu.
window.setTimeout(() => {
  if (app.mode === "title") app.key(" ");
}, 1400);
