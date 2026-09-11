import { renderWelcomeBox } from "../../src/welcome/renderer.ts";
import type { WelcomeData } from "../../src/welcome/types.ts";

const data: WelcomeData = {
  modelName: "test-model",
  providerName: "test-provider",
  recentSessions: [],
  loadedCounts: {
    contextFiles: 0,
    extensions: 0,
    skills: 0,
    promptTemplates: 0,
  },
  initialContextTokens: null,
};

const lines = renderWelcomeBox(data, 96, "bottom");
if (lines.length === 0) {
  process.stderr.write("empty welcome box\n");
  process.exit(2);
}
process.stdout.write(lines.join("\n"));
