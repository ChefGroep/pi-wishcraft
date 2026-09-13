import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { BashTranscriptStore } from "../../../bash-mode/transcript.ts";
import { BashCompletionEngine } from "../../../bash-mode/completion.ts";
import { parsePowerlineConfig } from "../../config/powerline-config.ts";
import { registerCustomSegments } from "../../segments/index.ts";
import { registerCustomPresets } from "../../config/presets.ts";
import { invalidateGitStatus } from "../../git/status.ts";
import { invalidateGitForCommand } from "./git-invalidation.ts";
import { initVibeManager } from "../../working-vibes/index.ts";
import {
  detectCustomCompactionEnabled,
  readSettings,
} from "../settings/settings-io.ts";
import {
  resolveShortcutConfig,
  parseBashModeSettings,
} from "../shortcuts/shortcuts-config.ts";
import { warnInvalidSegmentSettings } from "../ui/layout.ts";
import { readPersistedStashHistory } from "../history/stash-history.ts";
import {
  requestImmediateStatusRender,
  requestStatusRender,
  resetLayoutCache,
} from "../core/segment-context.ts";
import { getQueueContext } from "../queue/queue-context.ts";
import {
  requestQueueRender,
  schedulePostCompactionDelivery,
  finishFailedCompaction,
} from "../queue/queue-integration.ts";
import { setupCustomEditor } from "../ui/custom-editor.ts";
import {
  setupWelcomeHeader,
  setupWelcomeOverlay,
} from "../welcome/welcome-integration.ts";
import {
  config,
  PRESET_NAMES,
  setConfig,
  setCustomCompactionEnabled,
} from "../core/state.ts";
import type { RuntimeState } from "../core/types.ts";
import {
  bindSkillsCountPublisher,
  clearSkillsCountPublisher,
} from "../skills/skill-status.ts";
import { maybeAppendReadHint } from "./read-hints.ts";
import { parseMotionSettings } from "../../motion/policy.ts";
import { registerAgentTurnHandlers } from "./agent-turn.ts";
import { maybeNotifyTokenBudget } from "./session-alerts.ts";
import { dismissWelcome } from "../welcome/welcome-control.ts";

export function shouldShowStartupWelcome(
  reason: unknown,
  welcomeEnabled: boolean,
): boolean {
  return reason === "startup" && welcomeEnabled;
}

