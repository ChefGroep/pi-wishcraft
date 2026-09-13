/**
 * Motion runtime: keyword burst/hold + streaming catalog paint.
 * Timer runs only while a frame is needed; paint never marks layoutDirty.
 */

import { colorEnabled } from "../theme/colors.ts";
import {
  getMotionCatalogEntry,
  isMotionCatalogId,
  parseThinkingLevel,
  thinkingMotion,
  type MotionCatalogEntry,
} from "./catalog.ts";
import { matchKeyword } from "./keywords.ts";
import { motionPaintAllowed } from "./policy.ts";
import { applyKeywordSpan, applyMotionStyle } from "./primitives.ts";
import type {
  MotionIntensity,
  MotionPaint,
  MotionRuntime,
  MotionSettings,
  KeywordHit,
} from "./types.ts";
import { KEYWORD_BURST_MS, KEYWORD_BURST_SPEED, MOTION_TICK_MS } from "./types.ts";

export const NONE_PAINT = { kind: "none" } as const satisfies MotionPaint;

export interface ResolveMotionPaintInput {
  settings: MotionSettings;
  streaming: boolean;
  thinkingLevel: string | null;
  keyword: KeywordHit | null;
  burstUntil: number;
  now: number;
  env?: NodeJS.ProcessEnv;
  color?: boolean;
}

function bumpIntensity(intensity: MotionIntensity): MotionIntensity {
  switch (intensity) {
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return 4;
    case 4:
    case 5:
      return 5;
    default: {
      const _exhaustive: never = intensity;
      return _exhaustive;
    }
  }
}

function catalogFromId(id: string): MotionCatalogEntry {
  if (isMotionCatalogId(id)) return getMotionCatalogEntry(id);
  return getMotionCatalogEntry("shimmer-work");
}

function catalogPaint(entry: MotionCatalogEntry): MotionPaint {
  return {
    kind: "catalog",
    style: entry.style,
    intensity: entry.intensity,
    speed: entry.speed,
    catalogId: entry.id,
  };
}

/**
 * Pure paint resolver. Keyword hold/burst wins, then thinking while
 * streaming, then the default working shimmer, else none.
 */
export function resolveMotionPaint(input: ResolveMotionPaintInput): MotionPaint {
  const env = input.env ?? process.env;
  const color = input.color ?? colorEnabled();
  if (!motionPaintAllowed(input.settings, env, color)) {
    return NONE_PAINT;
  }

  if (input.settings.keywords && input.keyword) {
    const entry = catalogFromId(input.keyword.catalogId);
    const burst = input.now < input.burstUntil;
    return {
      kind: "keyword",
      style: entry.style,
      intensity: burst ? bumpIntensity(entry.intensity) : entry.intensity,
      speed: burst ? entry.speed * KEYWORD_BURST_SPEED : entry.speed,
      catalogId: entry.id,
      keyword: input.keyword,
      burst,
    };
  }

  if (input.streaming) {
    const thinking = parseThinkingLevel(input.thinkingLevel);
    const entry = thinking ? thinkingMotion(thinking) : null;
    if (entry) return catalogPaint(entry);
    return catalogPaint(getMotionCatalogEntry("shimmer-work"));
  }

  return NONE_PAINT;
}

export function decoratePowerlineLine(
  text: string,
  paint: MotionPaint,
  now: number,
): string {
  if (!text || paint.kind === "none") return text;
  return applyMotionStyle(text, paint.style, paint.intensity, now, paint.speed);
}

export function decorateKeywordLine(
  text: string,
  settings: MotionSettings,
  now: number,
  env?: NodeJS.ProcessEnv,
  color?: boolean,
): string {
  if (!text) return text;
  const envOf = env ?? process.env;
  const colorOn = color ?? colorEnabled();
  if (!motionPaintAllowed(settings, envOf, colorOn) || !settings.keywords) {
    return text;
  }
  const hit = matchKeyword(text);
  if (!hit) return text;
  const entry = catalogFromId(hit.catalogId);
  return applyKeywordSpan(
    text,
    hit.index,
    hit.length,
    entry.style,
    entry.intensity,
    now,
    entry.speed,
  );
}

export interface MotionRuntimeOptions {
  paint: () => void;
  getStreaming: () => boolean;
  getThinkingLevel: () => string | null;
  now?: () => number;
  color?: () => boolean;
  env?: () => NodeJS.ProcessEnv;
}

export function createMotionRuntime(
  opts: MotionRuntimeOptions,
): MotionRuntime {
  let settings: MotionSettings = { enabled: true, keywords: true };
  let keyword: KeywordHit | null = null;
  let lastKeywordId: string | null = null;
  let burstUntil = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clock = opts.now ?? Date.now;
  const colorOn = opts.color ?? colorEnabled;
  const envOf = opts.env ?? ((): NodeJS.ProcessEnv => process.env);

  function stop(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function snapshot(now: number): MotionPaint {
    return resolveMotionPaint({
      settings,
      streaming: opts.getStreaming(),
      thinkingLevel: opts.getThinkingLevel(),
      keyword,
      burstUntil,
      now,
      env: envOf(),
      color: colorOn(),
    });
  }

  function needsPaint(): boolean {
    if (!motionPaintAllowed(settings, envOf(), colorOn())) return false;
    if (settings.keywords && keyword !== null) return true;
    return opts.getStreaming();
  }

  function schedule(): void {
    const handle = setTimeout(() => {
      timer = null;
      if (!needsPaint()) return;
      opts.paint();
      schedule();
    }, MOTION_TICK_MS);
    if (typeof handle.unref === "function") handle.unref();
    timer = handle;
  }

  function syncTimer(): void {
    if (needsPaint()) {
      if (timer === null) {
        opts.paint();
        schedule();
      }
      return;
    }
    const wasRunning = timer !== null;
    stop();
    if (wasRunning) opts.paint();
  }

  return {
    noteText(text: string) {
      const now = clock();
      const hit = matchKeyword(text);
      if (hit) {
        if (hit.id !== lastKeywordId && settings.keywords) {
          burstUntil = now + KEYWORD_BURST_MS;
        }
        lastKeywordId = hit.id;
      } else {
        lastKeywordId = null;
        burstUntil = 0;
      }
      keyword = hit;
      syncTimer();
    },
    setSettings(next: MotionSettings) {
      settings = { enabled: next.enabled, keywords: next.keywords };
      if (!settings.keywords) {
        burstUntil = 0;
      }
      syncTimer();
    },
    getSettings() {
      return { enabled: settings.enabled, keywords: settings.keywords };
    },
    getPaint(now = clock()) {
      return snapshot(now);
    },
    arm() {
      syncTimer();
    },
    reset() {
      keyword = null;
      lastKeywordId = null;
      burstUntil = 0;
      stop();
    },
  };
}
