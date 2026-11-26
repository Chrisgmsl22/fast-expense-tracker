// @vitest-environment node
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { logAppEvent, captureRequestError } = vi.hoisted(() => ({
    logAppEvent: vi.fn(),
    captureRequestError: vi.fn(),
}));
vi.mock("@/lib/observability/log", () => ({ logAppEvent }));
vi.mock("@sentry/nextjs", () => ({ captureRequestError }));

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
});
function databaseError(code: string) {
    return new Prisma.PrismaClientKnownRequestError("invented private query", {
        code,
        clientVersion: "test",
    });
}
it.each([
    ["P1001", "database_unavailable"],
    ["P1002", "database_timeout"],
    ["P1008", "database_timeout"],
    ["P2024", "database_timeout"],
    ["P1017", "database_unavailable"],
])(
    "Should recognize infrastructure failure %s without copying error details",
    async (code, reason) => {
        const { reportDependencyFailure } =
            await import("@/lib/observability/health");
        reportDependencyFailure(databaseError(code));
        expect(logAppEvent).toHaveBeenCalledExactlyOnceWith(
            "app.dependency_failed",
            { reason },
        );
    },
);
it("Should ignore ordinary errors and forged infrastructure codes", async () => {
    const { reportDependencyFailure } =
        await import("@/lib/observability/health");
    for (const error of [
        new Error("timeout"),
        { code: "P1001" },
        databaseError("P2002"),
        null,
    ])
        reportDependencyFailure(error);
    expect(logAppEvent).not.toHaveBeenCalled();
});
it("Should emit bounded standalone repeats and keep action-owned failures single-owner", async () => {
    const { failureAttributes, reportDependencyFailure } =
        await import("@/lib/observability/health");
    const owned = databaseError("P2024");
    expect(failureAttributes(owned)).toEqual({ reason: "database_timeout" });
    reportDependencyFailure(owned);
    expect(logAppEvent).not.toHaveBeenCalled();
    for (let i = 0; i < 100; i++)
        reportDependencyFailure(databaseError("P2024"));
    expect(logAppEvent).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    reportDependencyFailure(databaseError("P2024"));
    expect(logAppEvent).toHaveBeenCalledTimes(2);
});
it("Should report a missing required setting once without sending its name or value", async () => {
    vi.stubEnv("AUTH_SECRET", "invented-secret");
    vi.stubEnv("DATABASE_URL", "invented-connection");
    const { reportMissingConfiguration } =
        await import("@/lib/observability/health");
    reportMissingConfiguration();
    expect(logAppEvent).not.toHaveBeenCalled();
    vi.stubEnv("AUTH_SECRET", "");
    reportMissingConfiguration();
    reportMissingConfiguration();
    expect(logAppEvent).toHaveBeenCalledExactlyOnceWith(
        "app.configuration_invalid",
        { reason: "configuration_missing" },
    );
});
it("Should preserve issue capture and add one dependency log at the request boundary", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const { onRequestError } = await import("@/instrumentation");
    const error = databaseError("P1001");
    const request = { path: "/invented", method: "GET", headers: {} };
    const context = {
        routerKind: "App Router",
        routePath: "/invented",
        routeType: "render",
    } as const;
    onRequestError(error, request, context);
    await vi.waitFor(() => expect(logAppEvent).toHaveBeenCalledTimes(1));
    expect(captureRequestError).toHaveBeenCalledExactlyOnceWith(
        error,
        request,
        context,
    );
});

it("Should accept the documented database-free Preview configuration", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("AUTH_SECRET", "invented-secret");
    vi.stubEnv("DATABASE_URL", "");
    const { reportMissingConfiguration } =
        await import("@/lib/observability/health");
    reportMissingConfiguration();
    expect(logAppEvent).not.toHaveBeenCalled();
});

it("Should recognize a Prisma connection initialization failure", async () => {
    const { reportDependencyFailure } =
        await import("@/lib/observability/health");
    reportDependencyFailure(
        new Prisma.PrismaClientInitializationError(
            "invented private connection",
            "test",
            "P1001",
        ),
    );
    expect(logAppEvent).toHaveBeenCalledExactlyOnceWith(
        "app.dependency_failed",
        { reason: "database_unavailable" },
    );
});
