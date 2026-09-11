---
title: Skill delete and TUI hardening - Plan
type: fix
date: 2026-09-11
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Skill delete and TUI hardening - Plan

## Goal Capsule

- Objective: An operator can delete a catalogued prompt skill, open a newly created skill in their editor, and keep the live TUI readable — without a project `skills` symlink or a hostile `EDITOR` reaching files or a shell outside the project and agent trees.
- Means: Parent-bound delete roots shared with the catalog's extra paths, one `safeEditor` helper for both `!` sinks, no stderr on the paint path, welcome CSI gated by `colorEnabled()` (KTD1, KTD2, KTD3, KTD4).
- Authority: Product Contract requirements, then Planning Contract KTDs, then Implementation Units. AGENTS.md (English UI, `.ts` import extensions, tests next to the subsystem, no new cycles through `src/extension/core/state.ts`) outranks local convenience.
- Execution profile: `code`. Lightweight, four units. Extend existing hardening tests before changing the guard.
- Stop conditions: The six in-scope behaviors in Requirements (R1–R6) hold and `npm run typecheck` plus `npm test` pass. Stop without adding slash `delete`/`edit`, splitting `skill-manager.ts`, or reopening validator-dropped findings.
- Tail ownership: Remove any helper introduced only for a rejected approach. Do not leave a second editor or containment implementation beside the shared one.

## Product Contract

### Summary

Close the gaps the 1.1.0 skill-manager and TUI hardening left open: prompt-dir deletes fail closed, `/skills new` still interpolates raw `EDITOR`, a `skills` directory symlink can widen recursive delete, failed segments write stacks to stderr during paint, and the welcome logo/title still emit CSI under `NO_COLOR`.

### Problem Frame

1.1.0 claimed contained skill deletes, a validated `EDITOR` for the `!` flow, per-segment isolation, and `NO_COLOR` respect. Confirm-delete still allowlists only `skills/` trees while the catalog lists prompt dirs. `/skills new` still builds `!${EDITOR}`. `realpathSync` on a `cwd/skills` symlink treats the link target as a trusted root. Isolated segments still `console.warn` a stack on the ~30/s paint path. `dim()` honors `colorEnabled()`, but `gradientLine` and `bold` always emit CSI.

### Requirements

**Skill delete containment**

- R1. Confirm-delete of a catalogued prompt skill whose path sits under the catalog extra roots (`~/.pi/agent/prompts`, `<cwd>/.pi/prompts`, `<cwd>/prompts`) succeeds when the resolved path stays inside the project or agent parent.
- R2. A canonical skill root whose `realpath` escapes `realpath(cwd)` and `realpath(getAgentDir())` is not treated as a trusted delete root, even when the catalog lists a path under that symlink target.
- R3. Confirm-delete still fails closed for unresolved paths, the root directory itself, and paths that resolve outside every trusted root.

**Editor `!` flow**

- R4. `/skills new` builds the same validated editor command as overlay edit: a bare path-like `EDITOR`, otherwise `nvim`, with the skill path POSIX-quoted.

**TUI paint**

- R5. A throwing segment still renders the `!{id}` marker and stays visible; the paint path does not write the error (including a stack) to stderr.
- R6. With `NO_COLOR` set and non-empty, `renderWelcomeBox` output contains no CSI sequences (`\x1b[`).

### Key Decisions

- Ship only the five surviving CE review findings from the 1.1.0 vs merge-#51 parent review. Governs R1, R2, R3, R4, R5, R6.

### Success Criteria

- An operator can delete a listed prompt skill that 1.1.0 currently refuses.
- A hostile or argument-bearing `EDITOR` cannot ride `/skills new` into the `!` flow.
- A project `skills` symlink cannot authorize recursive delete of its target tree.
- Failed segments and `NO_COLOR=1` welcome rendering leave stdout/TUI unpolluted by stacks or CSI.

### Acceptance Examples

