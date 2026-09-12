/**
 * Shared motion vocabulary. Styles are color-only overlays so powerline
 * layout width stays stable across frames.
 */

export type MotionStyleId =
  | "none"
  | "shimmer"
  | "rainbow"
  | "ember"
  | "heat"
  | "aurora"
  | "comet"
  | "prism"
  | "tide"
  | "pulse";

export type MotionIntensity = 1 | 2 | 3 | 4 | 5;

export interface MotionSettings {
  enabled: boolean;
  keywords: boolean;
}

export interface KeywordHit {
  id: string;
  pattern: string;
  catalogId: string;
  style: MotionStyleId;
  intensity: MotionIntensity;
  index: number;
  length: number;
}

export interface MotionPaint {
  style: MotionStyleId;
  intensity: MotionIntensity;
  catalogId: string;
  keyword: KeywordHit | null;
  burst: boolean;
}

export interface MotionRuntime {
  noteText(text: string): void;
  setSettings(settings: MotionSettings): void;
  getSettings(): MotionSettings;
  getPaint(now?: number): MotionPaint;
  arm(): void;
  reset(): void;
}

export interface MotionCatalogEntry {
  id: string;
  name: string;
  style: MotionStyleId;
  intensity: MotionIntensity;
  speed: number;
  description: string;
}

export const MOTION_TICK_MS = 50;
export const KEYWORD_BURST_MS = 1600;
