/** 80×25 CGA text mode — the original MLM canvas. */

export const COLS = 80;
export const ROWS = 25;

export const CGA = [
  "#000000", "#0000AA", "#00AA00", "#00AAAA",
  "#AA0000", "#AA00AA", "#AA5500", "#AAAAAA",
  "#555555", "#5555FF", "#55FF55", "#55FFFF",
  "#FF5555", "#FF55FF", "#FFFF55", "#FFFFFF",
] as const;

export const BLK = 0, BLU = 1, GRN = 2, CYN = 3, RED = 4, MAG = 5, BRN = 6, LGY = 7;
export const DGY = 8, LBL = 9, LGN = 10, LCY = 11, LRD = 12, LMG = 13, YEL = 14, WHT = 15;

interface Cell { ch: string; fg: number; bg: number }

export class Terminal {
  cells: Cell[];
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cw: number;
  ch: number;
  cursor = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    this.ctx = ctx;
    this.cells = Array.from({ length: COLS * ROWS }, () => ({ ch: " ", fg: LGY, bg: BLK }));
    this.cw = canvas.width / COLS;
    this.ch = canvas.height / ROWS;
  }

  clear(fg = LGY, bg = BLK) {
    for (const c of this.cells) {
      c.ch = " ";
      c.fg = fg;
      c.bg = bg;
    }
    this.cursor = { x: 0, y: 0 };
  }

  at(x: number, y: number): Cell {
    const i = y * COLS + x;
    return this.cells[i] || this.cells[0];
  }

  put(x: number, y: number, ch: string, fg?: number, bg?: number) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    const c = this.at(x, y);
    c.ch = ch[0] || " ";
    if (fg != null) c.fg = fg;
    if (bg != null) c.bg = bg;
  }

  write(x: number, y: number, text: string, fg?: number, bg?: number) {
    for (let i = 0; i < text.length; i++) this.put(x + i, y, text[i], fg, bg);
  }

  writeC(y: number, text: string, fg?: number, bg?: number) {
    const x = Math.max(0, Math.floor((COLS - text.length) / 2));
    this.write(x, y, text, fg, bg);
  }

  fill(x: number, y: number, w: number, h: number, ch: string, fg?: number, bg?: number) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) this.put(x + i, y + j, ch, fg, bg);
    }
  }

  box(x: number, y: number, w: number, h: number, fg: number, bg = BLK) {
    const hch = "─";
    const vch = "│";
    for (let i = 1; i < w - 1; i++) {
      this.put(x + i, y, hch, fg, bg);
      this.put(x + i, y + h - 1, hch, fg, bg);
    }
    for (let j = 1; j < h - 1; j++) {
      this.put(x, y + j, vch, fg, bg);
      this.put(x + w - 1, y + j, vch, fg, bg);
    }
    this.put(x, y, "┌", fg, bg);
    this.put(x + w - 1, y, "┐", fg, bg);
    this.put(x, y + h - 1, "└", fg, bg);
    this.put(x + w - 1, y + h - 1, "┘", fg, bg);
  }

  /** Original used simple + - | ASCII boxes too — this is the CGA double-line look. */
  boxAscii(x: number, y: number, w: number, h: number, fg: number, bg = BLK) {
    for (let i = 0; i < w; i++) {
      this.put(x + i, y, i === 0 || i === w - 1 ? "+" : "-", fg, bg);
      this.put(x + i, y + h - 1, i === 0 || i === w - 1 ? "+" : "-", fg, bg);
    }
    for (let j = 1; j < h - 1; j++) {
      this.put(x, y + j, "|", fg, bg);
      this.put(x + w - 1, y + j, "|", fg, bg);
      for (let i = 1; i < w - 1; i++) this.put(x + i, y + j, " ", fg, bg);
    }
  }

  paint() {
    const { ctx, canvas, cw, ch } = this;
    ctx.fillStyle = CGA[BLK];
    ctx.fillRect(0, 0, COLS * cw, ROWS * ch);
    ctx.textBaseline = "top";
    ctx.font = `${Math.floor(ch * 0.92)}px "Courier New", "Consolas", monospace`;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = this.at(x, y);
        if (c.bg) {
          ctx.fillStyle = CGA[c.bg];
          ctx.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5);
        }
        if (c.ch !== " ") {
          ctx.fillStyle = CGA[c.fg];
          ctx.fillText(c.ch, x * cw, y * ch + 1);
        }
      }
    }
  }
}
