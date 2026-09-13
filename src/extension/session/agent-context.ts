/**
 * Pull a short slice of the latest assistant text for vibe generation.
 */

export function getRecentAgentContext(ctx: any): string | undefined {
  const sessionEvents = ctx.sessionManager?.getBranch?.() ?? [];

  for (let i = sessionEvents.length - 1; i >= 0; i--) {
    const e = sessionEvents[i];
    if (e.type === "message" && e.message?.role === "assistant") {
      const content = e.message.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (block.type === "text" && block.text) {
          const text = block.text.trim();
          if (text.length > 0) {
            return text.slice(0, 200);
          }
        }
      }
    }
  }
  return undefined;
}
