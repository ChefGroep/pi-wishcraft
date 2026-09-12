/**
 * Welcome-motion policy: lantern flicker is on by default, and off when the
 * operator opts out or requests reduced motion.
 *
 * Host `prefers-reduced-motion` is not available in this TUI. Honor
 * `WISHCRAFT_REDUCED_MOTION` (any non-empty value other than 0/false/off/no)
 * as the portable override.
 */

import { reducedMotionEnabled } from "../motion/policy.ts";

export { reducedMotionEnabled };

export const WELCOME_LANTERN_TICK_MS = 100;
export const WELCOME_COUNTDOWN_MS = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Default on. `wishcraft.welcome.animateLantern: false` is the opt-out.
 * Reduced-motion env wins over the setting.
 */
export function lanternAnimationEnabled(
  wishcraftSettings: unknown,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (reducedMotionEnabled(env)) return false;
  if (!isRecord(wishcraftSettings)) return true;
  const welcome = wishcraftSettings.welcome;
  if (!isRecord(welcome)) return true;
  return welcome.animateLantern !== false;
}

/**
 * Overlay paint interval. Animated lanterns tick at ~10 fps; a still
 * lantern only needs the 1s countdown.
 */
export function welcomeOverlayTickMs(animate: boolean): number {
  return animate ? WELCOME_LANTERN_TICK_MS : WELCOME_COUNTDOWN_MS;
}
