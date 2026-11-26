// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import {
    filterBrowserAppLog,
    logSummaryCopyEvent,
} from "@/lib/observability/log";
type MockTransportFactory = NonNullable<
    Parameters<typeof Sentry.init>[0]["transport"]
>;
type MockEnvelope = Parameters<ReturnType<MockTransportFactory>["send"]>[0];
afterEach(async () => {
    await Sentry.close(1000);
    vi.restoreAllMocks();
});
it("Should isolate clipboard logs while keeping surrounding issue attributes", async () => {
    const envelopes: unknown[] = [];
    const client = Sentry.init({
        dsn: "https://public@example.invalid/1",
        enabled: true,
        enableLogs: true,
        dataCollection: { userInfo: false },
        beforeSendLog: filterBrowserAppLog,
        transport: () => ({
            send: async (envelope: MockEnvelope) => {
                envelopes.push(envelope);
                return { statusCode: 200 };
            },
            flush: async () => true,
        }),
    });
    Sentry.getCurrentScope().setClient(client);
    Sentry.getIsolationScope().setUser({ id: "invented-private-user" });
    Sentry.getIsolationScope().setAttribute(
        "private.report",
        "invented-private-summary",
    );
    Sentry.getCurrentScope().setAttribute(
        "private.request",
        "invented-private-route",
    );
    Sentry.logger.info("expense.created", { event: "expense.created" });
    logSummaryCopyEvent("settlement.summary_copied");
    logSummaryCopyEvent("settlement.summary_copy_failed");
    await Sentry.flush(1000);
    const logEnvelopes = envelopes.filter((envelope) =>
        JSON.stringify(envelope).includes('"type":"log"'),
    );
    expect(logEnvelopes).toHaveLength(1);
    const serialized = JSON.stringify(logEnvelopes);
    expect(serialized).toContain("settlement.summary_copied");
    expect(serialized).toContain("settlement.summary_copy_failed");
    expect(serialized).not.toContain("expense.created");
    expect(serialized).not.toContain("invented-private");
    expect(Sentry.getIsolationScope().getScopeData().user).toEqual({
        id: "invented-private-user",
    });
    expect(Sentry.getIsolationScope().getScopeData().attributes).toMatchObject({
        "private.report": "invented-private-summary",
    });
    expect(Sentry.getCurrentScope().getScopeData().attributes).toMatchObject({
        "private.request": "invented-private-route",
    });
});

it("Should preserve clipboard results when either telemetry level throws", () => {
    vi.spyOn(Sentry.logger, "info").mockImplementation(() => {
        throw new Error("invented telemetry outage");
    });
    vi.spyOn(Sentry.logger, "error").mockImplementation(() => {
        throw new Error("invented telemetry outage");
    });
    expect(() =>
        logSummaryCopyEvent("settlement.summary_copied"),
    ).not.toThrow();
    expect(() =>
        logSummaryCopyEvent("settlement.summary_copy_failed"),
    ).not.toThrow();
});
