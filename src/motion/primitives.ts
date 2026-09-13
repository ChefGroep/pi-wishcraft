/**
 * Color-only motion primitives. Existing CSI is stripped and replaced so
 * a frame never changes visible width.
 */

import type { MotionIntensity, MotionStyleId } from "./types.ts";

const CSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export function stripMotionAnsi(text: string): string {
  return text.replace(CSI, "");
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function fg(r: number, g: number, b: number): string {
  return `\x1b[38;2;${clampByte(r)};${clampByte(g)};${clampByte(b)}m`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  return [lerp(from[0], to[0], u), lerp(from[1], to[1], u), lerp(from[2], to[2], u)];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function visibleChars(text: string): string[] {
  const plain = stripMotionAnsi(text);
  return [...plain];
}

function headPosition(now: number, count: number, speed: number): number {
  if (count <= 0) return 0;
  const period = count + 10;
  return ((now * speed) / 18) % period;
}

function band(i: number, head: number, width: number): number {
  const dist = Math.abs(i - head);
  return Math.max(0, 1 - dist / Math.max(1, width));
}

function colorForStyle(
  style: MotionStyleId,
  i: number,
  count: number,
  now: number,
  intensity: MotionIntensity,
): [number, number, number] {
  const speed = 0.45 + intensity * 0.28;
  const amp = 0.35 + intensity * 0.12;
  const n = Math.max(1, count);
  const head = headPosition(now, n, speed);
  switch (style) {
    case "shimmer": {
      const t = band(i, head, 5 + intensity) ** 0.7;
      return lerpRgb([107, 90, 122], [255, 224, 138], t * amp * 1.4);
    }
    case "rainbow": {
      const hue = (i / n) * 300 + now * (0.08 * speed);
      return hslToRgb(hue, 0.72, 0.58 + intensity * 0.02);
    }
    case "ember": {
      const t = band(i, head, 4 + intensity);
      return lerpRgb([124, 45, 18], [254, 188, 56], t * amp * 1.5);
    }
    case "heat": {
      const t = band(i, head, 6 + intensity);
      return lerpRgb([127, 29, 29], [255, 237, 213], t * amp * 1.5);
    }
    case "aurora": {
      const wave = (Math.sin(i * 0.45 + now * 0.004 * speed) + 1) / 2;
      return lerpRgb([14, 116, 144], [167, 243, 208], wave * amp * 1.3);
    }
    case "comet": {
      const t = band(i, head, 2 + intensity);
      return lerpRgb([30, 27, 75], [224, 231, 255], t * amp * 1.8);
    }
    case "prism": {
      const hue = (i / n) * 140 + now * (0.05 * speed) + (i % 2) * 80;
      return hslToRgb(hue, 0.65, 0.55);
    }
    case "tide": {
      const wave = (Math.sin(i * 0.25 - now * 0.005 * speed) + 1) / 2;
      return lerpRgb([30, 64, 175], [191, 219, 254], wave * amp * 1.3);
    }
    case "pulse": {
      const breathe = (Math.sin(now * 0.004 * speed) + 1) / 2;
      return lerpRgb([88, 88, 108], [232, 221, 255], breathe * amp);
    }
    default: {
      const _exhaustive: never = style;
      return _exhaustive;
    }
  }
}

/**
 * Recolor visible characters. CSI is dropped; visible width is unchanged.
 */
export function applyMotionStyle(
  text: string,
  style: MotionStyleId,
  intensity: MotionIntensity,
  now: number,
): string {
  if (text.length === 0) return text;
  const chars = visibleChars(text);
  if (chars.length === 0) return text;
  let out = "";
  for (const [i, ch] of chars.entries()) {
    if (ch === " ") {
      out += ch;
      continue;
    }
    const [r, g, b] = colorForStyle(style, i, chars.length, now, intensity);
    out += `${fg(r, g, b)}${ch}`;
  }
  return `${out}\x1b[0m`;
}

/**
 * Recolor a visible-index span of `text` (ANSI stripped for matching).
 * Characters outside the span keep the original string's CSI by rebuilding
 * from the plain text plus a styled span — width stays equal to the plain form.
 */
export function applyKeywordSpan(
  text: string,
  start: number,
  length: number,
  style: MotionStyleId,
  intensity: MotionIntensity,
  now: number,
): string {
  if (length <= 0) return text;
  const chars = visibleChars(text);
  const from = Math.max(0, start);
  const to = Math.min(chars.length, start + length);
  if (from >= to) return text;
  let out = "";
  for (const [i, ch] of chars.entries()) {
    if (i >= from && i < to && ch !== " ") {
      const [r, g, b] = colorForStyle(style, i - from, to - from, now, intensity);
      out += `${fg(r, g, b)}${ch}`;
    } else {
      out += ch;
    }
  }
  return `${out}\x1b[0m`;
}
