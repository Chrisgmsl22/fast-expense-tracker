# ADR-0017: Mobile foundation — viewport, no horizontal scroll, responsive nav

Date: 2026-07-02
Status: Accepted

## Context

The app was built desktop-first (Phase 2 screens). On a real phone the
experience was broken: the page could be pinch-zoomed **out** into a "mini
desktop", it scrolled **horizontally**, the top nav (a non-wrapping flex row of
brand + links + email + Sign out) overflowed the viewport, and monthly (fixed)
income was **uneditable** — its editor was `hidden sm:grid`, so phones only got
a read-only summary. Phase 6 (Mobile Polish) owns the richer work (FAB,
optimistic UI, PWA, capture-form split), but it assumes the whole feature
surface is stable and is far off; the fundamentals were needed now to make the
app usable on a phone.

## Decision

Ship a focused **mobile-foundation** slice (2.11) that pulls the mobile
_fundamentals_ forward from Phase 6's audit, leaving the richer polish in Phase 6.

1. **Viewport / zoom policy** — `export const viewport` in the root layout with
   `width: "device-width", initialScale: 1, minimumScale: 1`. `minimumScale: 1`
   blocks zoom-**out** (the page can never render below a 1:1 fit → no "mini
   desktop"); `maximumScale` is intentionally omitted so pinch-zoom-**in** stays
   available for accessibility. (User ask: "pinch-zoom in fine; it should not
   shrink the page when I zoom out.")
2. **No horizontal scroll** — the _page_ must never scroll sideways. The real
   offenders are fixed at the source (a 390px audit caught the dashboard topbar);
   `html, body { overflow-x: clip; overflow-y: visible }` is a backstop. `clip`
   (not `hidden`) is required: `overflow-x: hidden` makes the root a scroll
   container — its `overflow-y` computes to `auto` — which breaks the desktop
   right-rail's viewport-relative `position: sticky`. A bare `overflow-x: clip`
   normalizes back to `hidden` unless paired with an explicit `overflow-y:
visible`; that pairing is the one CSS preserves (horizontal clipped, vertical
   left as the normal viewport scroll, no scroll container, sticky intact). Any
   legitimately wide element gets its own `overflow-x-auto` scroller so only it
   scrolls, not the page.
3. **Responsive nav** — the nav becomes a component (`AppNav`): the inline row
   stays on `≥md`; on mobile a hamburger opens a **Sheet drawer** (new
   `components/ui/sheet.tsx`, built on the same Base UI Dialog as `dialog.tsx`)
   holding the links + email + Sign out, so the header is a compact burger +
   brand that can't overflow.
4. **Fixed-income editable on mobile** — the `IncomeScreen` mobile layout gets
   its own editable Fixed card (reusing `FixedEditor`), not just a read-only
   summary.

## Consequences

- The viewport change is global; every screen benefits. Zoom-out is gone without
  sacrificing zoom-in a11y.
- The `overflow-x: clip` guard is a backstop — the discipline is to still fix
  overflow at the source (verified with a 390×844 Playwright audit of every
  route) so the guard never has to hide a real bug. Desktop `lg:sticky` was
  re-verified intact under the guard.
- A dedicated `Sheet` primitive now exists for future drawer needs.
- Phase 6 remains the home for FAB, optimistic UI, PWA install, the capture-form
  inline/modal split, and the full mobile e2e sweep — its audit checklist items
  for viewport + horizontal scroll are satisfied early by this slice.
