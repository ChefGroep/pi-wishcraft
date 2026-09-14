import type { Component } from "@earendil-works/pi-tui";
import { getBoxLayout } from "./layout.ts";
import { dim, renderWelcomeBox } from "./renderer.ts";
import type { WelcomeData } from "./types.ts";

/**
 * Welcome header - same layout as overlay but persistent (no countdown).
 * Used when quietStartup: true.
 */
export class WelcomeHeader implements Component {
  private data: WelcomeData;

  constructor(data: WelcomeData) {
    this.data = data;
  }

  invalidate(): void {}

  render(termWidth: number): string[] {
    const layout = getBoxLayout(termWidth);
    if (!layout) return [];

    const { leftCol, rightCol } = layout;
    const hChar = "─";
    const bottomLine =
      dim(hChar.repeat(leftCol)) + dim("┴") + dim(hChar.repeat(rightCol));

    const lines = renderWelcomeBox(this.data, termWidth, bottomLine);
    if (lines.length > 0) {
      lines.push("");
    }
    return lines;
  }
}