- AE1. Given `<cwd>/prompts/demo/SKILL.md` is catalogued as prompts, when the operator confirms delete, the directory is removed. Covers R1.
- AE2. Given `<cwd>/skills` is a directory symlink to `$HOME` and a catalogued path resolves under `$HOME`, when the operator confirms delete, the guard refuses and the home tree is unchanged. Covers R2.
- AE3. Given `EDITOR` is `vim; id`, when `/skills new` appends the editor command, the line is `!nvim` plus a quoted path, not `!vim; id`. Covers R4.
- AE4. Given a custom command segment whose command exits non-zero, when `renderSegment` runs, content is `!custom:…`, visible is true, and `console.warn` is not called. Covers R5.
- AE5. Given `NO_COLOR=1` and a fresh colors/renderer import, when `renderWelcomeBox` runs at a width that produces a box, no line contains `\x1b[`. Covers R6.

### Scope Boundaries

- Out: validator-dropped review items (`showOpenPortsList` `execSync` timeout; `applySegmentDecoration` catch-path rethrow).
- Out: slash `/skills delete` and `/skills edit` primitives (pre-existing agent-native gap).
- Out: splitting `skill-manager.ts` to the ~450-line AGENTS.md guideline (pre-existing size).
- Out: other `console.warn` sites (`src/extension/ui/layout.ts`) and remaining `NO_COLOR` holes (`src/theme/theme.ts` `applyColor` / `rainbow`).
- Out: Windows `path.isAbsolute` vs POSIX `startsWith("/")` residual; pstack home-rule config.

#### Deferred to Follow-Up Work

- Agent-visible delete/edit slash commands that reuse the same containment guard.
- Module split of `skill-manager.ts` along overlay vs guard vs doctor.

### Sources

- Session CE review report (findings 1, 2, 5, 6, 7; validator dropped 3 and 4).
- `src/extension/skills/skill-manager.ts` `isContainedInSkillRoots` / `safeEditor`.
- `src/extension/skills/skill-registry.ts` `extraSkillPaths`.
- `src/extension/skills/skill-templates.ts` `editorCommandFor`.
- `src/segments/registry.ts` `renderSegment` catch.
- `src/welcome/renderer.ts` `gradientLine` / `bold`.
- `tests/skill-manager-hardening.test.ts`, `tests/skill-templates.test.ts`, `tests/system-segments.test.ts`, `tests/no-color.test.ts`.

## Planning Contract

### Key Technical Decisions

- KTD1. **Union canonical skill dirs with catalog extra paths, then parent-bind every root.** Export `extraSkillPaths` from the registry (do not duplicate it). Union the three skill dirs with those extra paths first. Then skip any root whose `realpath` is not inside `realpath(cwd)` or `realpath(getAgentDir())` before using it as a prefix. `extraSkillPaths` already includes `<cwd>/skills`, so appending extras after the bind would re-trust a `skills` symlink to `$HOME`. If a parent `realpath` throws, treat that parent as unavailable (fail closed for that comparison). Cites R1, R2, R3.
- KTD2. **One leaf helper for `safeEditor` (and shared POSIX quoting if both files keep a copy).** `skill-manager.ts` already imports `skill-templates.ts`; templates must not import the manager. Extract to a new leaf under `src/extension/skills/` and import it from both. Cites R4.
- KTD3. **Keep the `!{id}` marker; omit stderr on the paint path.** `renderSegment` has no UI notify handle. Do not add a log file or notify from this unit. Cites R5.
- KTD4. **Gate `gradientLine` and `bold` on `colorEnabled()`, matching `dim()`.** Return the plain string when color is off. Cites R6.

### Assumptions

- Empty `/lfg` in this session means ship those five validated review findings, not pstack config or marketplace overlay work.
- Catalog category `extra` paths that are not in `extraSkillPaths` stay fail-closed after KTD1.
- Dropping paint-path `console.warn` without a side channel is enough; operators still see `!{id}`.
- `colorEnabled()` remains process-lifetime cached; tests must import a fresh module instance the same way `tests/no-color.test.ts` does.

### Implementation Constraints

