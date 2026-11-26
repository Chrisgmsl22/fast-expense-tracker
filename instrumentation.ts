import * as Sentry from "@sentry/nextjs";

export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        await import("./sentry.server.config");
        const { reportMissingConfiguration } =
            await import("./lib/observability/health");
        reportMissingConfiguration();
    }

    if (process.env.NEXT_RUNTIME === "edge") {
        await import("./sentry.edge.config");
    }
}

// Captures errors from Server Components, route handlers, and the proxy.
export const onRequestError: typeof Sentry.captureRequestError = async (
    ...args
) => {
    // Keep automatic issue capture independent of selected structured health logs.
    if (process.env.NEXT_RUNTIME === "nodejs") {
        try {
            const { reportDependencyFailure } =
                await import("./lib/observability/health");
            reportDependencyFailure(args[0]);
        } catch {
            // Preserve issue capture when the health reporter cannot load.
        }
    }
    return Sentry.captureRequestError(...args);
};
