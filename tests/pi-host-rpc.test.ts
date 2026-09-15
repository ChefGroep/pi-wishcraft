import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const extensionEntry = fileURLToPath(new URL("../index.ts", import.meta.url));
const piCli = fileURLToPath(
  new URL(
    "../node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
    import.meta.url,
  ),
);

// The pi host (@earendil-works/pi-coding-agent) declares engines >=22.19.0.
// Running it under an older Node exits before the extension can activate, so the
// integration test skips there instead of failing. CI runs Node 24 and exercises
// it for real; older local toolchains (and environments where the host is not
// installed) skip cleanly so `npm test` stays green everywhere.
function nodeSupportsHost(): boolean {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major === undefined || minor === undefined) return false;
  return major > 22 || (major === 22 && minor >= 19);
}

const skip = !existsSync(piCli)
  ? `pi host not installed at ${piCli}`
  : !nodeSupportsHost()
    ? `pi host requires Node >=22.19 (running ${process.versions.node})`
    : false;

interface ActivationProbe {
  commands: Array<{ name: string; source: string }>;
  widgets: string[];
  statuses: string[];
}

/**
 * Boot the real pi host in headless RPC mode with the wishcraft extension
 * loaded, ask it for the registered slash commands, and collect the UI
 * registrations the extension emits during activation. No model/API key is
 * required: `get_commands` and the activation UI requests are answered locally.
 */
function probeActivation(timeoutMs = 30_000): Promise<ActivationProbe> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        piCli,
        "--mode",
        "rpc",
        "-e",
        extensionEntry,
        "--offline",
        "--no-session",
        "--no-tools",
      ],
      { cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"] },
    );

    const widgets = new Set<string>();
    const statuses = new Set<string>();
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.stdin.end();
      } catch {
        // ignore
      }
      child.kill();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            `pi host RPC probe timed out after ${timeoutMs}ms.\nstderr:\n${stderr}`,
          ),
        ),
      );
    }, timeoutMs);

    child.on("error", (err) => finish(() => reject(err)));

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      let newline: number;
      while ((newline = stdout.indexOf("\n")) >= 0) {
        const line = stdout.slice(0, newline);
        stdout = stdout.slice(newline + 1);
        if (!line.trim()) continue;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        if (msg.type === "extension_ui_request") {
          if (msg.method === "setWidget" && typeof msg.widgetKey === "string") {
            widgets.add(msg.widgetKey);
          }
          if (msg.method === "setStatus" && typeof msg.statusKey === "string") {
            statuses.add(msg.statusKey);
          }
        }
        if (msg.type === "response" && msg.command === "get_commands") {
          if (msg.success !== true) {
            finish(() =>
              reject(new Error(`get_commands failed: ${String(msg.error)}`)),
            );
            return;
          }
          const data = msg.data as {
            commands: Array<{ name: string; source: string }>;
          };
          finish(() =>
            resolve({
              commands: data.commands,
              widgets: [...widgets],
              statuses: [...statuses],
            }),
          );
          return;
        }
      }
    });

    // Give the extension a moment to activate, then request the command list.
    setTimeout(() => {
      if (settled) return;
      child.stdin.write(
        `${JSON.stringify({ type: "get_commands", id: "1" })}\n`,
      );
    }, 1_500);
  });
}

test(
  "pi host loads the wishcraft extension and registers its slash commands",
  { skip },
  async () => {
    const { commands } = await probeActivation();
    const byName = new Map(commands.map((c) => [c.name, c]));

    // Core user-facing commands documented in README/docs must be registered by
    // the extension when the real host activates it.
    const expected = [
      "powerline",
      "tps",
      "usage",
      "repairs",
      "ideas",
      "idea",
      "queue",
      "skills",
      "bash-mode",
      "wishcraft",
      "vibe",
      "open-ports",
      "cd",
    ];
    for (const name of expected) {
      const cmd = byName.get(name);
      assert.ok(cmd, `expected the host to register the /${name} command`);
      assert.equal(
        cmd.source,
        "extension",
        `/${name} should be an extension command, got ${cmd.source}`,
      );
    }
  },
);

test(
  "pi host activation renders the wishcraft powerline widgets",
  { skip },
  async () => {
    const { widgets, statuses } = await probeActivation();
    for (const widget of ["powerline-top", "powerline-status"]) {
      assert.ok(
        widgets.includes(widget),
        `expected the extension to register the ${widget} widget, got: ${widgets.join(", ")}`,
      );
    }
    assert.ok(
      statuses.some((key) => key.startsWith("powerline.")),
      `expected a powerline.* status registration, got: ${statuses.join(", ")}`,
    );
  },
);
