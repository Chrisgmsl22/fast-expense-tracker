import * as Sentry from "@sentry/nextjs";

// Edge-runtime error capture (proxy.ts, edge route handlers) — ADR-0014.
// Inert when unset (see instrumentation-client.ts).
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    tracesSampleRate: 0,
});
