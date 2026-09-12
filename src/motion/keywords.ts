import type { KeywordHit, MotionIntensity, MotionStyleId } from "./types.ts";

interface KeywordDef {
  id: string;
  pattern: string;
  catalogId: string;
  style: MotionStyleId;
  intensity: MotionIntensity;
}

const KEYWORDS: readonly KeywordDef[] = [
  { id: "ultrathink", pattern: "ultrathink", catalogId: "ultrathink", style: "rainbow", intensity: 5 },
  { id: "think-harder", pattern: "think harder", catalogId: "think-harder", style: "heat", intensity: 4 },
  { id: "think-hard", pattern: "think hard", catalogId: "think-hard", style: "ember", intensity: 3 },
  { id: "lanternwake", pattern: "lanternwake", catalogId: "lanternwake", style: "ember", intensity: 4 },
  { id: "kongming", pattern: "kongming", catalogId: "ember-relay", style: "ember", intensity: 4 },
  { id: "wishcraft", pattern: "wishcraft", catalogId: "wish-rise", style: "ember", intensity: 3 },
  { id: "crucible", pattern: "crucible", catalogId: "forge-heat", style: "heat", intensity: 5 },
  { id: "ultrathink-alias-ultra", pattern: "ultra", catalogId: "rainbow-ultra", style: "rainbow", intensity: 5 },
  { id: "xhigh", pattern: "xhigh", catalogId: "max-effort", style: "rainbow", intensity: 4 },
  { id: "zenith", pattern: "zenith", catalogId: "zenith", style: "rainbow", intensity: 4 },
  { id: "nova", pattern: "nova", catalogId: "nova-burst", style: "rainbow", intensity: 5 },
  { id: "aurora", pattern: "aurora", catalogId: "aurora-nimbus", style: "aurora", intensity: 4 },
  { id: "nimbus", pattern: "nimbus", catalogId: "aurora-nimbus", style: "aurora", intensity: 3 },
  { id: "comet", pattern: "comet", catalogId: "comet-tail", style: "comet", intensity: 4 },
  { id: "storm", pattern: "storm", catalogId: "storm-front", style: "comet", intensity: 4 },
  { id: "blaze", pattern: "blaze", catalogId: "forge-heat", style: "heat", intensity: 4 },
  { id: "flare", pattern: "flare", catalogId: "rune-flare", style: "heat", intensity: 4 },
  { id: "forge", pattern: "forge", catalogId: "forge-heat", style: "heat", intensity: 4 },
  { id: "warp", pattern: "warp", catalogId: "warp-fold", style: "prism", intensity: 4 },
  { id: "prism", pattern: "prism", catalogId: "prism-split", style: "prism", intensity: 3 },
  { id: "helix", pattern: "helix", catalogId: "helix-spin", style: "prism", intensity: 3 },
  { id: "lantern", pattern: "lantern", catalogId: "lanternwake", style: "ember", intensity: 3 },
  { id: "ember", pattern: "ember", catalogId: "ember-gust", style: "ember", intensity: 3 },
  { id: "tide", pattern: "tide", catalogId: "tide-rise", style: "tide", intensity: 3 },
  { id: "orbit", pattern: "orbit", catalogId: "cyan-drift", style: "aurora", intensity: 2 },
  { id: "spark", pattern: "spark", catalogId: "comet-tail", style: "comet", intensity: 3 },
  { id: "stitch", pattern: "stitch", catalogId: "stitch-travel", style: "shimmer", intensity: 2 },
  { id: "bloom", pattern: "bloom", catalogId: "pulse-quiet", style: "pulse", intensity: 2 },
  { id: "rune", pattern: "rune", catalogId: "rune-flare", style: "pulse", intensity: 2 },
  { id: "wish", pattern: "wish", catalogId: "wish-rise", style: "ember", intensity: 2 },
  { id: "think", pattern: "think", catalogId: "shimmer-work", style: "shimmer", intensity: 2 },
  { id: "max", pattern: "max", catalogId: "max-effort", style: "rainbow", intensity: 5 },
  { id: "wisp", pattern: "wisp", catalogId: "wisp", style: "pulse", intensity: 1 },
  { id: "hush", pattern: "hush", catalogId: "vigil-hush", style: "pulse", intensity: 1 },
  { id: "vigil", pattern: "vigil", catalogId: "vigil-hush", style: "pulse", intensity: 1 },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SORTED = [...KEYWORDS].sort((a, b) => b.pattern.length - a.pattern.length);

const COMPILED: ReadonlyArray<KeywordDef & { re: RegExp }> = SORTED.map((def) => ({
  ...def,
  re: new RegExp(`\\b${escapeRegExp(def.pattern)}\\b`, "i"),
}));

export const KEYWORD_COUNT = KEYWORDS.length;

export function matchKeyword(text: string): KeywordHit | null {
  if (!text) return null;
  for (const def of COMPILED) {
    const match = def.re.exec(text);
    if (!match) continue;
    return {
      id: def.id,
      pattern: def.pattern,
      catalogId: def.catalogId,
      style: def.style,
      intensity: def.intensity,
      index: match.index,
      length: match[0].length,
    };
  }
  return null;
}

export function keywordCatalog(): readonly KeywordDef[] {
  return KEYWORDS;
}
