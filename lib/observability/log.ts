import * as Sentry from "@sentry/nextjs";

export const APP_LOG_LEVELS = {
    "expense.created": "info",
    "expense.create_failed": "error",
    "auth.login_failed": "error",
    "expense.updated": "info",
    "expense.deleted": "info",
    "expense.update_failed": "error",
    "expense.delete_failed": "error",
    "auth.signup_completed": "info",
    "auth.signup_failed": "error",
    "auth.oauth_consent_failed": "error",
    "onboarding.completed": "info",
    "onboarding.complete_failed": "error",
    "card.created": "info",
    "card.archived": "info",
    "card.write_failed": "error",
    "card_payment.recorded": "info",
    "card_payment.write_failed": "error",
    "transfer.recorded": "info",
    "transfer.write_failed": "error",
    "partner_payment.recorded": "info",
    "partner_payment.write_failed": "error",
    "settlement.closed": "info",
    "settlement.close_blocked": "warn",
    "settlement.close_failed": "error",
    "settlement.summary_copied": "info",
    "settlement.summary_copy_failed": "error",
    "export.generated": "info",
    "export.generate_failed": "error",
    "app.dependency_failed": "error",
    "app.configuration_invalid": "error",
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

    const attributes: NonNullable<Sentry.Log["attributes"]> = { event };
    for (const key of ["sentry.environment", "sentry.release"] as const) {
        if (typeof log.attributes?.[key] === "string")
            attributes[key] = log.attributes[key];
    }
    const reason = log.attributes?.reason;
    if (
        typeof reason === "string" &&
        APP_LOG_REASONS.includes(reason as AppLogReason)
    ) {
        attributes.reason = reason;
    }
    const operation = log.attributes?.operation;
    if (
        typeof operation === "string" &&
        APP_LOG_OPERATIONS.includes(operation as AppLogOperation)
    ) {
        attributes.operation = operation;
    }
    return { level: log.level, message: log.message, attributes };
}

export const APP_LOG_REASONS = [
    "not_settled",
    "database_timeout",
    "database_unavailable",
    "configuration_missing",
] as const;
export type AppLogReason = (typeof APP_LOG_REASONS)[number];
const APP_LOG_OPERATIONS = [
    "create",
    "update",
    "delete",
    "archive",
    "restore",
    "lookup",
    "signin",
    "provision",
] as const;
export type AppLogOperation = (typeof APP_LOG_OPERATIONS)[number];
export interface AppLogAttributes {
    reason?: AppLogReason;
    operation?: AppLogOperation;
}

export function filterBrowserAppLog(log: Sentry.Log): Sentry.Log | null {
    if (
        ![
            "settlement.summary_copied",
            "settlement.summary_copy_failed",
        ].includes(log.message)
    )
        return null;
    return filterAppLog(log);
}

/** Send one static, allowlisted server event without affecting the action result. */
export function logAppEvent(
    event: AppLogEvent,
    attributes: AppLogAttributes = {},
): void {
    try {
        Sentry.withIsolationScope((isolationScope) => {
            isolationScope.clear();
            Sentry.withScope((scope) => {
                scope.clear();
                for (const key of Object.keys(
                    Sentry.getGlobalScope().getScopeData().attributes ?? {},
                ))
                    scope.setAttribute(key, undefined);
                if (APP_LOG_LEVELS[event] === "error") {
                    Sentry.logger.error(event, { ...attributes, event });
                } else if (APP_LOG_LEVELS[event] === "warn") {
                    Sentry.logger.warn(event, { ...attributes, event });
                } else {
                    Sentry.logger.info(event, { ...attributes, event });
                }
            });
        });
    } catch {
        // Telemetry is best-effort and must not change an action result.
    }
}

/** Browser isolation scopes are shared, so shadow their attributes without clearing them. */
export function logSummaryCopyEvent(
    event: "settlement.summary_copied" | "settlement.summary_copy_failed",
): void {
    try {
        const attributes = {
            ...Sentry.getGlobalScope().getScopeData().attributes,
            ...Sentry.getIsolationScope().getScopeData().attributes,
        };
        Sentry.withScope((scope) => {
            scope.clear();
            for (const key of Object.keys(attributes ?? {}))
                scope.setAttribute(key, undefined);
            if (event === "settlement.summary_copied")
                Sentry.logger.info(event, { event });
            else Sentry.logger.error(event, { event });
        });
    } catch {
        // Telemetry must preserve both clipboard results and issue context.
    }
}
