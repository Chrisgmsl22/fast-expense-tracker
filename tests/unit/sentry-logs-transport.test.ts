// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";

import { filterAppLog, logAppEvent } from "@/lib/observability/log";

type MockTransportFactory = NonNullable<
    Parameters<typeof Sentry.init>[0]["transport"]
>;
type MockEnvelope = Parameters<ReturnType<MockTransportFactory>["send"]>[0];

afterEach(async () => {
    await Sentry.close(1000);
    vi.restoreAllMocks();
});

it("Should swallow a telemetry sender failure", () => {
    vi.spyOn(Sentry.logger, "info").mockImplementation(() => {
        throw new Error("telemetry unavailable");
    });

    expect(() => logAppEvent("expense.created")).not.toThrow();
});

it("Should serialize only the approved event when the surrounding scope has user data", async () => {
    const envelopes: unknown[] = [];
    Sentry.init({
        dsn: "https://public@example.invalid/1",
        enabled: true,
        enableLogs: true,
        environment: "test",
        release: "test-release",
        beforeSendLog: filterAppLog,
        transport: () => ({
            send: async (envelope: MockEnvelope) => {
                envelopes.push(envelope);
                return { statusCode: 200 };
            },
            flush: async () => true,
        }),
    });

    Sentry.getCurrentScope().setUser({
        id: "invented-user-id",
        email: "invented@example.com",
    });
    Sentry.getCurrentScope().setAttribute("request.path", "/invented/path");
    Sentry.getIsolationScope().setAttribute("record.id", "invented-record-id");
    Sentry.getCurrentScope().setTag("request.path", "/invented/path");
    logAppEvent("expense.created");
    await Sentry.flush(1000);

    expect(envelopes).toHaveLength(1);
    const serialized = JSON.stringify(envelopes[0]);
    expect(serialized).toContain("expense.created");
    expect(serialized).toContain("sentry.environment");
    expect(serialized).toContain("sentry.release");
    expect(serialized).not.toContain("invented-user-id");
    expect(serialized).not.toContain("invented@example.com");
    expect(serialized).not.toContain("request.path");
    expect(serialized).not.toContain("invented-record-id");
    expect(Sentry.getCurrentScope().getScopeData().attributes).toMatchObject({
        "request.path": "/invented/path",
    });
    expect(Sentry.getIsolationScope().getScopeData().attributes).toMatchObject({
        "record.id": "invented-record-id",
    });
});
