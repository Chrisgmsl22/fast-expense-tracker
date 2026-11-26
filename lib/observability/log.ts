import * as Sentry from "@sentry/nextjs";

export const APP_LOG_LEVELS = {
    "expense.created": "info",
    "expense.create_failed": "error",
    "auth.login_failed": "error",
} as const;

export type AppLogEvent = keyof typeof APP_LOG_LEVELS;

export function filterAppLog(log: Sentry.Log): Sentry.Log | null {
    const event = log.attributes?.event;
    if (
        typeof event !== "string" ||
        !(event in APP_LOG_LEVELS) ||
        log.level !== APP_LOG_LEVELS[event as AppLogEvent] ||
        log.message !== event
    ) {
        return null;
    }

    const attributes = Object.fromEntries(
        Object.entries(log.attributes ?? {}).filter(([key]) =>
            ["event", "sentry.environment", "sentry.release"].includes(key),
        ),
    );
    return { level: log.level, message: log.message, attributes };
}

/** Send one static, allowlisted server event without affecting the action result. */
export function logAppEvent(event: AppLogEvent): void {
    try {
        Sentry.withIsolationScope((isolationScope) => {
            isolationScope.clear();
            Sentry.withScope((scope) => {
                scope.clear();
                if (APP_LOG_LEVELS[event] === "error") {
                    Sentry.logger.error(event, { event });
                } else {
                    Sentry.logger.info(event, { event });
                }
            });
        });
    } catch {
        // Telemetry is best-effort and must not change an action result.
    }
}
