# ADR-0014: GlitchTip Replaces Sentry for Error Tracking

Date: 2026-06-28
Status: Accepted (supersedes [ADR-0005](./0005-error-tracking-and-observability.md))

## Context

[ADR-0005](./0005-error-tracking-and-observability.md) chose **Sentry** for
error tracking on the strength of a _permanent, generous free tier_ (~5k
errors/mo). That premise was the deciding factor against the rejected
alternatives, all of which failed the **$0-permanent** constraint from
[ADR-0001](./0001-tech-stack.md).

When slice 1.7 went next-up and we went to create the Sentry project, the free
tier turned out to be **not permanent** — Sentry now gates error tracking
behind a time-limited trial, not a free-forever plan. The premise ADR-0005 was
built on no longer holds, so the decision has to be re-made.

Constraints are unchanged from ADR-0005: single user (trickle of errors),
**$0 permanent** (a real free-forever tier, not a trial), Next.js 16 on Vercel,
agent-led public repo (simple setup, no leaked secrets), zero ongoing ops.

Re-evaluated against those constraints:

- **GlitchTip (hosted)** — open-source, **Sentry-API-compatible** error tracker.
  Hosted SaaS free tier is **1,000 events/mo, "free forever," no credit card**
  (verified on glitchtip.com/pricing). ~33 errors/day — far above a 1-user app.
  Because it speaks Sentry's ingest API, the `@sentry/nextjs` SDK works
  unchanged; only the DSN host differs. Zero ops (managed).
- **Vercel-native only** — $0, already on, but no grouped issues/alerting
  (logs, not an error tracker) — same gap ADR-0005 found.
- **PostHog** — generous free tier but an analytics platform; drags in surface
  we don't want (YAGNI), heavier client bundle.
- **Rollbar / Bugsnag** — dedicated trackers with free tiers, but a brand-new
  SDK to wire (none of the planned Sentry work carries over).
- **Self-hosted GlitchTip** — $0 license but breaks the zero-ops intent
  (server, Postgres, Redis, patching, uptime). Rejected, as in ADR-0005.

## Decision

Adopt **GlitchTip (hosted SaaS)** for error tracking, keeping **Vercel Speed
Insights** for Web Vitals (unchanged from ADR-0005).

- **GlitchTip** via the **`@sentry/nextjs`** SDK — the SDK is unchanged from the
  ADR-0005 plan; the DSN points at GlitchTip's ingest host instead of Sentry's.
  Server + client + edge configs read the DSN from `process.env`, inert when
  unset (no hardcoded DSN). The DSN is **client-publishable, not a secret**
  (same as ADR-0005's reasoning) — `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` with
  placeholders in `.env.example`.
- **Vercel Speed Insights** (`@vercel/speed-insights`) — one `<SpeedInsights />`
  in the root layout. GlitchTip's Sentry-performance/tracing support is partial,
  so the "basic perf metrics" secondary goal leans **fully** on Speed Insights
  (Web Vitals) rather than on SDK tracing. We capture **errors only** through
  GlitchTip; tracing/perf sampling stays off.
- **Source-map upload deferred** (as in ADR-0005) — needs an auth token
  (Vercel-only secret); v1 captures minified frames.

## Consequences

**Positive:**

- Restores the **$0-permanent** guarantee that ADR-0005 promised but Sentry no
  longer delivers — verified free-forever, no card.
- The `@sentry/nextjs` implementation planned for 1.7 carries over almost
  unchanged (Sentry-compatible API) — minimal re-planning cost.
- Zero new always-on infrastructure (hosted, not self-run).

**Negative:**

- Lower event ceiling than Sentry's old tier (1k vs ~5k/mo) — irrelevant at
  1 user, but worth noting if usage ever grows.
- Adds an external vendor account (GlitchTip) the user creates and owns.
- No SDK-side performance tracing — Web Vitals come solely from Speed Insights.
- v1 has minified stack traces until the source-map auth token is configured.

**Deferred / revisit:**

- Source-map upload (`SENTRY_AUTH_TOKEN` pointed at GlitchTip) — add post-v1.
- If event volume ever nears 1k/mo, revisit the GlitchTip paid tier ($15/mo,
  100k) or self-hosting.

## References

- [ADR-0005](./0005-error-tracking-and-observability.md) — superseded; original
  Sentry decision + the full alternatives matrix (Datadog/Observe/PostHog/etc.)
- [ADR-0001](./0001-tech-stack.md) — tech stack + $0 constraint
- [ADR-0003](./0003-env-secrets-handling.md) — DSN-vs-auth-token secret handling
- GlitchTip pricing (free-forever, 1k events/mo): https://glitchtip.com/pricing/
- `docs/roadmap/phase-1-foundation.md` — slice 1.7 (Observability)
