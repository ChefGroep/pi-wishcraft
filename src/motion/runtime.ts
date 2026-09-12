/**
 * Motion runtime: keyword burst/hold + streaming catalog paint.
 * Timer runs only while a frame is needed; paint never marks layoutDirty.
 */

import { colorEnabled } from "../theme/colors.ts";
import { thinkingMotion, getMotionCatalogEntry } from "./catalog.ts";
import { matchKeyword } from "./keywords.ts";
import { reducedMotionEnabled } from "./policy.ts";
import { applyKeywordSpan, applyMotionStyle } from "./primitives.ts";
import type {
  MotionIntensity,
  MotionPaint,
  MotionRuntime,
  MotionSettings,
  KeywordHit,
} from "./types.ts";
import { KEYWORD_BURST_MS, MOTION_TICK_MS } from "./types.ts";

export const NONE_PAINT: MotionPaint = {
  style: "none",
  intensity: 1,
  catalogId: "none",
  keyword: null,
  burst: false,
};

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
  return (intensity < 5 ? intensity + 1 : 5) as MotionIntensity;
}

/**
 * Pure paint resolver. Keyword hold/burst wins, then thinking while
 * streaming, then the default working shimmer, else none.
 */
export function resolveMotionPaint(input: ResolveMotionPaintInput): MotionPaint {
  const env = input.env ?? process.env;
  const color = input.color ?? colorEnabled();
  if (!input.settings.enabled || reducedMotionEnabled(env) || !color) {
    return NONE_PAINT;
  }

  if (input.settings.keywords && input.keyword) {
    const burst = input.now < input.burstUntil;
    return {
      style: input.keyword.style,
      intensity: burst
        ? bumpIntensity(input.keyword.intensity)
        : input.keyword.intensity,
      catalogId: input.keyword.catalogId,
      keyword: input.keyword,
      burst,
    };
  }

  if (input.streaming) {
    const thinking = input.thinkingLevel
      ? thinkingMotion(input.thinkingLevel)
      : null;
    if (thinking) {
      return {
        style: thinking.style,
        intensity: thinking.intensity,
        catalogId: thinking.id,
        keyword: null,
        burst: false,
      };
    }
    const work = getMotionCatalogEntry("shimmer-work");
    if (work) {
      return {
        style: work.style,
        intensity: work.intensity,
        catalogId: work.id,
        keyword: null,
        burst: false,
      };
    }
  }

  return NONE_PAINT;
}

export function decoratePowerlineLine(
  text: string,
  paint: MotionPaint,
  now: number,
): string {
  if (!text || paint.style === "none") return text;
  return applyMotionStyle(text, paint.style, paint.intensity, now);
}

export function decorateKeywordLine(
  text: string,
  settings: MotionSettings,
  now: number,
  env?: NodeJS.ProcessEnv,
  color?: boolean,
): string {
  if (!text) return text;
  if (!settings.enabled || !settings.keywords) return text;
  if (reducedMotionEnabled(env) || !(color ?? colorEnabled())) return text;
  const hit = matchKeyword(text);
  if (!hit) return text;
  return applyKeywordSpan(
    text,
    hit.index,
    hit.length,
    hit.style,
    hit.intensity,
    now,
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

  function shouldTick(now: number): boolean {
    if (!settings.enabled || reducedMotionEnabled(envOf()) || !colorOn()) {
      return false;
    }
    if (opts.getStreaming()) return true;
    if (settings.keywords && (keyword !== null || now < burstUntil)) {
      return true;
    }
    return false;
  }

  function schedule(): void {
    const handle = setTimeout(() => {
      timer = null;
      const now = clock();
      if (!shouldTick(now)) return;
      opts.paint();
      schedule();
    }, MOTION_TICK_MS);
    if (typeof handle.unref === "function") handle.unref();
    timer = handle;
  }

  function syncTimer(now = clock()): void {
    if (shouldTick(now)) {
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
      syncTimer(now);
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
