import { visibleWidth, type Component } from "@earendil-works/pi-tui";
import { getBoxLayout } from "./layout.ts";
import { dim, renderWelcomeBox } from "./renderer.ts";
import type { WelcomeData } from "./types.ts";

/**
 * Welcome overlay: lantern, tips, loaded counts, and a countdown footer.
 */
export class WelcomeComponent implements Component {
  private data: WelcomeData;
  private countdown: number = 30;
  private animateLantern: boolean;

  constructor(data: WelcomeData, animateLantern = false) {
    this.data = data;
    this.animateLantern = animateLantern;
  }

  setCountdown(seconds: number): void {
    if (this.countdown === seconds) return;
    this.countdown = seconds;
  }

  invalidate(): void {}

  render(termWidth: number): string[] {
    const layout = getBoxLayout(termWidth);
    if (!layout) return [];

    const countdownText = ` Press any key to continue (${this.countdown}s) `;
    const countdownStyled = dim(countdownText);
    const bottomContentWidth = layout.boxWidth - 2;
    const countdownVisLen = visibleWidth(countdownText);
    const leftPad = Math.floor((bottomContentWidth - countdownVisLen) / 2);
    const rightPad = bottomContentWidth - countdownVisLen - leftPad;
    const hChar = "─";
    const bottomLine =
      dim(hChar.repeat(Math.max(0, leftPad))) +
      countdownStyled +
      dim(hChar.repeat(Math.max(0, rightPad)));

    return renderWelcomeBox(this.data, termWidth, bottomLine, {
      now: Date.now(),
      still: !this.animateLantern,
    });
  }
}
