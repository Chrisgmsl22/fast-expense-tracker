# Phase 7: Email Summary

**Outcome**: Weekly Resend email summary; day configurable from Settings.
**Spec**: [`docs/specs/0001-initial-design.md` §7 — Phase 7](../specs/0001-initial-design.md)
**Slicing**: [`parallel-slicing.md`](../conventions/parallel-slicing.md) — F→Fan-out→I

The "nice-to-have at the end" feature from the brainstorming session. A
weekly summary email arrives on the user's configured day (default
Monday) showing last week's totals.

Email is **pure summary** (per brainstorming Q9a) — no settlement nudge,
no log-reminder. Just last week's Spent / Saved / Remaining + top 3
categories.

If by Phase 6 the user has moved on to MoneyFlow, Phase 7 can be skipped.

## Prerequisites (manual)

Before **7.1** — complete §7 of [`docs/operations/setup.md`](../operations/setup.md) (Resend account, API key, `CRON_SECRET`).

## Slices

#### 7.1: Resend integration + email scaffold `[PR]`

Wires up Resend + React Email base template.

##### Tasks

- [ ] Install `resend` SDK
- [ ] Add `RESEND_API_KEY` to `.env.example` (placeholder only per ADR-0003)
- [ ] Install `@react-email/components`
- [ ] `EmailLayout` base component (header, footer, brand colors)
- [ ] `lib/email/client.ts` — Resend client singleton
- [ ] Tests: client config, layout render

---

#### 7.2: Email template content + preview route `[PR]`

The actual email template + a dev-only preview route.

##### Tasks

- [ ] `WeeklySummaryEmail` React Email component
- [ ] Inputs: `{ spent, saved, remaining, topCategories[], weekStart, weekEnd }`
- [ ] Hardcoded copy template (English)
- [ ] `/dev/email-preview` route (only available when `NODE_ENV !== 'production'`)
- [ ] Tests: template renders with sample data

---

#### 7.3: Vercel cron + summary computation + emailDay honored `[PR]`

Cron handler that decides when to send and computes the summary.

##### Tasks

- [ ] `vercel.json` cron config: run daily at 08:00 CDMX (14:00 UTC)
- [ ] API route handler `/api/cron/weekly-summary`
- [ ] Auth via cron secret env var (`CRON_SECRET`)
- [ ] Logic: read `Settings.emailDay`; if today matches, compute last-week's summary and send
- [ ] Last-week range: previous Monday 00:00 CDMX → previous Sunday 23:59 CDMX (or computed off `emailDay`)
- [ ] Tests: handler logic (day match / mismatch), summary computation

---

#### 7.4: E2E with test-mode Resend `[PR]`

End-to-end test that the cron actually produces the right email content.

##### Tasks

- [ ] Configure Resend test mode (or mock the SDK in tests)
- [ ] Integration test: seed expenses for last week → trigger cron handler → assert mock received email with expected body
- [ ] Test the day-mismatch path: trigger cron on a non-`emailDay` → assert no email sent
- [ ] Test the suppress path: if `Settings.emailDay` is null/disabled → assert no email sent
- [ ] Document the "how to test the email locally" steps in a dev README section
