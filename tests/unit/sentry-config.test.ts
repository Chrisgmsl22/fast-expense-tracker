import { describe, it, expect, vi, beforeEach } from "vitest";

// Stable mock across module resets so each fresh import of the config hits the
// same spy (the config modules call Sentry.init at import time).
const { init } = vi.hoisted(() => ({ init: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({
    init,
    captureRouterTransitionStart: vi.fn(),
    captureRequestError: vi.fn(),
}));

describe("Sentry/GlitchTip config — inert when DSN unset (ADR-0014)", () => {
    beforeEach(() => {
        vi.resetModules();
        init.mockClear();
        delete process.env.NEXT_PUBLIC_SENTRY_DSN;
        delete process.env.SENTRY_DSN;
    });

    it("Should disable the client SDK when NEXT_PUBLIC_SENTRY_DSN is unset", async () => {
        await import("@/instrumentation-client");
        expect(init).toHaveBeenCalledWith(
            expect.objectContaining({ dsn: undefined, enabled: false }),
        );
    });

    it("Should enable the client SDK, errors-only, when the DSN is set", async () => {
        process.env.NEXT_PUBLIC_SENTRY_DSN =
            "https://key@app.glitchtip.com/123";
        await import("@/instrumentation-client");
        expect(init).toHaveBeenCalledWith(
            expect.objectContaining({
                dsn: "https://key@app.glitchtip.com/123",
                enabled: true,
                tracesSampleRate: 0,
            }),
        );
    });

    it("Should disable the server SDK when no DSN is present", async () => {
        await import("@/sentry.server.config");
        expect(init).toHaveBeenCalledWith(
            expect.objectContaining({ dsn: undefined, enabled: false }),
        );
    });

    it("Should let the server SDK fall back to NEXT_PUBLIC_SENTRY_DSN", async () => {
        process.env.NEXT_PUBLIC_SENTRY_DSN = "https://pub@app.glitchtip.com/9";
        await import("@/sentry.server.config");
        expect(init).toHaveBeenCalledWith(
            expect.objectContaining({
                dsn: "https://pub@app.glitchtip.com/9",
                enabled: true,
            }),
        );
    });

    it("Should allow only static CHORE-45 logs and safe attributes", async () => {
        await import("@/sentry.server.config");
        const options = init.mock.calls[0]?.[0] as {
            enableLogs: boolean;
            beforeSendLog: (log: {
                level: string;
                message: string;
                attributes?: Record<string, unknown>;
            }) => unknown;
        };
        expect(options.enableLogs).toBe(true);
        expect(
            options.beforeSendLog({
                level: "error",
                message: "auth.login_failed",
                attributes: {
                    event: "auth.login_failed",
                    "sentry.environment": "test",
                    email: "invented@example.com",
                    userId: "invented-user",
                    reason: "raw exception text",
                },
            }),
        ).toEqual({
            level: "error",
            message: "auth.login_failed",
            attributes: {
                event: "auth.login_failed",
                "sentry.environment": "test",
            },
        });
        expect(
            options.beforeSendLog({
                level: "error",
                message: "unapproved.event",
                attributes: { event: "unapproved.event" },
            }),
        ).toBeNull();
        expect(
            options.beforeSendLog({
                level: "info",
                message: "auth.login_failed",
                attributes: { event: "auth.login_failed" },
            }),
        ).toBeNull();
    });
});
