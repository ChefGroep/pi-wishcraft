# Motion x30 — powerline, keywords, lantern

Date: 2026-09-12
Status: implemented on `cursor/welcome-lantern-motion-2156`

The welcome lantern flicker was a single brightness term on one overlay.
This plan is the 30× version: **more motions, more triggers, and the
status/footer/powerline as the primary surface** — the same place Codex
shimmers Ultra and Claude Code rainbows `ultrathink`.

## Why the lantern-only pass is too small

- Welcome is 30 seconds of overlay, then gone. The operator lives in the
  **powerline** for the whole session.
- Footer already repaints (~33 ms debounce) while streaming, but layout
  is cached (250 ms idle / 1000 ms streaming) so baking flicker into
  segment render would freeze. Motion must be a **paint-time overlay**.
- Claude Code: typing `think` / `think hard` / `think harder` /
  `ultrathink` highlights the word and the status line. Codex: selecting
  Max/Ultra plays a one-shot composer + status-line shimmer, then keeps
  a tier accent. We copy the *contract*, not their glyphs.

## Surfaces (this cut)

| Surface | Motion |
|---|---|
| Powerline primary + secondary | Color overlay: shimmer / rainbow / ember / heat / aurora / comet / prism / tide / pulse |
| Last-prompt row | Rainbow (or catalog style) on the matched keyword span |
| Thinking level | Drives which catalog style runs while streaming |
| Editor draft | Keyword scan on each keystroke → burst + hold (no cursor-unsafe recolor of the input widget in this cut) |
| Welcome lantern | Keep spatial flame; shared `WISHCRAFT_REDUCED_MOTION` policy |

Not in this cut (still on the 30× map, not this PR): 3-row Signal lantern
rail, Deck transitions, live editor-buffer recolor, cursor effects.
Those were the closed vNext PR; we stay on the current widget layout.

## Quantity (×30 catalog + keywords)

- **≥30 named catalog motions** (named looks, different speed/palette/geometry).
- **≥30 keyword triggers**, longest-match, word-boundary, case-insensitive.
- Claude/Codex aliases are first-class: `ultrathink`, `ultra`, `max`,
  `think harder`, `think hard`, `think`, `xhigh`.
- Wishcraft aliases fill the rest: `lanternwake`, `kongming`, `ember`,
  `nova`, `crucible`, …

## How (×30 quality, not more spinners)

Primitives (Codex-class, color-only so layout width stays stable):

1. **shimmer** — traveling gold band (Codex “Working”)
2. **rainbow** — hue chase (Claude ultrathink)
3. **ember** — warm trail, lantern signature
4. **heat** — red/amber lift (`think harder`)
5. **aurora** — slow cyan/green wash
6. **comet** — tight head + long tail
7. **prism** — split complementary bands
8. **tide** — bidirectional breathe
9. **pulse** — whole-line brightness (low intensity / hush)

Scheduler: 50 ms frames **only while** streaming, keyword-hold, or a
finite burst. Idle with no keyword = no timer. Paint calls
`tui.requestRender()` **without** `layoutDirty`, so git/session scans
stay cached.

Policy: `wishcraft.motion.enabled` (default on),
`wishcraft.motion.keywords` (default on),
`WISHCRAFT_REDUCED_MOTION`, `NO_COLOR`. Host `prefers-reduced-motion`
is not detected.

Priority: keyword (hold/burst) > thinking `xhigh`/`max`/`high` >
streaming default shimmer > idle none.

## Test

Pure: primitives differ across time, reduced/NO_COLOR is identity,
keyword longest-match, catalog/keyword counts, paint preserves
`visibleWidth`. Wiring: overlay still uses lantern ticks; powerline
renderers call `applyMotion`.
