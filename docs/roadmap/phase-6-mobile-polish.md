# Phase 6: Mobile Polish

**Status**: 🔒 Locked
**Outcome**: FAB + optimistic UI + PWA install + inline/modal responsive capture-form split.
**Spec**: [`docs/specs/0001-initial-design.md` §7 — Phase 6](../specs/0001-initial-design.md)
**Slicing**: [`parallel-slicing.md`](../conventions/parallel-slicing.md) — F→Fan-out→I

By Phase 6 the feature surface is stable, so mobile polish targets the
final form. Capture form switches from "Option B" (modal everywhere — from
Phase 1) to "Option D" (inline on desktop, modal on mobile — from
brainstorming session).

## Slices

#### 6.1: Responsive audit + FAB + useMediaQuery `[PR]`

**Type**: Foundation
**Depends on**: 1.*, 2.*

Lays down the responsive patterns the fan-out slices use.

##### Tasks

- [ ] `useMediaQuery` hook (or use existing if shadcn provides)
- [ ] `FloatingActionButton` component (mobile only via media query)
- [ ] Breakpoint conventions documented inline (Tailwind defaults: `sm`, `md`, `lg`, `xl`)
- [ ] Mobile audit checklist created (touch target sizes, font sizes, scroll behavior, viewport meta)
- [ ] Tests: hook behavior, FAB render

---

#### 6.2: Capture form responsive split `[PR]`

**Type**: Parallel (with 6.3, 6.4)
**Depends on**: 6.1

Inline row on desktop ≥md; modal on mobile.

##### Tasks

- [ ] `InlineExpenseRow` component for desktop: spreadsheet-style row at the top of the list
- [ ] Tab between fields, Enter submits, focus returns to first field for batch entry
- [ ] Mobile (≤sm): keep existing modal behavior
- [ ] Conditional render via `useMediaQuery`
- [ ] Tests: both modes, keyboard nav on desktop

---

#### 6.3: Optimistic UI on capture / edit / delete `[PR]`

**Type**: Parallel (with 6.2, 6.4)
**Depends on**: 6.1

Visual immediacy via React 19 `useOptimistic`.

##### Tasks

- [ ] `useOptimistic` in capture handler — row appears instantly, settles when server confirms
- [ ] Same for edit, delete
- [ ] Visual indicator while pending (subtle opacity / skeleton border)
- [ ] Rollback on error with toast notification
- [ ] Tests: optimistic + rollback paths

---

#### 6.4: PWA manifest + install prompt + icons `[PR]`

**Type**: Parallel (with 6.2, 6.3)
**Depends on**: 6.1

Make the app installable as a home-screen PWA.

##### Tasks

- [ ] `app/manifest.ts` with name, theme color, icons
- [ ] App icons: 1024, 512, 192, 32, favicon
- [ ] Service worker (Next.js built-in PWA support OR `next-pwa` plugin — decide)
- [ ] `InstallPrompt` component shown when `beforeinstallprompt` fires
- [ ] Tests: manifest serves, prompt component render

---

#### 6.5: Mobile regression sweep + Playwright mobile-viewport `[PR]`

**Type**: Integration
**Depends on**: 6.2, 6.3

E2E coverage in a mobile viewport + manual audit pass.

##### Tasks

- [ ] Playwright config: add mobile viewport (iPhone 13 or similar)
- [ ] Re-run Phase 1 e2e tests in mobile viewport → fix breakages
- [ ] Re-run Phase 2 e2e tests in mobile viewport
- [ ] Manual mobile audit: touch targets ≥44px, no horizontal scroll, FAB doesn't obscure content, optimistic UI smooth
- [ ] Document findings + fixes in PR description
