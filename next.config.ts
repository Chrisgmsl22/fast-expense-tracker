import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
    /* config options here */
};

export default withSentryConfig(nextConfig, {
    // Source-map upload is deferred (needs SENTRY_AUTH_TOKEN, a Vercel-only
    // secret) — ADR-0014. v1 captures minified frames.
    sourcemaps: { disable: true },
    // Only log upload/build noise in CI.
    silent: !process.env.CI,
});
