import * as Sentry from "@sentry/nextjs";

// Server-side error capture (GlitchTip via the Sentry SDK — ADR-0014).
// Prefers the server-only SENTRY_DSN, falling back to the public one.
// Inert when unset (see instrumentation-client.ts).
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    tracesSampleRate: 0,
});