export function registerSessionLifecycle(
  pi: ExtensionAPI,
  rt: RuntimeState,
): void {
  pi.on("session_start", async (event, ctx) => {
    clearSkillsCountPublisher();
    rt.shellSession?.dispose();
    rt.shellSession = null;
    rt.sessionGeneration++;
    rt.sessionStartTime = Date.now();
    rt.currentCtx = ctx;
    setCustomCompactionEnabled(detectCustomCompactionEnabled(ctx.cwd));
    rt.lastUserPrompt = "";
    rt.isStreaming = false;
    rt.liveAssistantUsage = null;
    rt.costAlertNotified = false;
    rt.tokenBudgetNotifiedLevel = 0;
    rt.powerlineCompacting = false;
    rt.deliverAfterRetrySettles = false;
    rt.stashedEditorText = null;

    const settings = readSettings(ctx.cwd);
    rt.resolvedShortcuts = resolveShortcutConfig(settings);
    rt.bashModeSettings = parseBashModeSettings(settings, rt.resolvedShortcuts);
    rt.showLastPrompt = settings.showLastPrompt !== false;
    rt.motion.reset();
    rt.motion.setSettings(parseMotionSettings(settings.wishcraft));
    setConfig(parsePowerlineConfig(settings.powerline, PRESET_NAMES));
    rt.queueStore.setSentRetentionMs(
      config.queue.retentionHours * 60 * 60 * 1000,
    );
    registerCustomSegments(config.segments);
    registerCustomPresets(config.presets);
    warnInvalidSegmentSettings(ctx);
    rt.stashedPromptHistory = readPersistedStashHistory();
    rt.bashModeActive = false;
    rt.bashTranscript = new BashTranscriptStore(rt.bashModeSettings);
    rt.bashCompletionEngine = new BashCompletionEngine();

    rt.getThinkingLevelFn = () => ctx.thinkingLevel ?? "off";
    rt.currentThinkingLevel = rt.getThinkingLevelFn();

    if (ctx.hasUI) {
      ctx.ui.setStatus("stash", undefined);
      bindSkillsCountPublisher(ctx);
      const pendingIdeas = rt.queueStore
        .activeItems(getQueueContext(ctx))
        .filter((item) => item.intent === "idea").length;
      if (pendingIdeas > 0) {
        ctx.ui.notify(
          `${pendingIdeas} idea${pendingIdeas === 1 ? "" : "s"} waiting — /ideas`,
          "info",
        );
      }
    }

    initVibeManager(ctx);

    if (rt.enabled && ctx.hasUI) {
      setupCustomEditor(pi, rt, ctx);
      if (shouldShowStartupWelcome(event.reason, config.welcome)) {
        if (settings.quietStartup === true) {
          setupWelcomeHeader(rt, ctx);
        } else {
          setupWelcomeOverlay(rt, ctx);
        }
      } else {
        dismissWelcome(rt, ctx);
      }
      maybeNotifyTokenBudget(rt, ctx);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearSkillsCountPublisher();
    rt.sessionGeneration++;
    rt.dismissWelcomeOverlay?.();
    rt.dismissWelcomeOverlay = null;
    rt.welcomeHeaderActive = false;
    rt.welcomeOverlayShouldDismiss = false;
    rt.welcomeDismissScheduler.cancel();
    rt.statusRenderScheduler.cancel();
    rt.isStreaming = false;
    rt.motion.reset();
    rt.restoreFooterStatusRepaintHook?.();
    rt.restoreFooterStatusRepaintHook = null;
    rt.stashShortcutInputUnsubscribe?.();
    rt.stashShortcutInputUnsubscribe = null;
    rt.shellSession?.dispose();
    rt.shellSession = null;
    if (rt.queueDeliveryTimer) {
      clearTimeout(rt.queueDeliveryTimer);
      rt.queueDeliveryTimer = null;
    }
    rt.powerlineCompacting = false;
    rt.deliverAfterRetrySettles = false;
    rt.bashModeActive = false;
    rt.currentCtx = null;
    rt.footerDataRef = null;
    rt.getThinkingLevelFn = null;
    rt.currentThinkingLevel = null;
    rt.liveAssistantUsage = null;
    rt.tuiRef = null;
    rt.currentEditor = null;
    resetLayoutCache(rt);
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      invalidateGitStatus();
      requestStatusRender(rt);
    }
    if (event.toolName === "bash" && event.input?.command) {
      invalidateGitForCommand(rt, String(event.input.command));
    }
    if (event.toolName === "read") {
      return maybeAppendReadHint(event, ctx?.cwd);
    }
  });

  pi.on("user_bash", async (event) => {
    invalidateGitForCommand(rt, event.command, { stagger: true });
  });

  pi.on("model_select", async (_event, ctx) => {
    rt.currentCtx = ctx;
    rt.coreContextUsageCache.reset();
    requestStatusRender(rt);
  });

  pi.on("session_tree", async (_event, ctx) => {
    rt.currentCtx = ctx;
    rt.currentThinkingLevel = null;
    rt.liveAssistantUsage = null;
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
  });

  pi.on("session_before_compact", async (_event, ctx) => {
    rt.powerlineCompacting = true;
    rt.currentCtx = ctx;
    requestQueueRender(rt);
  });

  pi.on("session_compact", async (event, ctx) => {
    rt.powerlineCompacting = false;
    rt.currentCtx = ctx;
    rt.coreContextUsageCache.reset();
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
    if (event.willRetry) {
      rt.deliverAfterRetrySettles = true;
    } else {
      rt.deliverAfterRetrySettles = false;
      schedulePostCompactionDelivery(pi, rt, ctx);
    }
    requestQueueRender(rt);
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (rt.powerlineCompacting) {
      finishFailedCompaction(rt, ctx, "Compaction did not complete");
      return;
    }
    if (rt.deliverAfterRetrySettles) {
      rt.deliverAfterRetrySettles = false;
      schedulePostCompactionDelivery(pi, rt, ctx);
    }
  });

  registerAgentTurnHandlers(pi, rt);
}
