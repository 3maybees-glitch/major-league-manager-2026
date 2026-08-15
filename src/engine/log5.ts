/** Bill James Log5 — P(event | batter, pitcher) given league prior. */
export function log5(pB: number, pP: number, pL: number): number {
  const b = clamp01(pB);
  const p = clamp01(pP);
  const l = clamp01(pL === 0 ? 0.001 : pL);
  const num = b * p * (1 - l);
  const den = num + (1 - b) * (1 - p) * l;
  if (den <= 0) return l;
  return clamp01(num / den);
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0.0005, Math.min(0.92, n));
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function rng(): number {
  return Math.random();
}

export function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function chance(p: number): boolean {
  return Math.random() < p;
}
