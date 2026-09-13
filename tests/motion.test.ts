import test from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";

import {
  MOTION_CATALOG,
  MOTION_CATALOG_COUNT,
  getMotionCatalogEntry,
  parseThinkingLevel,
  thinkingMotion,
} from "../src/motion/catalog.ts";
import { KEYWORD_COUNT, keywordCatalog, matchKeyword } from "../src/motion/keywords.ts";
import {
  applyMotionStyle,
  stripMotionAnsi,
} from "../src/motion/primitives.ts";
import { KEYWORD_BURST_MS } from "../src/motion/types.ts";
import { parseMotionSettings } from "../src/motion/policy.ts";
import {
  NONE_PAINT,
  createMotionRuntime,
  decorateKeywordLine,
  decoratePowerlineLine,
  resolveMotionPaint,
} from "../src/motion/runtime.ts";

test("motion catalog has 30 unique named entries", () => {
  assert.equal(MOTION_CATALOG_COUNT, 30);
  assert.equal(MOTION_CATALOG.length, 30);
  const ids = MOTION_CATALOG.map((entry) => entry.id);
  assert.equal(new Set(ids).size, 30);
});

test("keyword catalog is at least 30 unique word-boundary triggers", () => {
  assert.ok(KEYWORD_COUNT >= 30);
  const keywords = keywordCatalog();
  const ids = keywords.map((entry) => entry.id);
  const patterns = keywords.map((entry) => entry.pattern);
  assert.equal(new Set(ids).size, keywords.length);
  assert.equal(new Set(patterns).size, keywords.length);
  for (const entry of keywords) {
    assert.equal(
      getMotionCatalogEntry(entry.catalogId).id,
      entry.catalogId,
      `missing catalog id ${entry.catalogId} for ${entry.id}`,
    );
  }
});

test("keyword matching is longest-first and word-boundary", () => {
  assert.equal(matchKeyword("please ultrathink this")?.id, "ultrathink");
  assert.equal(matchKeyword("think harder about it")?.id, "think-harder");
  assert.equal(matchKeyword("think hard about it")?.id, "think-hard");
  assert.equal(matchKeyword("I think so")?.id, "think");
  assert.equal(matchKeyword("go ultra now")?.id, "ultrathink-alias-ultra");
  assert.equal(matchKeyword("thinking") , null);
  assert.equal(matchKeyword("maximum"), null);
  assert.equal(matchKeyword("ULTRATHINK")?.pattern, "ultrathink");
});

