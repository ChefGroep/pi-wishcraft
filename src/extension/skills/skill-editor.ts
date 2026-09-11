/**
 * Shared EDITOR validation for the pi `!` flow.
 * Overlay edit and `/skills new` must use the same helper so a hostile
 * EDITOR value cannot inject extra shell.
 */

/**
 * POSIX-quote `value` so it is a single shell word.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Return `$EDITOR` when it is a path-like token; otherwise `nvim`.
 */
export function safeEditor(): string {
  const ed = process.env.EDITOR?.trim();
  return ed && /^[\w./-]+$/.test(ed) ? ed : "nvim";
}

/**
 * Build the `!editor path` command the pi editor executes on enter.
 */
export function editorCommand(path: string): string {
  return `!${safeEditor()} ${shellQuote(path)}`;
}
