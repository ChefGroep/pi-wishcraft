/**
 * `/wishcraft` overlay: grouped list, live edit, write-through to settings.
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { RuntimeState } from "../core/types.ts";
import { readSettings } from "../settings/settings-io.ts";
import { config as stateConfig, setConfig, PRESET_NAMES } from "../core/state.ts";
import { parsePowerlineConfig } from "../../config/powerline-config.ts";
import { parseMotionSettings } from "../../motion/policy.ts";
import {
  buildConfigGroups,
  displayValue,
  nextToggleValue,
  readConfigPath,
  writeConfigPath,
  type ConfigGroup,
  type ConfigItem,
  type ConfigValue,
} from "./wishcraft-config.ts";

const LIST_ROWS = 14;

type ConfigRow =
  | { type: "group"; title: string }
  | { type: "item"; group: number; item: ConfigItem };

type OverlayState = {
  settings: Record<string, unknown>;
  groups: ConfigGroup[];
  selected: number;
  editing: boolean;
  editBuffer: string;
};

type OverlaySession = {
  rt: RuntimeState;
  ctx: any;
  cwd: string;
  tui: any;
  theme: Theme;
  done: (r: null) => void;
  state: OverlayState;
};

function isPrintable(data: string): boolean {
  return data.length === 1 && data >= " " && data <= "~";
}

function coerce(item: ConfigItem, current: ConfigValue, next: string): ConfigValue {
  if (item.kind === "number") {
    const n = Number.parseInt(next, 10);
    return Number.isFinite(n) ? n : current;
  }
  return next;
}

function liveReloadFromSettings(
  rt: RuntimeState,
  item: ConfigItem,
  settings: Record<string, unknown>,
): void {
  if (item.path.startsWith("powerline")) {
    setConfig({
      ...stateConfig,
      ...parsePowerlineConfig(settings.powerline, PRESET_NAMES),
    });
    rt.tuiRef?.requestRender?.();
  }
  if (item.path.startsWith("wishcraft.motion")) {
    rt.motion.setSettings(parseMotionSettings(settings.wishcraft));
    rt.tuiRef?.requestRender?.();
  }
}

function buildRows(groups: ConfigGroup[]): ConfigRow[] {
  const rows: ConfigRow[] = [];
  groups.forEach((g, gi) => {
    rows.push({ type: "group", title: g.title });
    g.items.forEach((item) => rows.push({ type: "item", group: gi, item }));
  });
  return rows;
}

function currentItem(state: OverlayState): { group: number; item: ConfigItem } | null {
  const row = buildRows(state.groups)[state.selected];
  return row && row.type === "item" ? row : null;
}

function persist(
  session: OverlaySession,
  item: ConfigItem,
  value: ConfigValue,
  saved: string,
  failed: string,
): void {
  const ok = writeConfigPath(session.cwd, item.path, value);
  session.state.settings = readSettings(session.cwd);
  session.state.groups = buildConfigGroups(session.state.settings);
  liveReloadFromSettings(session.rt, item, session.state.settings);
  session.ctx.ui.notify(ok ? saved : failed, ok ? "info" : "warning");
}

function applyEdit(session: OverlaySession, next: string): void {
  const cur = currentItem(session.state);
  if (!cur) return;
  const { item } = cur;
  const value: ConfigValue =
    item.kind === "toggle"
      ? next === "on"
      : coerce(item, readConfigPath(session.state.settings, item.path), next);
  persist(
    session,
    item,
    value,
    `${item.label}: ${displayValue(item, value)} (saved)`,
    `${item.label} not saved (settings.json?)`,
  );
}

function cycleSelect(
  session: OverlaySession,
  item: ConfigItem,
  forward: boolean,
): void {
  const cur = readConfigPath(session.state.settings, item.path);
  const list = item.choices ?? [];
  const idx = list.indexOf(String(cur ?? list[0]));
  const next = list[(idx + (forward ? 1 : list.length - 1) + list.length) % list.length]!;
  persist(
    session,
    item,
    next,
    `${item.label}: ${next} (saved)`,
    `${item.label} not saved`,
  );
}

function toggleItem(session: OverlaySession, item: ConfigItem): void {
  const cur = readConfigPath(session.state.settings, item.path);
  const next = nextToggleValue(item, cur);
  persist(
    session,
    item,
    next,
    `${item.label}: ${next ? "on" : "off"} (saved)`,
    `${item.label} not saved`,
  );
}

function renderConfigOverlay(session: OverlaySession, width: number): string[] {
  const { theme, state } = session;
  const border = (t: string) => theme.fg("dim", t);
  const wrapRow = (t: string, w: number) =>
    `${border("│")}${truncateToWidth(t, w, "…", true)}${border("│")}`;
  const innerWidth = Math.max(1, width - 2);
  const lines: string[] = [];
  lines.push(border(`╭${"─".repeat(innerWidth)}╮`));
  lines.push(
    wrapRow(theme.fg("accent", theme.bold("Wishcraft · configuration")), innerWidth),
  );
  lines.push(border(`├${"─".repeat(innerWidth)}┤`));

  const rows = buildRows(state.groups);
  let start = Math.max(0, state.selected - Math.floor(LIST_ROWS / 2));
  let end = Math.min(start + LIST_ROWS, rows.length);
  if (end - start < Math.min(LIST_ROWS, rows.length)) start = Math.max(0, end - LIST_ROWS);

  for (let i = start; i < end; i++) {
    const row = rows[i]!;
    if (row.type === "group") {
      lines.push(wrapRow(theme.fg("dim", `── ${row.title} ──`), innerWidth));
      continue;
    }
    const isSel = i === state.selected;
    const value = readConfigPath(state.settings, row.item.path);
    const shown =
      state.editing && isSel ? state.editBuffer + "▏" : displayValue(row.item, value);
    const prefix = isSel ? (state.editing ? "✎ " : "→ ") : "  ";
    const name = isSel
      ? theme.fg("accent", `${prefix}${row.item.label}`)
      : theme.fg("text", `${prefix}${row.item.label}`);
    const val = theme.fg(state.editing && isSel ? "accent" : "muted", shown);
    const pad = " ".repeat(Math.max(1, innerWidth - row.item.label.length - shown.length - 8));
    lines.push(wrapRow(`${name}${pad}${val}`, innerWidth));
  }
  if (start > 0 || end < rows.length) {
    lines.push(wrapRow(theme.fg("dim", `(${state.selected}/${rows.length})`), innerWidth));
  }

  lines.push(border(`├${"─".repeat(innerWidth)}┤`));
  lines.push(
    wrapRow(
      theme.fg(
        "dim",
        state.editing
          ? "type=value · enter=save · esc=cancel"
          : "↑↓ · enter=select/edit (←→ cycles) · esc=close",
      ),
      innerWidth,
    ),
  );
  lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
  return lines;
}

function handleConfigInput(session: OverlaySession, data: string): void {
  const { state, tui, done } = session;
  const rows = buildRows(state.groups);
  if (state.editing) {
    if (matchesKey(data, "escape")) {
      state.editing = false;
      state.editBuffer = "";
    } else if (matchesKey(data, "enter")) {
      if (state.editBuffer.trim() !== "") applyEdit(session, state.editBuffer.trim());
      state.editing = false;
      state.editBuffer = "";
    } else if (matchesKey(data, "backspace")) {
      state.editBuffer = state.editBuffer.slice(0, -1);
    } else if (data === "\x15") {
      state.editBuffer = "";
    } else if (isPrintable(data)) {
      state.editBuffer += data;
    }
    tui.requestRender();
    return;
  }

  if (matchesKey(data, "escape") || data === "\x03") {
    done(null);
    return;
  }
  if (matchesKey(data, "up")) {
    do {
      state.selected = state.selected === 0 ? rows.length - 1 : state.selected - 1;
    } while (rows[state.selected]!.type === "group");
  } else if (matchesKey(data, "down")) {
    do {
      state.selected = state.selected === rows.length - 1 ? 0 : state.selected + 1;
    } while (rows[state.selected]!.type === "group");
  } else if (matchesKey(data, "pageUp")) {
    state.selected = Math.max(1, state.selected - LIST_ROWS);
    while (state.selected < rows.length - 1 && rows[state.selected]!.type === "group")
      state.selected++;
  } else if (matchesKey(data, "pageDown")) {
    state.selected = Math.min(rows.length - 1, state.selected + LIST_ROWS);
    while (state.selected > 1 && rows[state.selected]!.type === "group") state.selected--;
  } else {
    const cur = currentItem(state);
    if (!cur) return;
    const { item } = cur;
    if (matchesKey(data, "enter") || matchesKey(data, "right")) {
      if (item.kind === "toggle") toggleItem(session, item);
      else if (item.kind === "select" && item.choices) cycleSelect(session, item, true);
      else {
        state.editing = true;
        const v = readConfigPath(state.settings, item.path);
        state.editBuffer = v === null ? "" : String(v);
      }
    } else if (matchesKey(data, "left")) {
      if (item.kind === "select" && item.choices) cycleSelect(session, item, false);
      else if (item.kind === "toggle") toggleItem(session, item);
    } else if (item.kind === "toggle" && (data === " " || data === "t")) {
      toggleItem(session, item);
    }
  }
  tui.requestRender();
}

export async function showWishcraftConfig(rt: RuntimeState, ctx: any): Promise<void> {
  const cwd = ctx.cwd ?? process.cwd();
  const settings = readSettings(cwd);
  const state: OverlayState = {
    settings,
    groups: buildConfigGroups(settings),
    selected: 1,
    editing: false,
    editBuffer: "",
  };

  await ctx.ui.custom(
    (tui: any, theme: Theme, _kb: any, done: (r: null) => void) => {
      const session: OverlaySession = { rt, ctx, cwd, tui, theme, done, state };
      return {
        render: (width: number) => renderConfigOverlay(session, width),
        invalidate: () => {},
        handleInput: (data: string) => handleConfigInput(session, data),
      };
    },
    {
      overlay: true,
      overlayOptions: () => ({ verticalAlign: "center", horizontalAlign: "center" }),
    },
  );
}

export function registerWishcraftConfigCommand(pi: ExtensionAPI, rt: RuntimeState): void {
  pi.registerCommand("wishcraft", {
    description: "Configure all wishcraft settings in one overlay (status bar, welcome, hooks, shortcuts)",
    handler: async (_args: string, ctx: any) => {
      if (!rt.enabled || !ctx.hasUI) {
        ctx.ui.notify("Powerline UI is disabled", "info");
        return;
      }
      rt.currentCtx = ctx;
      await showWishcraftConfig(rt, ctx);
    },
  });
}