test("applyMotionStyle changes over time and keeps visible width", () => {
  const sample = "  Working · claude-sonnet  ";
  const t0 = applyMotionStyle(sample, "rainbow", 5, 0);
  const t1 = applyMotionStyle(sample, "rainbow", 5, 400);
  const shimmer0 = applyMotionStyle(sample, "shimmer", 2, 0);
  assert.notEqual(t0, t1);
  assert.notEqual(t0, shimmer0);
  assert.equal(visibleWidth(t0), visibleWidth(sample));
  assert.equal(visibleWidth(t1), visibleWidth(sample));
  assert.equal(stripMotionAnsi(t0), stripMotionAnsi(sample).replace(/\x1b\[[0-9;]*m/g, ""));
});

test("resolveMotionPaint priority is keyword, then thinking, then streaming shimmer", () => {
  const keyword = matchKeyword("ultrathink");
  assert.ok(keyword);

  const idle = resolveMotionPaint({
    settings: { enabled: true, keywords: true },
    streaming: false,
    thinkingLevel: "max",
    keyword: null,
    burstUntil: 0,
    now: 0,
    color: true,
  });
  assert.equal(idle.kind, "none");

  const burst = resolveMotionPaint({
    settings: { enabled: true, keywords: true },
    streaming: true,
    thinkingLevel: "medium",
    keyword,
    burstUntil: 2000,
    now: 0,
    color: true,
  });
  assert.equal(burst.kind, "keyword");
  assert.equal(burst.style, "rainbow");
  assert.equal(burst.burst, true);
  assert.equal(burst.catalogId, "ultrathink");

  const hold = resolveMotionPaint({
    settings: { enabled: true, keywords: true },
    streaming: false,
    thinkingLevel: null,
    keyword,
    burstUntil: 100,
    now: 2000,
    color: true,
  });
  assert.equal(hold.kind, "keyword");
  assert.equal(hold.style, "rainbow");
  assert.equal(hold.burst, false);

  const thinking = resolveMotionPaint({
    settings: { enabled: true, keywords: true },
    streaming: true,
    thinkingLevel: "xhigh",
    keyword: null,
    burstUntil: 0,
    now: 0,
    color: true,
  });
  assert.equal(thinking.kind, "catalog");
  assert.equal(thinking.catalogId, "rainbow-ultra");
  assert.equal(thinking.style, "rainbow");

  const streaming = resolveMotionPaint({
    settings: { enabled: true, keywords: true },
    streaming: true,
    thinkingLevel: "off",
    keyword: null,
    burstUntil: 0,
    now: 0,
    color: true,
  });
  assert.equal(streaming.kind, "catalog");
  assert.equal(streaming.catalogId, "shimmer-work");

  const reduced = resolveMotionPaint({
    settings: { enabled: true, keywords: true },
    streaming: true,
    thinkingLevel: "max",
    keyword,
    burstUntil: 9999,
    now: 0,
    env: { WISHCRAFT_REDUCED_MOTION: "1" },
    color: true,
  });
  assert.equal(reduced.kind, "none");

  const noColor = resolveMotionPaint({
    settings: { enabled: true, keywords: true },
    streaming: true,
    thinkingLevel: "max",
    keyword,
    burstUntil: 9999,
    now: 0,
    color: false,
  });
  assert.equal(noColor.kind, "none");
});

test("thinkingMotion maps high effort to rainbow and low effort to wisp", () => {
  assert.equal(thinkingMotion("minimal").id, "wisp");
  assert.equal(thinkingMotion("low").id, "wisp");
  assert.equal(thinkingMotion("medium").id, "shimmer-work");
  assert.equal(thinkingMotion("high").id, "ember-relay");
  assert.equal(thinkingMotion("xhigh").id, "rainbow-ultra");
  assert.equal(thinkingMotion("max").id, "rainbow-ultra");
  assert.equal(thinkingMotion("off"), null);
  assert.equal(parseThinkingLevel("max"), "max");
  assert.equal(parseThinkingLevel("nope"), null);
  assert.equal(parseThinkingLevel(null), null);
});

test("parseMotionSettings defaults on", () => {
  assert.deepEqual(parseMotionSettings(undefined), {
    enabled: true,
    keywords: true,
  });
  assert.deepEqual(parseMotionSettings({ motion: { enabled: false } }), {
    enabled: false,
    keywords: true,
  });
  assert.deepEqual(
    parseMotionSettings({ motion: { enabled: true, keywords: false } }),
    { enabled: true, keywords: false },
  );
});

test("motion runtime bursts then holds a keyword and idles without one", () => {
  let now = 1000;
  let streaming = false;
  let thinkingLevel: string | null = null;
  const paints: number[] = [];
  const runtime = createMotionRuntime({
    paint: () => {
      paints.push(now);
    },
    getStreaming: () => streaming,
    getThinkingLevel: () => thinkingLevel,
    now: () => now,
    color: () => true,
  });

  try {
    assert.equal(runtime.getPaint().kind, "none");
    runtime.noteText("please ultrathink this");
    const burst = runtime.getPaint();
    assert.equal(burst.kind, "keyword");
    assert.equal(burst.style, "rainbow");
    assert.equal(burst.burst, true);
    assert.ok(paints.length >= 1);

    now = 1000 + KEYWORD_BURST_MS + 50;
    const hold = runtime.getPaint();
    assert.equal(hold.kind, "keyword");
    assert.equal(hold.style, "rainbow");
    assert.equal(hold.burst, false);

    runtime.noteText("plain question");
    assert.equal(runtime.getPaint().kind, "none");

    streaming = true;
    thinkingLevel = "high";
    runtime.arm();
    const streamingPaint = runtime.getPaint();
    assert.equal(streamingPaint.kind, "catalog");
    assert.equal(streamingPaint.catalogId, "ember-relay");

    runtime.setSettings({ enabled: false, keywords: true });
    assert.equal(runtime.getPaint().kind, "none");
  } finally {
    runtime.reset();
  }
});

test("decorate helpers keep width and skip when paint is none", () => {
  const line = " model · git · cost ";
  const paint = resolveMotionPaint({
    settings: { enabled: true, keywords: true },
    streaming: true,
    thinkingLevel: "max",
    keyword: null,
    burstUntil: 0,
    now: 80,
    color: true,
  });
  const overlay = decoratePowerlineLine(line, paint, 80);
  assert.notEqual(overlay, line);
  assert.equal(visibleWidth(overlay), visibleWidth(line));
  assert.equal(decoratePowerlineLine(line, NONE_PAINT, 80), line);

  const prompt = "please ultrathink the plan";
  const styled = decorateKeywordLine(
    prompt,
    { enabled: true, keywords: true },
    80,
    {},
    true,
  );
  assert.notEqual(styled, prompt);
  assert.equal(visibleWidth(styled), visibleWidth(prompt));
  assert.match(stripMotionAnsi(styled), /ultrathink/);
  assert.equal(
    decorateKeywordLine(prompt, { enabled: true, keywords: false }, 80, {}, true),
    prompt,
  );
});
