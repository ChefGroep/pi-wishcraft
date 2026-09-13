import type { MotionCatalogId } from "./catalog.ts";
import { stripMotionAnsi } from "./primitives.ts";
import type { KeywordHit } from "./types.ts";

interface KeywordDef {
  id: string;
  pattern: string;
  catalogId: MotionCatalogId;
}

const KEYWORDS = [
  { id: "ultrathink", pattern: "ultrathink", catalogId: "ultrathink" },
  { id: "think-harder", pattern: "think harder", catalogId: "think-harder" },
  { id: "think-hard", pattern: "think hard", catalogId: "think-hard" },
  { id: "lanternwake", pattern: "lanternwake", catalogId: "lanternwake" },
  { id: "kongming", pattern: "kongming", catalogId: "ember-relay" },
  { id: "wishcraft", pattern: "wishcraft", catalogId: "wish-rise" },
  { id: "crucible", pattern: "crucible", catalogId: "forge-heat" },
  { id: "ultrathink-alias-ultra", pattern: "ultra", catalogId: "rainbow-ultra" },
  { id: "xhigh", pattern: "xhigh", catalogId: "max-effort" },
  { id: "zenith", pattern: "zenith", catalogId: "zenith" },
  { id: "nova", pattern: "nova", catalogId: "nova-burst" },
  { id: "aurora", pattern: "aurora", catalogId: "aurora-nimbus" },
  { id: "nimbus", pattern: "nimbus", catalogId: "aurora-nimbus" },
  { id: "comet", pattern: "comet", catalogId: "comet-tail" },
  { id: "storm", pattern: "storm", catalogId: "storm-front" },
  { id: "blaze", pattern: "blaze", catalogId: "forge-heat" },
  { id: "flare", pattern: "flare", catalogId: "rune-flare" },
  { id: "forge", pattern: "forge", catalogId: "forge-heat" },
  { id: "warp", pattern: "warp", catalogId: "warp-fold" },
  { id: "prism", pattern: "prism", catalogId: "prism-split" },
  { id: "helix", pattern: "helix", catalogId: "helix-spin" },
  { id: "lantern", pattern: "lantern", catalogId: "lanternwake" },
  { id: "ember", pattern: "ember", catalogId: "ember-gust" },
  { id: "tide", pattern: "tide", catalogId: "tide-rise" },
  { id: "orbit", pattern: "orbit", catalogId: "cyan-drift" },
  { id: "spark", pattern: "spark", catalogId: "comet-tail" },
  { id: "stitch", pattern: "stitch", catalogId: "stitch-travel" },
  { id: "bloom", pattern: "bloom", catalogId: "pulse-quiet" },
  { id: "rune", pattern: "rune", catalogId: "rune-flare" },
  { id: "wish", pattern: "wish", catalogId: "wish-rise" },
  { id: "think", pattern: "think", catalogId: "shimmer-work" },
  { id: "max", pattern: "max", catalogId: "max-effort" },
  { id: "wisp", pattern: "wisp", catalogId: "wisp" },
  { id: "hush", pattern: "hush", catalogId: "vigil-hush" },
  { id: "vigil", pattern: "vigil", catalogId: "vigil-hush" },
] as const satisfies readonly KeywordDef[];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SORTED = [...KEYWORDS].sort((a, b) => b.pattern.length - a.pattern.length);

const COMPILED: ReadonlyArray<KeywordDef & { re: RegExp }> = SORTED.map((def) => ({
  ...def,
  re: new RegExp(`\\b${escapeRegExp(def.pattern)}\\b`, "i"),
}));

export const KEYWORD_COUNT = KEYWORDS.length;

function codePointIndex(text: string, utf16Index: number): number {
  return [...text.slice(0, utf16Index)].length;
}

export function matchKeyword(text: string): KeywordHit | null {
  const plain = stripMotionAnsi(text);
  if (!plain) return null;
  for (const def of COMPILED) {
    const match = def.re.exec(plain);
    if (!match) continue;
    return {
      id: def.id,
      pattern: def.pattern,
      catalogId: def.catalogId,
      index: codePointIndex(plain, match.index),
      length: [...match[0]].length,
    };
  }
  return null;
}

export function keywordCatalog(): readonly KeywordDef[] {
  return KEYWORDS;
}
