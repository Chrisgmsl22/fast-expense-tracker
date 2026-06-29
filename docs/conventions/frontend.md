# Frontend conventions

Applies the [architecture.md](./architecture.md) principles to React + Next.js
App Router. These are established React/Next clean-code practices, tuned to this
repo. Reference implementations: `components/expense/ExpenseForm.tsx`,
`components/ui/button.tsx`.

## Components

- **One component per file, PascalCase** (`ExpenseForm.tsx`). Group by feature in
  `components/<feature>/`; shared primitives in `components/ui/`.
- **Single responsibility; keep files small.** A component past ~200–250 lines or
  juggling unrelated concerns should split.
- **Presentational vs container.** Containers own state/data and wire actions;
  presentational components take props and render. Don't fetch data in a
  presentational component.
- **Compose, don't hand-roll.** Reuse shadcn/Base UI primitives (Button, Input,
  Dialog, Select…). When a structural pattern is copy-pasted ≥2× (e.g. a modal),
  extract a shared wrapper.

## Server / client boundary

- **Server Components by default.** Add `"use client"` ONLY when the component
  uses React state/effects/refs/context or `next/navigation`.
- A **pure HTML wrapper** (no hooks, no interactivity) stays a Server Component —
  don't add `"use client"` by reflex. (Interactive Base UI primitives like Button
  do need it.)
- **Fetch in RSC/pages, pass props down.** No client-side fetching for the first
  render.

## View logic

- **No business/derivation logic in JSX.** Formatting → `lib/format`, domain math
  → `lib/domain`. JSX renders; it doesn't compute.
- **Extract reusable stateful logic into a custom hook** (`hooks/use*.ts`) once
  it's duplicated (e.g. the form-error pattern → `useFormErrors`). Follow the
  rules of hooks.
- **Derive, don't store.** Compute from props/state during render instead of
  copying into extra state.

## Props & types

- Type props with a local `type Props` (inline for a single field). Export the
  option types consumers need.
- **Import domain/result types with `import type`** — zero runtime, and it avoids
  bundling server-only modules into the client.
- No `any`. Avoid deep prop-drilling — compose or lift to a shared parent; reach
  for context only when drilling is genuinely deep.

## Forms & server actions

- **Uncontrolled inputs**, read via `FormData` on submit. Control a field with
  state only when its value drives the DOM (e.g. a reveal toggle).
- Call the action inside **`useTransition`**; disable submit + show a pending
  label while `pending`.
- **The server is the single source of validation truth.** On `!res.ok`, render
  `res.fieldErrors` per field and `res.message` at form level. Don't gate on
  client-side validation.
- After a successful mutation, **`router.refresh()`** to revalidate RSC data — no
  manual client cache.

## Styling

- Tailwind v4 + design tokens in `globals.css` (`@theme`). **No magic hex in
  JSX** — card/category colors come from the documented token systems.
- Variants via **`cva` + `cn()`** (see `components/ui/button.tsx`). Don't
  copy-paste a class string ≥2× — extract a variant or shared constant/component.

## Accessibility (baseline, not optional)

- Every input has a `<label htmlFor>`. Icon-only buttons get `aria-label`. Use a
  real `<button>`, never `<div onClick>`.
- **Link field errors to inputs**: `aria-invalid` + `aria-describedby` on the
  input, matching `id` on the error node.
- Dialogs: `aria-labelledby` the title; rely on native `<dialog>` focus handling.

## Testing (Testing Library)

- **Test behavior, not implementation.** Query by role/label (`getByRole`,
  `getByLabelText`) — accessibility-first.
- Cover create **and** edit **and** error paths; assert pending states and
  rendered errors. Mock server actions + `useRouter`; never mock the component
  under test.
