import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
    /* config options here */
    // The dev server would otherwise print server-action arguments, passwords included.
    logging: { serverFunctions: false },
};

export default withSentryConfig(withNextIntl(nextConfig), {
    // Source-map upload is deferred (needs SENTRY_AUTH_TOKEN, a Vercel-only
    // secret) — ADR-0014. v1 captures minified frames.
    sourcemaps: { disable: true },
    // Only log upload/build noise in CI.
    silent: !process.env.CI,
});