- Bun/Node-native TS with `.ts` import extensions.
- No new production dependencies.
- English notify/overlay copy only.
- Do not import `src/extension/core/state.ts` from the new leaf.
- `npx madge --circular src index.ts bash-mode queue` stays clean if imports move.

### Sequencing

U1 containment uses union-then-parent-bind (KTD1). U2, U3, and U4 do not depend on U1 and may proceed after U1's tests are green, in any order. Preferred: U1 → U2 → U3 → U4.

## Implementation Units

### U1. Parent-bound delete roots including prompts

- **Goal:** Confirm-delete trusts the same trees the catalog lists, without treating a symlink-escaped root as trusted.
- **Requirements:** R1, R2, R3. Approach cites KTD1.
- **Dependencies:** none
- **Files:** `src/extension/skills/skill-manager.ts`, `src/extension/skills/skill-registry.ts`, `tests/skill-manager-hardening.test.ts`
- **Approach:**
  1. Export `extraSkillPaths` (or a thin wrapper the guard can call) from `skill-registry.ts`.
  2. Union the three canonical skill dirs with those extra paths, then skip any root whose `realpath` is not inside `realpath(cwd)` or `realpath(getAgentDir())`. If a parent `realpath` throws, that parent does not authorize the root.
  3. Keep fail-closed target `realpath` errors and "root itself is not deletable" (`relative` empty).
  4. Extend overlay confirm-delete so a catalogued prompts directory skill (`isDirectorySkill`, `SKILL.md` under extra prompt roots) takes the same recursive `baseDir` removal as global/project, still gated by the parent-bound helper on `baseDir`. Loose markdown prompts stay file-only.
- **Execution note:** Add the failing symlink-root, prompt-dir containment, and prompts-directory-removal cases in `tests/skill-manager-hardening.test.ts` before changing the guard and overlay.
- **Patterns to follow:** Existing `isContainedInSkillRoots` relative-prefix check and the symlink-outside-root test already in `tests/skill-manager-hardening.test.ts`. `extraSkillPaths` in `skill-registry.ts`. Overlay `doDelete` recursive branch for global/project directory skills.
- **Test scenarios:**
  - Happy path: a real directory under `<cwd>/prompts/demo` is contained when `cwd` is the project temp root.
  - Happy path: existing global / `.pi/skills` / `cwd/skills` cases still pass.
  - Happy path: confirm-delete of a catalogued `<cwd>/prompts/demo` directory skill removes that directory (AE1), not only `SKILL.md`.
  - Edge: `<cwd>/skills` directory symlink to a temp `$HOME` is not a trusted root; a path under that `$HOME` is not contained.
  - Edge: the skills root directory itself is still not contained.
  - Error: missing path still fails closed.
- **Verification:** Hardening tests cover AE1 (directory gone) and AE2. Existing accept/reject/missing/symlink-entry tests still pass.

### U2. Shared `safeEditor` for `/skills new`

- **Goal:** `/skills new` cannot interpolate a hostile `EDITOR` into the `!` flow.
- **Requirements:** R4. Approach cites KTD2.
- **Dependencies:** none
- **Files:** new leaf under `src/extension/skills/`, `src/extension/skills/skill-manager.ts`, `src/extension/skills/skill-templates.ts`, `tests/skill-manager-hardening.test.ts`, `tests/skill-templates.test.ts`
- **Approach:**
  1. Move `safeEditor` (and quoting if both files still duplicate `shellQuote`) into the new leaf.
  2. Point overlay `editorCommand` and `editorCommandFor` at it.
  3. Re-export `safeEditor` from `skill-manager.ts` if existing tests import it from there, or update those imports to the leaf — one public path, not two implementations.
- **Patterns to follow:** Current `safeEditor` regex and `nvim` fallback in `skill-manager.ts`. `editorCommandFor` quoting in `skill-templates.ts`.
- **Test scenarios:**
  - Happy path: `EDITOR=vim` yields `!vim '<path>'` from `editorCommandFor`.
  - Error: `EDITOR='vim; id'` yields `!nvim` plus a quoted path, never the raw value (AE3).
  - Edge: empty / unset `EDITOR` still falls back to `nvim`.
  - Integration: `runSkillsNew` still appends `editorCommandFor(filePath)` after existing editor text.
