/**
 * Color-only motion primitives. Existing CSI is stripped and replaced so
 * a frame never changes visible width.
 *
 * Each style has its own geometry. Catalog `speed` drives travel / hue
 * / breathe rate; intensity drives amplitude, band width, and contrast.
 */

import { ansi } from "../theme/colors.ts";
import type { MotionIntensity, MotionStyleId } from "./types.ts";

const CSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export function stripMotionAnsi(text: string): string {
  return text.replace(CSI, "");
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function fg(r: number, g: number, b: number): string {
  return ansi.getFgAnsi(clampByte(r), clampByte(g), clampByte(b));
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
  return ((now * Math.max(0.05, speed)) / 16) % count;
}

function wrapDist(i: number, head: number, n: number): number {
  if (n <= 0) return 0;
  const h = ((head % n) + n) % n;
  const d = Math.abs(i - h);
  return Math.min(d, n - d);
}

/** Distance walking backward from a head that travels +i (wrap-aware). */
function trailBehind(i: number, head: number, n: number): number {
  if (n <= 0) return 0;
  const h = ((head % n) + n) % n;
  let d = h - i;
  if (d < 0) d += n;
  return d;
}

function unitHash(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function flicker(now: number, i: number, speed: number): number {
  const cell = Math.floor(now * 0.014 * speed) + i * 17;
  return unitHash(cell);
}

function colorForStyle(
  style: MotionStyleId,
  i: number,
  count: number,
  now: number,
  intensity: MotionIntensity,
  speed: number,
): [number, number, number] {
  const n = Math.max(1, count);
  const head = headPosition(now, n, speed);
  const amp = 0.42 + intensity * 0.14;
  switch (style) {
    case "shimmer": {
      const width = 2.2 + intensity * 1.45;
      const peak = Math.max(0, 1 - wrapDist(i, head, n) / width) ** 0.42;
      const stitch = intensity <= 2 && i % 2 === 1 ? 0.4 : 1;
      return lerpRgb([58, 42, 74], [255, 236, 142], peak * stitch * Math.min(1, amp * 1.15));
    }
    case "rainbow": {
      const hue = (i / n) * 360 + now * 0.16 * speed;
      const sat = 0.82 + intensity * 0.028;
      const light =
        0.5 + intensity * 0.018 + 0.07 * Math.sin(now * 0.007 * speed + i * 0.15);
      return hslToRgb(hue, Math.min(0.95, sat), light);
    }
    case "ember": {
      const tail = 5.5 + intensity * 3.2;
      const t = Math.exp(-trailBehind(i, head, n) / tail);
      const spark = 0.72 + 0.28 * flicker(now, i, speed);
      return lerpRgb([92, 18, 8], [255, 198, 58], t * spark * Math.min(1, amp * 1.2));
    }
    case "heat": {
      const dist = wrapDist(i, head, n);
      const width = 4.2 + intensity * 2.4;
      const core = Math.max(0, 1 - dist / Math.max(1.1, width * 0.32)) ** 0.45;
      const bloom = Math.max(0, 1 - dist / width) ** 1.15;
      const t = Math.max(core, bloom * 0.72) * Math.min(1, amp * 1.15);
      return lerpRgb([86, 6, 16], [255, 246, 220], t);
    }
    case "aurora": {
      const wash = (Math.sin(i * 0.36 + now * 0.0036 * speed) + 1) / 2;
      const veil = (Math.sin(i * 0.15 - now * 0.0021 * speed + 1.8) + 1) / 2;
      const mix = wash * 0.58 + veil * 0.42;
      const cool = lerpRgb([8, 36, 88], [20, 140, 168], mix);
      const hot = lerpRgb([20, 140, 168], [150, 255, 214], mix);
      return lerpRgb(cool, hot, mix * amp);
    }
    case "comet": {
      const behind = trailBehind(i, head, n);
      const tau = 3.2 + intensity * 2.6;
      const t = Math.exp(-behind / tau);
      const headGlow = behind < 0.85 ? 1 : t;
      return lerpRgb([14, 12, 42], [244, 248, 255], headGlow * Math.min(1, amp * 1.25));
    }
    case "prism": {
      const split = i * 2 < n;
      const drift = now * 0.11 * speed;
      const twist = i * (0.9 + speed * 0.35) + (i % 2) * 18;
      const hue = (split ? 195 : 28) + drift + twist * 0.35;
      const light = 0.5 + 0.08 * Math.sin(i * 0.7 + now * 0.005 * speed) + intensity * 0.02;
      return hslToRgb(hue, 0.8, light);
    }
    case "tide": {
      const travel = ((Math.sin(now * 0.0038 * speed) + 1) / 2) * (n - 1);
      const left = travel;
      const right = n - 1 - travel;
      const crest = 2.6 + intensity * 1.1;
      const t = Math.max(
        Math.max(0, 1 - wrapDist(i, left, n) / crest),
        Math.max(0, 1 - wrapDist(i, right, n) / crest),
        ((Math.sin(i * 0.22 - now * 0.0055 * speed) + 1) / 2) * 0.28,
      );
      return lerpRgb([16, 40, 128], [190, 232, 255], t * Math.min(1, amp * 1.2));
    }
    case "pulse": {
      const breathe = (Math.sin(now * 0.0034 * speed) + 1) / 2;
      return lerpRgb([62, 62, 84], [238, 228, 255], 0.1 + breathe * amp);
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
  speed = 1,
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
    const [r, g, b] = colorForStyle(style, i, chars.length, now, intensity, speed);
    out += `${fg(r, g, b)}${ch}`;
  }
  return `${out}\x1b[0m`;
}

/**
 * Recolor a visible-index span of `text`. The line is rebuilt from
 * stripped visible characters (original CSI is not preserved); width
 * stays equal to the plain form.
 */
export function applyKeywordSpan(
  text: string,
  start: number,
  length: number,
  style: MotionStyleId,
  intensity: MotionIntensity,
  now: number,
  speed = 1,
): string {
  if (length <= 0) return text;
  const chars = visibleChars(text);
  const from = Math.max(0, start);
  const to = Math.min(chars.length, start + length);
  if (from >= to) return text;
  let out = "";
  for (const [i, ch] of chars.entries()) {
    if (i >= from && i < to && ch !== " ") {
      const [r, g, b] = colorForStyle(
        style,
        i - from,
        to - from,
        now,
        intensity,
        speed,
      );
      out += `${fg(r, g, b)}${ch}`;
    } else {
      out += ch;
    }
  }
  return `${out}\x1b[0m`;
}
