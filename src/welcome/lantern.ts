/**
 * Renderer for the Kongming lantern pixel grid (`lantern-art.ts`).
 *
 * Half-blocks pack two pixel rows into one terminal row: upper = fg,
 * lower = bg. Flame cells flicker with a spatial lick; paper breathes;
 * the tassel barely moves. Header / reduced-motion / `still` frames use
 * gain 1 so the art is static.
 */

import { ansi, clampByte, colorEnabled } from "../theme/colors.ts";
import { LANTERN_ROWS } from "./lantern-art.ts";

export interface LanternFrame {
  /** Time source for the animation phase; `Date.now()` is enough. */
  now: number;
  /** Skip flicker (header, reduced motion, or `animateLantern: false`). */
  still?: boolean;
  /** Override `colorEnabled()` so tests can paint a silhouette. */
  color?: boolean;
}

export type LanternRegion = "flame" | "paper" | "tassel";

interface Cell {
  r: number;
  g: number;
  b: number;
}

const TASSEL_ROW = 14;
const FLAME_GREEN_MIN = 36;

function classify(cell: Cell, y: number): LanternRegion {
  const chroma =
    Math.max(cell.r, cell.g, cell.b) - Math.min(cell.r, cell.g, cell.b);
  if (y >= TASSEL_ROW || chroma < 40) return "tassel";
  if (cell.g >= FLAME_GREEN_MIN) return "flame";
  return "paper";
}

const GRID: Array<Array<Cell | null>> = LANTERN_ROWS.map((row) =>
  row.split("|").map((c) => {
    if (c === "-") return null;
    const [r, g, b] = c.split(",").map(Number);
    return { r: r!, g: g!, b: b! };
  }),
);

const REGIONS: Array<Array<LanternRegion | null>> = GRID.map((row, y) =>
  row.map((cell) => (cell ? classify(cell, y) : null)),
);

const WIDTH = GRID[0]?.length ?? 0;
const PIXEL_HEIGHT = GRID.length;

function fg(cell: Cell): string {
  return ansi.getFgAnsi(clampByte(cell.r), clampByte(cell.g), clampByte(cell.b));
}

function bg(cell: Cell): string {
  return ansi.getBgAnsi(clampByte(cell.r), clampByte(cell.g), clampByte(cell.b));
}

function gainForRegion(
  region: LanternRegion,
  t: number,
  x: number,
  y: number,
): number {
  switch (region) {
    case "flame": {
      const breathe = Math.sin(t * 1.35) * 0.5 + 0.5;
      const lick = Math.sin(t * 7.1 + x * 0.85 + y * 0.4) * 0.5 + 0.5;
      const gust = Math.sin(t * 13.3 + x * 1.7) * 0.5 + 0.5;
      return 0.72 + 0.2 * breathe + 0.32 * lick + 0.14 * gust;
    }
    case "paper": {
      const wash = Math.sin(t * 1.15 + y * 0.12) * 0.5 + 0.5;
      return 0.94 + 0.1 * wash;
    }
    case "tassel": {
      const sway = Math.sin(t * 2.2 + x * 0.35) * 0.5 + 0.5;
      return 0.96 + 0.07 * sway;
    }
    default: {
      const exhaustive: never = region;
      throw new Error(`unhandled lantern region: ${exhaustive}`);
    }
  }
}

function shade(cell: Cell, gain: number, region: LanternRegion): Cell {
  let r = cell.r * gain;
  let g = cell.g * gain;
  let b = cell.b * gain;
  if (region === "flame" && gain > 1) {
    const heat = Math.min(1, (gain - 1) * 2);
    r += 18 * heat;
    g += 36 * heat;
    b += 8 * heat;
  }
  return { r, g, b };
}

/**
 * Brightness multiplier at pixel `(x, y)`. Empty cells return 1.
 * Still frames are always 1, independent of `now`.
 */
export function lanternGainAt(
  now: number,
  x: number,
  y: number,
  still = false,
): number {
  const region = REGIONS[y]?.[x];
  if (!region) return 1;
  if (still) return 1;
  return gainForRegion(region, now / 1000, x, y);
}

/** Region at pixel `(x, y)`, or `null` when the cell is empty. */
export function lanternRegionAt(x: number, y: number): LanternRegion | null {
  return REGIONS[y]?.[x] ?? null;
}

function paintCell(cell: Cell, x: number, y: number, t: number): Cell {
  const region = REGIONS[y]?.[x];
  if (!region) return cell;
  return shade(cell, gainForRegion(region, t, x, y), region);
}

function halfBlock(up: Cell | null, lo: Cell | null, color: boolean): string {
  if (!up && !lo) return " ";
  if (!color) return up ? "▀" : "▄";
  if (up && lo) return `${fg(up)}${bg(lo)}▀${ansi.reset}`;
  if (up) return `${fg(up)}▀${ansi.reset}`;
  return `${fg(lo!)}▄${ansi.reset}`;
}

/**
 * Render the lantern as terminal rows of half-blocks. Returns no lines
 * when the terminal is narrower than the art.
 */
export function renderLantern(frame: LanternFrame, maxWidth: number): string[] {
  if (WIDTH === 0 || WIDTH > maxWidth) return [];

  const color = frame.color ?? colorEnabled();
  const animate = color && !frame.still;
  const t = frame.now / 1000;
  const lines: string[] = [];
  for (let y = 0; y < PIXEL_HEIGHT; y += 2) {
    const upper = GRID[y] ?? [];
    const lower = GRID[y + 1] ?? [];
    let line = "";
    for (let x = 0; x < WIDTH; x++) {
      const upRaw = upper[x] ?? null;
      const loRaw = lower[x] ?? null;
      const up = upRaw && animate ? paintCell(upRaw, x, y, t) : upRaw;
      const lo = loRaw && animate ? paintCell(loRaw, x, y + 1, t) : loRaw;
      line += halfBlock(up, lo, color);
    }
    lines.push(line);
  }
  return lines;
}

export const LANTERN_WIDTH = WIDTH;
export const LANTERN_HEIGHT = Math.ceil(PIXEL_HEIGHT / 2);
