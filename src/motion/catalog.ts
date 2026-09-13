import type { MotionIntensity, MotionStyleId } from "./types.ts";

export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export const MOTION_CATALOG = [
  { id: "ember-relay", name: "Ember Relay", style: "ember", intensity: 3, speed: 1, description: "Warm trail along the bar while work is happening." },
  { id: "lanternwake", name: "Lanternwake", style: "ember", intensity: 4, speed: 1.1, description: "Kongming signature: gold on paper-red." },
  { id: "wisp", name: "Wisp", style: "pulse", intensity: 1, speed: 0.6, description: "Soft brightness breathe." },
  { id: "shimmer-work", name: "Shimmer Work", style: "shimmer", intensity: 2, speed: 1, description: "Codex-like traveling highlight on Working." },
  { id: "rainbow-ultra", name: "Rainbow Ultra", style: "rainbow", intensity: 5, speed: 1.4, description: "Claude ultrathink / Codex Ultra chase." },
  { id: "heat-bloom", name: "Heat Bloom", style: "heat", intensity: 4, speed: 1.2, description: "Red-amber lift for think harder." },
  { id: "aurora-nimbus", name: "Aurora Nimbus", style: "aurora", intensity: 3, speed: 0.7, description: "Slow cyan-green wash." },
  { id: "comet-tail", name: "Comet Tail", style: "comet", intensity: 4, speed: 1.5, description: "Tight head, long tail." },
  { id: "prism-split", name: "Prism Split", style: "prism", intensity: 3, speed: 1, description: "Split complementary bands." },
  { id: "tide-rise", name: "Tide Rise", style: "tide", intensity: 3, speed: 0.8, description: "Bidirectional breathe." },
  { id: "pulse-quiet", name: "Pulse Quiet", style: "pulse", intensity: 2, speed: 0.7, description: "Whole-line brightness, low drama." },
  { id: "forge-heat", name: "Forge Heat", style: "heat", intensity: 5, speed: 1.3, description: "Crucible / blaze." },
  { id: "nova-burst", name: "Nova Burst", style: "rainbow", intensity: 5, speed: 1.6, description: "Short high-speed rainbow." },
  { id: "stitch-travel", name: "Stitch Travel", style: "shimmer", intensity: 2, speed: 0.9, description: "Dashed gold stitch." },
  { id: "helix-spin", name: "Helix Spin", style: "prism", intensity: 3, speed: 1.1, description: "Twisted complementary helix." },
  { id: "copper-switch", name: "Copper Switch", style: "ember", intensity: 2, speed: 0.85, description: "Quieter copper chase." },
  { id: "rune-flare", name: "Rune Flare", style: "heat", intensity: 3, speed: 1, description: "Local flare, not a spinner." },
  { id: "storm-front", name: "Storm Front", style: "comet", intensity: 4, speed: 1.35, description: "Fast indigo front." },
  { id: "vigil-hush", name: "Vigil Hush", style: "pulse", intensity: 1, speed: 0.5, description: "Night-shift pulse." },
  { id: "warp-fold", name: "Warp Fold", style: "prism", intensity: 4, speed: 1.4, description: "Hard prism fold." },
  { id: "gold-chase", name: "Gold Chase", style: "shimmer", intensity: 3, speed: 1.2, description: "Hotter shimmer." },
  { id: "magenta-wake", name: "Magenta Wake", style: "ember", intensity: 3, speed: 1, description: "Wishcraft magenta-gold mix." },
  { id: "cyan-drift", name: "Cyan Drift", style: "aurora", intensity: 2, speed: 0.55, description: "Idle-adjacent drift." },
  { id: "ember-gust", name: "Ember Gust", style: "ember", intensity: 3, speed: 1.25, description: "Faster lantern gust." },
  { id: "think-hard", name: "Think Hard", style: "ember", intensity: 3, speed: 1, description: "Claude think hard." },
  { id: "think-harder", name: "Think Harder", style: "heat", intensity: 4, speed: 1.15, description: "Claude think harder." },
  { id: "ultrathink", name: "Ultrathink", style: "rainbow", intensity: 5, speed: 1.5, description: "Claude ultrathink rainbow." },
  { id: "max-effort", name: "Max Effort", style: "rainbow", intensity: 5, speed: 1.45, description: "Codex max / xhigh." },
  { id: "wish-rise", name: "Wish Rise", style: "ember", intensity: 2, speed: 0.9, description: "Soft wish lift." },
  { id: "zenith", name: "Zenith", style: "rainbow", intensity: 4, speed: 1.2, description: "High but not nova." },
] as const satisfies ReadonlyArray<{
  id: string;
  name: string;
  style: MotionStyleId;
  intensity: MotionIntensity;
  speed: number;
  description: string;
}>;

export type MotionCatalogEntry = (typeof MOTION_CATALOG)[number];
export type MotionCatalogId = MotionCatalogEntry["id"];

export const MOTION_CATALOG_COUNT = MOTION_CATALOG.length;

const CATALOG_BY_ID = Object.fromEntries(
  MOTION_CATALOG.map((entry) => [entry.id, entry]),
) as Record<MotionCatalogId, MotionCatalogEntry>;

export function parseThinkingLevel(
  raw: string | null | undefined,
): ThinkingLevel | null {
  if (raw == null) return null;
  for (const level of THINKING_LEVELS) {
    if (raw === level) return level;
  }
  return null;
}

export function getMotionCatalogEntry(id: MotionCatalogId): MotionCatalogEntry {
  return CATALOG_BY_ID[id];
}

export function thinkingMotion(
  level: Exclude<ThinkingLevel, "off">,
): MotionCatalogEntry;
export function thinkingMotion(level: "off"): null;
export function thinkingMotion(level: ThinkingLevel): MotionCatalogEntry | null;
export function thinkingMotion(level: ThinkingLevel): MotionCatalogEntry | null {
  switch (level) {
    case "minimal":
    case "low":
      return getMotionCatalogEntry("wisp");
    case "medium":
      return getMotionCatalogEntry("shimmer-work");
    case "high":
      return getMotionCatalogEntry("ember-relay");
    case "xhigh":
    case "max":
      return getMotionCatalogEntry("rainbow-ultra");
    case "off":
      return null;
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}
