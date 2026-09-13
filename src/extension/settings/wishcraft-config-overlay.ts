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
  type ConfigItem,
  type ConfigValue,
} from "./wishcraft-config.ts";

const LIST_ROWS = 14;

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

export async function showWishcraftConfig(rt: RuntimeState, ctx: any): Promise<void> {
  const cwd = ctx.cwd ?? process.cwd();
  let settings = readSettings(cwd);
  let groups = buildConfigGroups(settings);

  type Row =
    | { type: "group"; title: string }
    | { type: "item"; group: number; item: ConfigItem };
  const buildRows = (): Row[] => {
    const rows: Row[] = [];
    groups.forEach((g, gi) => {
      rows.push({ type: "group", title: g.title });
      g.items.forEach((item) => rows.push({ type: "item", group: gi, item }));
    });
    return rows;
  };

  await ctx.ui.custom(
    (tui: any, theme: Theme, _kb: any, done: (r: null) => void) => {
      const border = (t: string) => theme.fg("dim", t);
      const wrapRow = (t: string, w: number) =>
        `${border("│")}${truncateToWidth(t, w, "…", true)}${border("│")}`;

      let selected = 1;
      let editing = false;
      let editBuffer = "";

      const currentItem = (): { group: number; item: ConfigItem } | null => {
        const rows = buildRows();
        const row = rows[selected];
        return row && row.type === "item" ? row : null;
      };

      const applyEdit = (next: string) => {
        const cur = currentItem();
        if (!cur) return;
        const { item } = cur;
        let value: ConfigValue;
        if (item.kind === "toggle") value = next === "on";
        else value = coerce(item, readConfigPath(settings, item.path), next);
        const ok = writeConfigPath(cwd, item.path, value);
        settings = readSettings(cwd);
        groups = buildConfigGroups(settings);
        liveReloadFromSettings(rt, item, settings);
        ctx.ui.notify(
          ok ? `${item.label}: ${displayValue(item, value)} (saved)` : `${item.label} not saved (settings.json?)`,
          ok ? "info" : "warning",
        );
      };

      const cycleSelect = (item: ConfigItem, forward: boolean) => {
        const cur = readConfigPath(settings, item.path);
        const list = item.choices ?? [];
        const idx = list.indexOf(String(cur ?? list[0]));
        const next = list[(idx + (forward ? 1 : list.length - 1) + list.length) % list.length]!;
        const ok = writeConfigPath(cwd, item.path, next);
        settings = readSettings(cwd);
        groups = buildConfigGroups(settings);
        liveReloadFromSettings(rt, item, settings);
        ctx.ui.notify(
          ok ? `${item.label}: ${next} (saved)` : `${item.label} not saved`,
          ok ? "info" : "warning",
        );
      };

      const toggle = (item: ConfigItem) => {
        const cur = readConfigPath(settings, item.path);
        const ok = writeConfigPath(cwd, item.path, nextToggleValue(item, cur));
        settings = readSettings(cwd);
        groups = buildConfigGroups(settings);
        liveReloadFromSettings(rt, item, settings);
        ctx.ui.notify(
          ok ? `${item.label}: ${!(cur === true) ? "on" : "off"} (saved)` : `${item.label} not saved`,
          ok ? "info" : "warning",
        );
      };

      return {
        render: (width: number) => {
          const innerWidth = Math.max(1, width - 2);
          const lines: string[] = [];
          lines.push(border(`╭${"─".repeat(innerWidth)}╮`));
          lines.push(
            wrapRow(theme.fg("accent", theme.bold("Wishcraft · configuration")), innerWidth),
          );
          lines.push(border(`├${"─".repeat(innerWidth)}┤`));

          const rows = buildRows();
          let start = Math.max(0, selected - Math.floor(LIST_ROWS / 2));
          let end = Math.min(start + LIST_ROWS, rows.length);
          if (end - start < Math.min(LIST_ROWS, rows.length)) start = Math.max(0, end - LIST_ROWS);

          for (let i = start; i < end; i++) {
            const row = rows[i]!;
            if (row.type === "group") {
              lines.push(wrapRow(theme.fg("dim", `── ${row.title} ──`), innerWidth));
              continue;
            }
            const isSel = i === selected;
            const value = readConfigPath(settings, row.item.path);
            const shown = editing && isSel ? editBuffer + "▏" : displayValue(row.item, value);
            const prefix = isSel ? (editing ? "✎ " : "→ ") : "  ";
            const name = isSel
              ? theme.fg("accent", `${prefix}${row.item.label}`)
              : theme.fg("text", `${prefix}${row.item.label}`);
            const val = theme.fg(editing && isSel ? "accent" : "muted", shown);
            const pad = " ".repeat(Math.max(1, innerWidth - row.item.label.length - shown.length - 8));
            lines.push(wrapRow(`${name}${pad}${val}`, innerWidth));
          }
          if (start > 0 || end < rows.length) {
            lines.push(wrapRow(theme.fg("dim", `(${selected}/${rows.length})`), innerWidth));
          }

          lines.push(border(`├${"─".repeat(innerWidth)}┤`));
          lines.push(
            wrapRow(
              theme.fg(
                "dim",
                editing
                  ? "type=value · enter=save · esc=cancel"
                  : "↑↓ · enter=select/edit (←→ cycles) · esc=close",
              ),
              innerWidth,
            ),
          );
          lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
          return lines;
        },

        invalidate: () => {},

        handleInput: (data: string) => {
          const rows = buildRows();
          if (editing) {
            if (matchesKey(data, "escape")) {
              editing = false;
              editBuffer = "";
            } else if (matchesKey(data, "enter")) {
              if (editBuffer.trim() !== "") applyEdit(editBuffer.trim());
              editing = false;
              editBuffer = "";
            } else if (matchesKey(data, "backspace")) {
              editBuffer = editBuffer.slice(0, -1);
            } else if (data === "\x15") {
              editBuffer = "";
            } else if (isPrintable(data)) {
              editBuffer += data;
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
              selected = selected === 0 ? rows.length - 1 : selected - 1;
            } while (rows[selected]!.type === "group");
          } else if (matchesKey(data, "down")) {
            do {
              selected = selected === rows.length - 1 ? 0 : selected + 1;
            } while (rows[selected]!.type === "group");
          } else if (matchesKey(data, "pageUp")) {
            selected = Math.max(1, selected - LIST_ROWS);
            while (selected < rows.length - 1 && rows[selected]!.type === "group")
              selected++;
          } else if (matchesKey(data, "pageDown")) {
            selected = Math.min(rows.length - 1, selected + LIST_ROWS);
            while (selected > 1 && rows[selected]!.type === "group") selected--;
          } else {
            const cur = currentItem();
            if (!cur) return;
            const { item } = cur;
            if (matchesKey(data, "enter") || matchesKey(data, "right")) {
              if (item.kind === "toggle") toggle(item);
              else if (item.kind === "select" && item.choices) cycleSelect(item, true);
              else {
                editing = true;
                const v = readConfigPath(settings, item.path);
                editBuffer = v === null ? "" : String(v);
              }
            } else if (matchesKey(data, "left")) {
              if (item.kind === "select" && item.choices) cycleSelect(item, false);
              else if (item.kind === "toggle") toggle(item);
            } else if (item.kind === "toggle" && (data === " " || data === "t")) {
              toggle(item);
            }
          }
          tui.requestRender();
        },
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
