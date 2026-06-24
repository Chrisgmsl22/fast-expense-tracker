# ADR-0010: Light theme only for now; dark mode deferred

Date: 2026-06-23
Status: Accepted

## Context

Slice 1.9 (design-system foundation) reworked `app/globals.css`. The previous
file was the Next.js starter default: it defined only `--background`/`--foreground`
and switched to dark via `@media (prefers-color-scheme: dark)` — i.e. the app
auto-darkened with the OS. But the component layer references a full shadcn token
set (`primary`, `muted`, `border`, `ring`, `card`, `popover`, …) that was never
defined, so those utilities didn't render. The design handoff
([`docs/designs-screens/`](../designs-screens/README.md)) is specified in a light
palette, and a light/dark **toggle** is a separate, design-pending backlog item.

## Decision

- Define the **full token set in light only**, mapped via `@theme inline`.
- **Remove the `@media (prefers-color-scheme: dark)` block.** It only ever flipped
  two tokens; with the now-complete light palette, leaving OS-auto-dark would render
  a broken half-dark UI (only bg/fg flip, everything else stays light).
- Keep tokens as CSS variables on `:root` so a future **class-based** dark theme
  (`.dark { … }`) is additive — no structural change needed to introduce it.

## Consequences

**Positive**

- Components finally render with their intended tokens (fixes the undefined refs).
- A future dark theme is a token-values + toggle change, not a re-architecture.

**Negative / deferred**

- Users on OS dark mode no longer get auto-dark. Acceptable: the designs are
  light, and a real toggle (with a full dark palette) is the planned path.
- **Dark mode is deferred** — design-pending backlog; build a class-based toggle
  once dark designs land. Tracked separately.

## References

- `app/globals.css` — the token definitions.
- `docs/designs-screens/README.md` §Design Tokens — the light color systems.
