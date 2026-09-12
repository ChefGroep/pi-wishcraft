import test from "node:test";
import assert from "node:assert/strict";
import {
  lanternGainAt,
  lanternRegionAt,
  renderLantern,
  LANTERN_HEIGHT,
  LANTERN_WIDTH,
} from "../src/welcome/lantern.ts";
import { renderWelcomeBox } from "../src/welcome/renderer.ts";
import type { WelcomeData } from "../src/welcome/types.ts";

const FLAME = { x: 8, y: 5 };
const PAPER = { x: 0, y: 5 };
const TASSEL = { x: 0, y: 24 };

const welcomeData: WelcomeData = {
  modelName: "test-model",
  providerName: "test-provider",
  recentSessions: [],
  loadedCounts: {
    contextFiles: 0,
    extensions: 0,
    skills: 0,
    promptTemplates: 0,
  },
  initialContextTokens: null,
};

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function gainRange(x: number, y: number): number {
  const samples: number[] = [];
  for (let now = 0; now < 4000; now += 40) {
    samples.push(lanternGainAt(now, x, y));
  }
  return Math.max(...samples) - Math.min(...samples);
}

test("lantern art fits the welcome left column", () => {
  assert.equal(LANTERN_WIDTH, 18);
  assert.ok(LANTERN_WIDTH <= 26);
  assert.ok(LANTERN_HEIGHT >= 8);
});

test("lantern regions split flame, paper, and tassel", () => {
  assert.equal(lanternRegionAt(FLAME.x, FLAME.y), "flame");
  assert.equal(lanternRegionAt(PAPER.x, PAPER.y), "paper");
  assert.equal(lanternRegionAt(TASSEL.x, TASSEL.y), "tassel");
  assert.equal(lanternRegionAt(0, 0), null);
});

test("still lantern gain is 1 at every filled cell", () => {
  assert.equal(lanternGainAt(0, FLAME.x, FLAME.y, true), 1);
  assert.equal(lanternGainAt(1700, FLAME.x, FLAME.y, true), 1);
  assert.equal(lanternGainAt(1700, PAPER.x, PAPER.y, true), 1);
});

test("flame flicker is spatial and stronger than paper breathe", () => {
  let spatial = false;
  for (let now = 0; now < 2000; now += 10) {
    if (lanternGainAt(now, 7, FLAME.y) !== lanternGainAt(now, 9, FLAME.y)) {
      spatial = true;
      break;
    }
  }
  assert.equal(spatial, true);
  assert.ok(gainRange(FLAME.x, FLAME.y) > gainRange(PAPER.x, PAPER.y));
  assert.ok(gainRange(FLAME.x, FLAME.y) > 0.2);
  assert.ok(gainRange(PAPER.x, PAPER.y) < 0.15);
});

test("still lantern frames do not change with time", () => {
  const a = renderLantern({ now: 0, still: true, color: true }, 80).join("\n");
  const b = renderLantern({ now: 2400, still: true, color: true }, 80).join(
    "\n",
  );
  assert.equal(a, b);
  assert.match(a, /▀/);
});

test("animated lantern frames change with time", () => {
  const a = renderLantern({ now: 0, still: false, color: true }, 80).join("\n");
  const b = renderLantern({ now: 420, still: false, color: true }, 80).join(
    "\n",
  );
  assert.notEqual(a, b);
});

test("colorless lantern is a half-block silhouette", () => {
  const lines = renderLantern({ now: 90, still: false, color: false }, 80);
  const text = lines.join("\n");
  assert.equal(text.includes("\x1b["), false);
  assert.match(text, /[▀▄]/);
});

test("welcome box paints the lantern instead of the ascii fallback", () => {
  const lines = renderWelcomeBox(welcomeData, 96, "bottom", {
    now: 0,
    still: true,
  });
  const plain = stripAnsi(lines.join("\n"));
  assert.match(plain, /▀/);
  assert.doesNotMatch(plain, /╭───╮/);
});