- **Verification:** Template and hardening editor tests cover AE3. Overlay edit and `/skills new` share one helper.

### U3. Silent segment isolation on the paint path

- **Goal:** A failed segment still marks itself; paint does not scribble stacks onto stderr.
- **Requirements:** R5. Approach cites KTD3.
- **Dependencies:** none
- **Files:** `src/segments/registry.ts`, `tests/system-segments.test.ts`
- **Approach:** Remove the throttled `console.warn` in the `renderSegment` catch. Keep the `!{id}` visible marker. If `lastSegmentErrorLog` exists only to throttle that warn, delete it too.
- **Patterns to follow:** Existing isolation test `renderSegment isolates a failing command segment instead of blanking the footer` in `tests/system-segments.test.ts`.
- **Test scenarios:**
  - Happy path / failure: custom command segment that exits 1 still returns `{ content: "!custom:boom", visible: true }` (AE4).
  - Error: during that render, a stubbed `console.warn` is not invoked.
- **Verification:** Isolation test plus a warn-spy assertion. Typecheck clean.

### U4. Welcome CSI under `NO_COLOR`

- **Goal:** Welcome logo and title follow the same color-off contract as `dim()`.
- **Requirements:** R6. Approach cites KTD4.
- **Dependencies:** none
- **Files:** `src/welcome/renderer.ts`, `tests/welcome.test.ts` or `tests/no-color.test.ts`
- **Approach:** When `colorEnabled()` is false, `gradientLine` and `bold` return the input unchanged. Keep `dim()`'s existing behavior. Tests must bust the colors (and renderer) module cache the same way `tests/no-color.test.ts` does.
- **Patterns to follow:** `dim()` in `src/welcome/renderer.ts`. Cache-bust import in `tests/no-color.test.ts`.
- **Test scenarios:**
  - Happy path: `NO_COLOR=1`, `renderWelcomeBox` at a width that yields a box, joined output has no `\x1b[` (AE5).
  - Edge: unset `NO_COLOR` still allows CSI in the logo/title path (do not break the colored default).
- **Verification:** Welcome/`NO_COLOR` test covers AE5. Existing `tests/no-color.test.ts` color primitive cases still pass.

## Verification Contract

| Gate | Command | Proves | Units |
|---|---|---|---|
| Hardening | `node --experimental-strip-types --test tests/skill-manager-hardening.test.ts` | R1–R4 containment and editor | U1, U2 |
| Templates | `node --experimental-strip-types --test tests/skill-templates.test.ts` | `/skills new` editor line | U2 |
| Isolation | `node --experimental-strip-types --test tests/system-segments.test.ts` | R5 | U3 |
| Color | `node --experimental-strip-types --test tests/no-color.test.ts tests/welcome.test.ts` | R6 | U4 |
| Full | `npm run typecheck` and `npm test` | AGENTS.md pre-ship bar | all |
| Cycles | `npx madge --circular src index.ts bash-mode queue` if U2 adds a file | acyclic graph | U2 |

This is not a web UI. `ce-test-browser` is expected to skip. `release:validate` does not apply.

## Definition of Done

- Global: R1–R6 hold; typecheck and the full test suite pass; no second copy of `safeEditor` or containment roots; no abandoned helpers.
- U1: AE1 (prompts directory removed) and AE2 covered in `tests/skill-manager-hardening.test.ts`.
- U2: AE3 covered; overlay and `/skills new` share one helper.
- U3: AE4 covered; paint-path `console.warn` gone from `renderSegment`.
- U4: AE5 covered; `gradientLine` / `bold` honor `colorEnabled()`.
- Cleanup: no unused `lastSegmentErrorLog` if warn was its only consumer; no duplicate `shellQuote` unless a second copy is still required.
