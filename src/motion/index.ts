export type {
  KeywordHit,
  MotionCatalogEntry,
  MotionIntensity,
  MotionPaint,
  MotionRuntime,
  MotionSettings,
  MotionStyleId,
} from "./types.ts";
export { KEYWORD_BURST_MS, MOTION_TICK_MS } from "./types.ts";
export {
  motionPaintAllowed,
  parseMotionSettings,
  reducedMotionEnabled,
} from "./policy.ts";
export {
  applyKeywordSpan,
  applyMotionStyle,
  stripMotionAnsi,
  visibleChars,
} from "./primitives.ts";
export { KEYWORD_COUNT, keywordCatalog, matchKeyword } from "./keywords.ts";
export {
  MOTION_CATALOG,
  MOTION_CATALOG_COUNT,
  getMotionCatalogEntry,
  thinkingMotion,
} from "./catalog.ts";
export {
  NONE_PAINT,
  createMotionRuntime,
  decorateKeywordLine,
  decoratePowerlineLine,
  resolveMotionPaint,
} from "./runtime.ts";
export type { MotionRuntimeOptions, ResolveMotionPaintInput } from "./runtime.ts";
