import db from "./data/mlb2026.json";
import type { Database } from "./engine/types";
import "./styles.css";
import { Terminal } from "./ui/cga";
import { App } from "./ui/screens";

const canvas = document.getElementById("screen") as HTMLCanvasElement;
const term = new Terminal(canvas);
const app = new App(term, db as unknown as Database);

function scaleCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = Math.min(window.innerWidth - 48, 1040);
  const cssH = Math.round(cssW * (400 / 640));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = 640 * dpr;
  canvas.height = 400 * dpr;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  term.cw = 640 / 80;
  term.ch = 400 / 25;
  app.draw();
}

window.addEventListener("resize", scaleCanvas);
scaleCanvas();
app.start();

window.addEventListener("keydown", (e) => {
  const nav = ["ArrowUp", "ArrowDown", "Enter", "Escape", "PageUp", "PageDown", "Tab", "Backspace"];
  if (e.key === " " || nav.includes(e.key)) e.preventDefault();
  app.key(e.key);
});

canvas.addEventListener("click", () => canvas.focus());
canvas.tabIndex = 0;
canvas.focus();
