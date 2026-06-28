import * as Sentry from "@sentry/nextjs";

// Client-side error capture (GlitchTip via the Sentry SDK — ADR-0014).
// DSN is publishable, not a secret. Inert when unset: no DSN => SDK disabled,
// so local dev and DSN-less builds send nothing.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    // Errors only. Web Vitals come from Vercel Speed Insights, not SDK tracing.
    tracesSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
