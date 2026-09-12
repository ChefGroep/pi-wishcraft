import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const renderers = readFileSync(
  new URL("../src/extension/ui/status-line-renderers.ts", import.meta.url),
  "utf8",
);
const editor = readFileSync(
  new URL("../src/extension/ui/custom-editor.ts", import.meta.url),
  "utf8",
);
const lifecycle = readFileSync(
  new URL("../src/extension/session/session-lifecycle.ts", import.meta.url),
  "utf8",
);
const state = readFileSync(
  new URL("../src/extension/core/state.ts", import.meta.url),
  "utf8",
);
const runtime = readFileSync(
  new URL("../src/motion/runtime.ts", import.meta.url),
  "utf8",
);
const thinking = readFileSync(
  new URL("../src/segments/system.ts", import.meta.url),
  "utf8",
);

test("powerline renderers overlay motion after the layout cache", () => {
  assert.match(renderers, /decoratePowerlineLine\(/);
  assert.match(renderers, /rt\.motion\.getPaint\(/);
  assert.match(renderers, /decorateKeywordLine\(/);
  assert.match(renderers, /getResponsiveLayout\(rt, width, theme\)/);
  assert.doesNotMatch(renderers, /layoutDirty = true/);
});

test("editor drafts feed motion.noteText without bash mode", () => {
  assert.match(editor, /rt\.motion\.noteText\(/);
  assert.match(editor, /if \(!rt\.bashModeActive\)/);
  assert.match(editor, /originalHandleInput\(data\)/);
});

test("session lifecycle arms motion on stream edges and resets per session", () => {
  assert.match(lifecycle, /rt\.motion\.reset\(\)/);
  assert.match(lifecycle, /rt\.motion\.setSettings\(parseMotionSettings\(settings\.wishcraft\)\)/);
  assert.match(lifecycle, /rt\.motion\.noteText\(event\.prompt\)/);
  assert.match(lifecycle, /rt\.motion\.arm\(\)/);
  assert.match(state, /createMotionRuntime\(/);
  assert.match(state, /rt\.tuiRef\?\.requestRender\(\)/);
  assert.doesNotMatch(runtime, /extension\/core\/state/);
});

test("thinking segment stays solid color; motion is a post-process overlay", () => {
  assert.doesNotMatch(thinking, /applyMotionStyle/);
  assert.doesNotMatch(thinking, /rainbow-ultra/);
});
