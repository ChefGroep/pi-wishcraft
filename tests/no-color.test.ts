import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const welcomeProbe = fileURLToPath(
  new URL("./fixtures/welcome-render-probe.ts", import.meta.url),
);

/** Spawn the welcome-box probe with `NO_COLOR` set, empty, or unset. */
function spawnWelcomeBox(noColor: string | undefined) {
  const env = { ...process.env };
  if (noColor === undefined) delete env.NO_COLOR;
  else env.NO_COLOR = noColor;
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", welcomeProbe],
    { cwd: repoRoot, env, encoding: "utf8" },
  );
}

// colors.ts probes NO_COLOR lazily and caches the result per module instance,
// so each case imports a fresh copy via a cache-busting query.
/** Import `colors.ts` with a unique query so `NO_COLOR` is re-read. */
async function importFreshColors(nocache: string | undefined) {
  const url = new URL(`../src/theme/colors.ts`, import.meta.url);
  url.searchParams.set("case", String(nocache));
  const mod = await import(url.href);
  return mod as typeof import("../src/theme/colors.ts");
}

/** Run `fn` with `NO_COLOR` set, empty, or deleted, then restore it. */
function withNoColor<T>(value: string | undefined, run: () => T): T {
  const original = process.env.NO_COLOR;
  try {
    if (value === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = value;
    return run();
  } finally {
    if (original === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = original;
  }
}

test("NO_COLOR present and non-empty disables wishcraft color", async () => {
  const { colorEnabled, fgOnly, getFgAnsiCode } = await importFreshColors("1");
  withNoColor("1", () => {
    assert.equal(colorEnabled(), false);
    assert.equal(fgOnly("accent", "text"), "text");
    assert.equal(getFgAnsiCode("model"), "");
    assert.equal(fgOnly("sep", "text"), "text");
  });
});

test("empty NO_COLOR keeps color enabled", async () => {
  const { colorEnabled } = await importFreshColors("");
  withNoColor("", () => {
    assert.equal(colorEnabled(), true);
  });
});

test("unset NO_COLOR keeps color enabled", async () => {
  const { colorEnabled } = await importFreshColors("unset");
  withNoColor(undefined, () => {
    assert.equal(colorEnabled(), true);
  });
});

test("renderWelcomeBox emits no CSI when NO_COLOR is set", () => {
  const result = spawnWelcomeBox("1");
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.length > 0);
  assert.equal(result.stdout.includes("\x1b["), false);
});

test("renderWelcomeBox still emits CSI when NO_COLOR is unset", () => {
  const result = spawnWelcomeBox(undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("\x1b["));
});
