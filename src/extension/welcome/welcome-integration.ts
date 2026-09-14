import {
  WelcomeComponent,
  WelcomeHeader,
  discoverLoadedCounts,
  discoverWhatsNew,
  getRecentSessions,
  type WelcomeData,
} from "../../welcome/index.ts";
import {
  lanternAnimationEnabled,
  welcomeOverlayTickMs,
  WELCOME_COUNTDOWN_MS,
} from "../../welcome/motion-policy.ts";
import { estimateInitialContextTokens } from "../../usage/context.ts";
import { colorEnabled } from "../../theme/colors.ts";
import { isRecord, readSettings } from "../settings/settings-io.ts";
import type { RuntimeState } from "../core/types.ts";
import { getQueueContext } from "../queue/queue-context.ts";
import { pickNextReviewIdea } from "../queue/idea-review.ts";

function readWelcomeData(rt: RuntimeState, ctx: any): WelcomeData {
  const queueContext = getQueueContext(ctx);
  const queueSummary = rt.queueStore.summarize(queueContext, false);
  return {
    modelName: ctx.model?.name || ctx.model?.id || "No model",
    providerName: ctx.model?.provider || "Unknown",
    recentSessions: getRecentSessions(3),
    loadedCounts: discoverLoadedCounts(),
    initialContextTokens: estimateInitialContextTokens(ctx),
    queueCount: queueSummary.queueCount + queueSummary.ideaCount,
    hasStash:
      rt.stashedEditorText !== null || rt.stashedPromptHistory.length > 0,
    whatsNew: discoverWhatsNew(),
    nextIdeaText: pickNextReviewIdea(
      rt.queueStore.activeItems(queueContext),
    )?.text,
  };
}

export function setupWelcomeHeader(rt: RuntimeState, ctx: any) {
  const header = new WelcomeHeader(readWelcomeData(rt, ctx));
  rt.welcomeHeaderActive = true;

  ctx.ui.setHeader(() => {
    return {
      render(width: number): string[] {
        return header.render(width);
      },
      invalidate() {
        header.invalidate();
      },
    };
  });
}

export function setupWelcomeOverlay(rt: RuntimeState, ctx: any) {
  const overlaySessionGeneration = rt.sessionGeneration;

  // Small delay to let pi-mono finish initialization
  setTimeout(() => {
    if (
      !rt.enabled ||
      rt.welcomeOverlayShouldDismiss ||
      rt.isStreaming ||
      overlaySessionGeneration !== rt.sessionGeneration
    ) {
      rt.welcomeOverlayShouldDismiss = false;
      return;
    }

    const sessionEvents = ctx.sessionManager?.getBranch?.() ?? [];
    const hasActivity = sessionEvents.some((entry: unknown) => {
      if (!isRecord(entry)) return false;
      if (entry.type === "tool_call" || entry.type === "tool_result")
        return true;
      return (
        entry.type === "message" &&
        isRecord(entry.message) &&
        entry.message.role === "assistant"
      );
    });
    if (hasActivity) {
      return;
    }

    const data = readWelcomeData(rt, ctx);
    const animateLantern =
      lanternAnimationEnabled(
        readSettings(ctx.cwd ?? process.cwd()).wishcraft,
      ) && colorEnabled();

    ctx.ui
      .custom(
        (
          tui: any,
          _theme: any,
          _keybindings: any,
          done: (result: void) => void,
        ) => {
          const welcome = new WelcomeComponent(data, animateLantern);

          let countdown = 30;
          let dismissed = false;
          let motionElapsed = 0;
          let interval: ReturnType<typeof setInterval> | null = null;
          const tickMs = welcomeOverlayTickMs(animateLantern);

          const dismiss = () => {
            if (dismissed) return;
            dismissed = true;
            if (interval) clearInterval(interval);
            rt.dismissWelcomeOverlay = null;
            done();
          };

          interval = setInterval(() => {
            if (dismissed) return;
            motionElapsed += tickMs;
            const next = 30 - Math.floor(motionElapsed / WELCOME_COUNTDOWN_MS);
            if (next !== countdown) {
              countdown = next;
              welcome.setCountdown(countdown);
            }
            tui.requestRender();
            if (next <= 0) dismiss();
          }, tickMs);

          rt.dismissWelcomeOverlay = dismiss;

          if (rt.welcomeOverlayShouldDismiss) {
            rt.welcomeOverlayShouldDismiss = false;
            dismiss();
          }

          return {
            focused: false,
            invalidate: () => welcome.invalidate(),
            render: (width: number) => welcome.render(width),
            handleInput: () => dismiss(),
            dispose: () => {
              dismissed = true;
              if (interval) clearInterval(interval);
            },
          };
        },
        {
          overlay: true,
          overlayOptions: () => ({
            verticalAlign: "center",
            horizontalAlign: "center",
          }),
        },
      )
      .catch((error: unknown) => {
        console.debug("[wishcraft] Welcome overlay failed:", error);
      });
  }, 100);
}
