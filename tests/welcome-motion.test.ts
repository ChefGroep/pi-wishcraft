import test from "node:test";
import assert from "node:assert/strict";
import {
  lanternAnimationEnabled,
  reducedMotionEnabled,
  welcomeOverlayTickMs,
  WELCOME_COUNTDOWN_MS,
  WELCOME_LANTERN_TICK_MS,
} from "../src/welcome/motion-policy.ts";

test("lantern animation defaults on and opts out per setting", () => {
  assert.equal(lanternAnimationEnabled(undefined), true);
  assert.equal(lanternAnimationEnabled({}), true);
  assert.equal(lanternAnimationEnabled({ welcome: {} }), true);
  assert.equal(
    lanternAnimationEnabled({ welcome: { animateLantern: true } }),
    true,
  );
  assert.equal(
    lanternAnimationEnabled({ welcome: { animateLantern: false } }),
    false,
  );
});

test("WISHCRAFT_REDUCED_MOTION wins over animateLantern", () => {
  assert.equal(reducedMotionEnabled({}), false);
  assert.equal(reducedMotionEnabled({ WISHCRAFT_REDUCED_MOTION: "" }), false);
  assert.equal(reducedMotionEnabled({ WISHCRAFT_REDUCED_MOTION: "0" }), false);
  assert.equal(
    reducedMotionEnabled({ WISHCRAFT_REDUCED_MOTION: "false" }),
    false,
  );
  assert.equal(reducedMotionEnabled({ WISHCRAFT_REDUCED_MOTION: "1" }), true);
  assert.equal(
    lanternAnimationEnabled(
      { welcome: { animateLantern: true } },
      { WISHCRAFT_REDUCED_MOTION: "1" },
    ),
    false,
  );
});

test("welcome overlay ticks faster only while the lantern animates", () => {
  assert.equal(welcomeOverlayTickMs(true), WELCOME_LANTERN_TICK_MS);
  assert.equal(welcomeOverlayTickMs(false), WELCOME_COUNTDOWN_MS);
  assert.equal(WELCOME_LANTERN_TICK_MS, 100);
  assert.equal(WELCOME_COUNTDOWN_MS, 1000);
});
