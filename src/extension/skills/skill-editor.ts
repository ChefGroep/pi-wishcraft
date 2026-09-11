/**
 * Shared EDITOR validation for the pi `!` flow.
 * Overlay edit and `/skills new` must use the same helper so a hostile
 * EDITOR value cannot inject extra shell.
 */

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function safeEditor(): string {
  const ed = process.env.EDITOR?.trim();
  return ed && /^[\w./-]+$/.test(ed) ? ed : "nvim";
}

export function editorCommand(path: string): string {
  return `!${safeEditor()} ${shellQuote(path)}`;
}
