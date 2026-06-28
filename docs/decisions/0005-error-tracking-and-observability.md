# ADR-0005: Error Tracking and Observability — Sentry + Vercel Speed Insights

Date: 2026-06-01
Status: Superseded by [ADR-0014](./0014-glitchtip-replaces-sentry.md) (Sentry's free tier is no longer permanent; GlitchTip adopted instead. Speed Insights for Web Vitals is unchanged.)

## Context

The roadmap (Phases 0–7) had no slice for production error visibility. Once
the app is deployed and in real use, "why did it break in prod?" needs a
faster answer than reading raw Vercel runtime logs.

Constraints (from [ADR-0001](./0001-tech-stack.md)) that decide the choice:

- **Single user.** Error and traffic volume is a trickle, not a fleet.
- **Zero ongoing cost.** Free tiers only — a permanent free tier, not a trial.
- **Next.js 15 on Vercel.** First-class SDK + Vercel integration matter.
- **Agent-led, public repo.** Setup must be simple and leak no secrets.

Primary goal: **error tracking** (exceptions, stack traces, failed server
actions, API 5xx) with good grouping/alerting. Secondary, only what comes
free: **basic performance metrics** (Web Vitals + slow-transaction traces).
Product analytics (usage tracking) is explicitly out of scope — near-zero
value for a single user (YAGNI).

Options considered:

1. **Sentry (errors) + Vercel Speed Insights (Web Vitals)** — purpose-built
   error tracker with a permanent, generous free tier (~5k errors + ~10k
   performance spans/mo, well above a 1-user app); official `@sentry/nextjs`
   SDK wires server + client + edge in one install. Speed Insights adds
   real-user Web Vitals on the Vercel side in one line.
2. **Datadog** — enterprise APM/observability suite. Error tracking is one
   module inside per-host, usage-billed pricing; no permanent free tier.
   Built for fleets, not one Next.js app. Overkill; violates the $0 cap.
3. **Observe** — observability data lake, usage-based enterprise pricing, no
   hobby free tier. Same misfit as Datadog, more so.
4. **Vercel-native only** (Runtime Logs + Observability + Speed Insights) —
   already on, zero setup, free, but error _grouping/alerting_ is thin. It is
   logs + perf charts, not an error tracker — fails the primary goal.
5. **PostHog** — has error tracking now, generous free tier, but it is a
   product-analytics platform; adopting it drags in analytics we don't want.
6. **GlitchTip** (self-hosted, Sentry-compatible) — $0 in license but you run
   and patch the server, breaking the zero-ops intent.

## Decision

Adopt **Sentry for error tracking** and **Vercel Speed Insights for Web
Vitals**.

- **Sentry** (`@sentry/nextjs`): captures errors across server, client, and
  edge runtimes. Its free performance tracing covers the secondary "basic
  perf metrics" goal, so one SDK satisfies both halves of the scope.
- **Vercel Speed Insights** (`@vercel/speed-insights`): real-user Core Web
  Vitals, one `<SpeedInsights />` component in the root layout, enabled in the
  Vercel dashboard. Free.

Datadog and Observe are rejected as enterprise fleet tools — wrong scale,
wrong price, wrong ergonomics for a single-user app on a $0 budget.

### Secret hygiene (per [ADR-0003](./0003-env-secrets-handling.md))

The repo is public, so the Sentry wiring must respect the secret rules:

- The **Sentry DSN is client-publishable** by design (it ships in the browser
  bundle). It is _not_ a secret — it goes in env as `NEXT_PUBLIC_SENTRY_DSN`
  and `SENTRY_DSN`, with placeholders in `.env.example`.
- The **source-map upload auth token IS a secret** (`SENTRY_AUTH_TOKEN`) —
  Vercel env only, never the repo, never logged.
- **v1 skips source-map upload** to avoid blocking on the token. Errors are
  still captured (minified frames). Source maps can be added later by setting
  the auth token in Vercel.

### Implementation timing

Implementation is **deferred to Phase 1, slice 1.7 (Observability)** — a
parallel/fan-out slice. Rationale:

- Real prod traffic begins with Phase 1 (auth + capture = first usage), so
  error tracking live _with_ Phase 1 catches Phase 1's own prod errors.
- It is textbook fan-out work: touches root layout + config + env only, no
  shared state with feature slices → parallel-capable under the 2-agent cap.
- Doing it earlier than Phase 1 buys nothing (no traffic); doing it at the end
  (a Phase 8) would run blind for six phases.

The slice has a manual prerequisite: create a Sentry project (Next.js
platform), supply the DSN, and enable Speed Insights in the Vercel dashboard.
This is captured in `docs/roadmap/phase-1-foundation.md` and should be added
to `docs/operations/setup.md` when 1.7 goes next-up.

## Consequences

**Positive:**

- "Find prod errors easier" is satisfied by the field's best-fit free tool.
- One SDK (`@sentry/nextjs`) covers errors + basic perf; Speed Insights adds
  Web Vitals for one line. Both $0 at our scale.
- No new always-on infrastructure to run or patch (rules out GlitchTip's ops
  cost).

**Negative:**

- Adds an external vendor account (Sentry) the user must create and own.
- v1 has minified stack traces until the source-map auth token is configured
  in Vercel.
- Sentry's client SDK adds some JS to the bundle; acceptable for the value.

**Deferred / revisit:**

- Source-map upload (`SENTRY_AUTH_TOKEN`) — add post-v1.
- If error volume ever approaches the free-tier ceiling (it won't at 1 user),
  revisit sampling/quota settings.

## References

- [ADR-0001](./0001-tech-stack.md) — tech stack + zero-cost constraint
- [ADR-0003](./0003-env-secrets-handling.md) — env vars + secret handling (DSN vs auth token)
- `docs/roadmap/phase-1-foundation.md` — slice 1.7 (Observability) + manual prerequisite
- `docs/specs/0001-initial-design.md` — design spec (constraints)
