/**
 * Renderer for the Kongming lantern pixel grid (`lantern-art.ts`).
 *
 * Half-blocks pack two pixel rows into one terminal row: upper = fg,
 * lower = bg. Flame cells flicker with a spatial lick; paper breathes;
 * the tassel barely moves. Header / reduced-motion / `still` frames use
 * gain 1 so the art is static.
 */

import { colorEnabled } from "../theme/colors.ts";
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

const GRID: Array<Array<Cell | null>> = LANTERN_ROWS.map((row) =>
  row.split("|").map((c) => {
    if (c === "-") return null;
    const [r, g, b] = c.split(",").map(Number);
    return { r: r!, g: g!, b: b! };
  }),
);

const WIDTH = GRID[0]?.length ?? 0;
const PIXEL_HEIGHT = GRID.length;
const TASSEL_ROW = 14;
const FLAME_GREEN_MIN = 36;

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function fg(cell: Cell): string {
  return `\x1b[38;2;${clampByte(cell.r)};${clampByte(cell.g)};${clampByte(cell.b)}m`;
}

function bg(cell: Cell): string {
  return `\x1b[48;2;${clampByte(cell.r)};${clampByte(cell.g)};${clampByte(cell.b)}m`;
}

function classify(cell: Cell, y: number): LanternRegion {
  const chroma =
    Math.max(cell.r, cell.g, cell.b) - Math.min(cell.r, cell.g, cell.b);
  if (y >= TASSEL_ROW || chroma < 40) return "tassel";
  if (cell.g >= FLAME_GREEN_MIN) return "flame";
  return "paper";
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
  const cell = GRID[y]?.[x];
  if (!cell) return 1;
  if (still) return 1;
  return gainForRegion(classify(cell, y), now / 1000, x, y);
}

/** Region at pixel `(x, y)`, or `null` when the cell is empty. */
export function lanternRegionAt(x: number, y: number): LanternRegion | null {
  const cell = GRID[y]?.[x];
  if (!cell) return null;
  return classify(cell, y);
}

function paintCell(cell: Cell, x: number, y: number, frame: LanternFrame): Cell {
  if (frame.still) return cell;
  const region = classify(cell, y);
  const gain = gainForRegion(region, frame.now / 1000, x, y);
  return shade(cell, gain, region);
}

/**
 * Render the lantern as terminal rows of half-blocks. Returns no lines
 * when the terminal is narrower than the art.
 */
export function renderLantern(frame: LanternFrame, maxWidth: number): string[] {
  if (WIDTH === 0 || WIDTH > maxWidth) return [];

  const color = frame.color ?? colorEnabled();
  const lines: string[] = [];
  for (let y = 0; y < PIXEL_HEIGHT; y += 2) {
    const upper = GRID[y] ?? [];
    const lower = GRID[y + 1] ?? [];
    let line = "";
    for (let x = 0; x < WIDTH; x++) {
      const upRaw = upper[x] ?? null;
      const loRaw = lower[x] ?? null;
      const up = upRaw ? paintCell(upRaw, x, y, frame) : null;
      const lo = loRaw ? paintCell(loRaw, x, y + 1, frame) : null;
      if (!up && !lo) {
        line += " ";
      } else if (!color) {
        line += up && lo ? "▀" : up ? "▀" : "▄";
      } else if (up && lo) {
        line += `${fg(up)}${bg(lo)}▀\x1b[0m`;
      } else if (up) {
        line += `${fg(up)}▀\x1b[0m`;
      } else {
        line += `${fg(lo!)}▄\x1b[0m`;
      }
    }
    lines.push(line);
  }
  return lines;
}

export const LANTERN_WIDTH = WIDTH;
export const LANTERN_HEIGHT = Math.ceil(PIXEL_HEIGHT / 2);
