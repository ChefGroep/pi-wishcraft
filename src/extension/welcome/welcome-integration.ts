import {
  WelcomeComponent,
  WelcomeHeader,
  discoverLoadedCounts,
  discoverWhatsNew,
  getRecentSessions,
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

export function setupWelcomeHeader(rt: RuntimeState, ctx: any) {
  const modelName = ctx.model?.name || ctx.model?.id || "No model";
  const providerName = ctx.model?.provider || "Unknown";
  const loadedCounts = discoverLoadedCounts();
  const recentSessions = getRecentSessions(3);
  const initialContextTokens = estimateInitialContextTokens(ctx);
  const queueSummary = rt.queueStore.summarize(getQueueContext(ctx), false);
  const queueCount = queueSummary.queueCount + queueSummary.ideaCount;
  const hasStash =
    rt.stashedEditorText !== null || rt.stashedPromptHistory.length > 0;
  const nextIdeaText = pickNextReviewIdea(
    rt.queueStore.activeItems(getQueueContext(ctx)),
  )?.text;
  const whatsNew = discoverWhatsNew();

  const header = new WelcomeHeader(
    modelName,
    providerName,
    recentSessions,
    loadedCounts,
    initialContextTokens,
    queueCount,
    hasStash,
    whatsNew,
    nextIdeaText,
  );
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
  const modelName = ctx.model?.name || ctx.model?.id || "No model";
  const providerName = ctx.model?.provider || "Unknown";
  const loadedCounts = discoverLoadedCounts();
  const recentSessions = getRecentSessions(3);

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

    const initialContextTokens = estimateInitialContextTokens(ctx);
    const queueSummary = rt.queueStore.summarize(getQueueContext(ctx), false);
    const queueCount = queueSummary.queueCount + queueSummary.ideaCount;
    const hasStash =
      rt.stashedEditorText !== null || rt.stashedPromptHistory.length > 0;
    const nextIdeaText = pickNextReviewIdea(
      rt.queueStore.activeItems(getQueueContext(ctx)),
    )?.text;
    const whatsNew = discoverWhatsNew();
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
          const welcome = new WelcomeComponent(
            modelName,
            providerName,
            recentSessions,
            loadedCounts,
            initialContextTokens,
            queueCount,
            hasStash,
            whatsNew,
            nextIdeaText,
            animateLantern,
          );

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
