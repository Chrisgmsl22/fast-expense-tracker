import { Prisma } from "@prisma/client";
import { logAppEvent, type AppLogAttributes, type AppLogReason } from "./log";

const ownedFailures = new WeakSet<object>();
const lastReported = new Map<AppLogReason, number>();
const REPEAT_INTERVAL_MS = 60_000;

export function infrastructureReason(error: unknown): AppLogReason | undefined {
    if (
        error instanceof Prisma.PrismaClientKnownRequestError ||
        error instanceof Prisma.PrismaClientInitializationError
    ) {
        const code =
            error instanceof Prisma.PrismaClientKnownRequestError
                ? error.code
                : error.errorCode;
        if (code === "P1002" || code === "P1008" || code === "P2024")
            return "database_timeout";
        if (code === "P1001" || code === "P1017") return "database_unavailable";
    }
    return undefined;
}

/** The action owns this failure, even if a later request hook sees it again. */
export function failureAttributes(error: unknown): AppLogAttributes {
    if (typeof error === "object" && error !== null) ownedFailures.add(error);
    const reason = infrastructureReason(error);
    return reason ? { reason } : {};
}

function reportOnce(
    event: "app.dependency_failed" | "app.configuration_invalid",
    reason: AppLogReason,
): void {
    const now = Date.now();
    const previous = lastReported.get(reason);
    if (previous !== undefined && now - previous < REPEAT_INTERVAL_MS) return;
    lastReported.set(reason, now);
    logAppEvent(event, { reason });
}

export function reportDependencyFailure(error: unknown): void {
    if (typeof error === "object" && error !== null && ownedFailures.has(error))
        return;
    const reason = infrastructureReason(error);
    if (reason) reportOnce("app.dependency_failed", reason);
}

export function reportMissingConfiguration(): void {
    const databaseRequired = process.env.VERCEL_ENV !== "preview";
    if (
        !process.env.AUTH_SECRET ||
        (databaseRequired && !process.env.DATABASE_URL)
    ) {
        reportOnce("app.configuration_invalid", "configuration_missing");
    }
}
