/**
 * Agent-turn handlers: thinking, stream edges, usage, vibes, stash restore.
 * Session start/shutdown and git invalidation stay in session-lifecycle.ts.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  onVibeAgentEnd,
  onVibeAgentStart,
  onVibeBeforeAgentStart,
  onVibeToolCall,
} from "../../working-vibes/index.ts";
import {
  getUsageTokenTotal,
  isSessionAssistantMessage,
} from "../../usage/ledger.ts";
import { recordUsageEvent } from "../../usage/usage-store.ts";
import {
  requestImmediateStatusRender,
  requestStatusRender,
} from "../core/segment-context.ts";
import { schedulePostCompactionDelivery } from "../queue/queue-integration.ts";
import { CONTEXT_STATUS_RENDER_MS } from "../core/constants.ts";
import type { RuntimeState } from "../core/types.ts";
import { isStaleExtensionContextError } from "./stale-context.ts";
import { dismissWelcome } from "../welcome/welcome-control.ts";
import { getRecentAgentContext } from "./agent-context.ts";
import {
  maybeNotifyCostAlert,
  maybeNotifyTokenBudget,
} from "./session-alerts.ts";

export function registerAgentTurnHandlers(
  pi: ExtensionAPI,
  rt: RuntimeState,
): void {
  pi.on("thinking_level_select", async (event, ctx) => {
    rt.currentCtx = ctx;
    rt.currentThinkingLevel =
      rt.getThinkingLevelFn?.() ??
      (typeof event.level === "string" ? event.level : null);
    rt.motion.arm();
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
  });

  pi.on("before_agent_start", async (event, ctx) => {
    rt.lastUserPrompt = event.prompt;
    if (ctx.hasUI) {
      onVibeBeforeAgentStart(event.prompt, ctx.ui.setWorkingMessage);
    }
  });

  pi.on("agent_start", async (_event, ctx) => {
    rt.isStreaming = true;
    rt.liveAssistantUsage = null;
    rt.motion.arm();
    onVibeAgentStart();
    dismissWelcome(rt, ctx);
    rt.currentCtx = ctx;
  });

  pi.on("message_update", async (event, ctx) => {
    if (
      isSessionAssistantMessage(event.message) &&
      event.message.stopReason !== "error" &&
      event.message.stopReason !== "aborted" &&
      getUsageTokenTotal(event.message.usage) > 0
    ) {
      rt.liveAssistantUsage = event.message.usage;
      rt.currentCtx = ctx;
      rt.layoutDirty = true;
      rt.statusRenderScheduler.schedule(CONTEXT_STATUS_RENDER_MS);
    }
  });

  pi.on("message_end", async (event, ctx) => {
    rt.currentCtx = ctx;
    rt.coreContextUsageCache.reset();
    if (isSessionAssistantMessage(event.message)) {
      if (
        event.message.stopReason === "error" ||
        event.message.stopReason === "aborted"
      ) {
        rt.liveAssistantUsage = null;
      } else if (getUsageTokenTotal(event.message.usage) > 0) {
        rt.liveAssistantUsage = event.message.usage;
        const usage = event.message.usage;
        recordUsageEvent({
          at: Date.now(),
          model: ctx.model?.id ?? ctx.model?.name,
          input: usage.input,
          output: usage.output,
          cacheRead: usage.cacheRead,
          cacheWrite: usage.cacheWrite,
          cost: usage.cost.total,
        });
      }
    }
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
    maybeNotifyCostAlert(rt, ctx);
    maybeNotifyTokenBudget(rt, ctx);
  });

  pi.on("turn_end", async (_event, ctx) => {
    rt.currentCtx = ctx;
    rt.coreContextUsageCache.reset();
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
  });

  pi.on("tool_call", async (event, ctx) => {
    dismissWelcome(rt, ctx);
    if (ctx.hasUI) {
      const agentContext = getRecentAgentContext(ctx);
      onVibeToolCall(
        event.toolName,
        event.input,
        ctx.ui.setWorkingMessage,
        agentContext,
      );
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    rt.isStreaming = false;
    rt.liveAssistantUsage = null;
    rt.coreContextUsageCache.reset();
    rt.motion.arm();

    let hasUI = false;
    try {
      hasUI = Boolean(ctx.hasUI);
    } catch (error) {
      if (!isStaleExtensionContextError(error)) throw error;
      rt.currentCtx = null;
      return;
    }

    rt.currentCtx = ctx;
    try {
      if (hasUI) {
        onVibeAgentEnd(ctx.ui.setWorkingMessage);
        if (rt.stashedEditorText !== null) {
          if (ctx.ui.getEditorText().trim() === "") {
            ctx.ui.setEditorText(rt.stashedEditorText);
            rt.stashedEditorText = null;
            ctx.ui.setStatus("stash", undefined);
            ctx.ui.notify("Stash restored", "info");
          } else {
            ctx.ui.notify(
              "Stash preserved — clear editor then Alt+S to restore",
              "info",
            );
          }
        }
        maybeNotifyCostAlert(rt, ctx);
      }
    } catch (error) {
      if (!isStaleExtensionContextError(error)) throw error;
      rt.currentCtx = null;
      return;
    }

    requestStatusRender(rt);
    if (!rt.powerlineCompacting && !rt.deliverAfterRetrySettles) {
      schedulePostCompactionDelivery(pi, rt, ctx);
    }
  });
}
