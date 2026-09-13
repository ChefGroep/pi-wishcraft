/**
 * Once-per-session operator warnings for cost and daily token budget.
 * Leaf module so session-lifecycle does not also own the notify bodies.
 */

import {
  getSessionTotalCost,
} from "../../usage/ledger.ts";
import {
  formatCostAlertMessage,
  shouldTriggerCostAlert,
} from "./cost-alert.ts";
import {
  formatTokenBudgetWarning,
  parseTokenBudget,
  tokenBudgetLevel,
} from "../../usage/token-budget.ts";
import {
  loadUsageFileFromDisk,
  tokenTotal,
  totalsForRange,
  dayKey,
} from "../../usage/usage-store.ts";
import { readSettings } from "../settings/settings-io.ts";
import { config } from "../core/state.ts";
import type { RuntimeState } from "../core/types.ts";

/**
 * Fire the configured `powerline.costAlert` warning at most once per session.
 * Reads the running cost from the (cached) token ledger so repeated calls are
 * cheap; a UI-less or already-notified session short-circuits immediately.
 */
export function maybeNotifyCostAlert(rt: RuntimeState, ctx: any): void {
  if (!ctx?.hasUI || rt.costAlertNotified) return;
  const threshold = config.costAlert;
  const sessionEvents = rt.sessionBranchCache.get(ctx.sessionManager);
  const totalCost = getSessionTotalCost(rt.tokenStatsCache.get(sessionEvents));
  if (
    !shouldTriggerCostAlert({
      totalCost,
      threshold,
      alreadyNotified: rt.costAlertNotified,
    })
  ) {
    return;
  }
  rt.costAlertNotified = true;
  ctx.ui.notify(
    formatCostAlertMessage(
      totalCost,
      threshold as number,
      config.segmentOptions?.cost?.currency ?? "USD",
    ),
    "warning",
  );
}

export function maybeNotifyTokenBudget(rt: RuntimeState, ctx: any): void {
  if (!ctx?.hasUI) return;
  const daily = parseTokenBudget(readSettings(ctx.cwd ?? process.cwd()).wishcraft)
    .daily;
  if (!daily) return;
  const now = Date.now();
  const todayStart = Date.parse(`${dayKey(now)}T00:00:00`);
  const used = tokenTotal(
    totalsForRange(loadUsageFileFromDisk(), todayStart, now + 1),
  );
  const { level } = tokenBudgetLevel(used, daily);
  if (level === 0 || level <= rt.tokenBudgetNotifiedLevel) return;
  rt.tokenBudgetNotifiedLevel = level;
  ctx.ui.notify(formatTokenBudgetWarning(used, daily, level), "warning");
}
