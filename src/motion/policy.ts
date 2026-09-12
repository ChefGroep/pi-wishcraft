/**
 * Motion policy: settings + env. Host prefers-reduced-motion is not
 * available in this TUI; WISHCRAFT_REDUCED_MOTION is the override.
 */

import { colorEnabled } from "../theme/colors.ts";
import type { MotionSettings } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function reducedMotionEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.WISHCRAFT_REDUCED_MOTION;
  if (raw == null || raw === "") return false;
  const normalized = raw.trim().toLowerCase();
  return (
    normalized !== "0" &&
    normalized !== "false" &&
    normalized !== "off" &&
    normalized !== "no"
  );
}

/** Default on. `wishcraft.motion.enabled: false` opts out. */
export function parseMotionSettings(wishcraftSettings: unknown): MotionSettings {
  if (!isRecord(wishcraftSettings)) {
    return { enabled: true, keywords: true };
  }
  const motion = wishcraftSettings.motion;
  if (!isRecord(motion)) {
    return { enabled: true, keywords: true };
  }
  return {
    enabled: motion.enabled !== false,
    keywords: motion.keywords !== false,
  };
}

export function motionPaintAllowed(
  settings: MotionSettings,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    settings.enabled &&
    !reducedMotionEnabled(env) &&
    colorEnabled()
  );
}
