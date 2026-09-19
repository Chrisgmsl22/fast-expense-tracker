import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    watchIdleSession,
    IDLE_SESSION_STORAGE_KEY,
} from "@/lib/auth/idle-session-client";
import { ACTIVITY_THROTTLE_MS, IDLE_TIMEOUT_MS } from "@/lib/auth/idle-session";

const NOW = Date.UTC(2026, 8, 18, 12);
const SESSION_ID = "invented-session";
const session = (deadline: number, id = SESSION_ID) => ({
    idleExpiresAt: deadline,
    idleSessionId: id,
});
const readSession = vi.fn();
const renewSession = vi.fn();
const onExpire = vi.fn();
const onSignedOut = vi.fn();
let stop: (() => void) | undefined;
const start = (deadline = NOW + IDLE_TIMEOUT_MS) => {
    stop = watchIdleSession({
        session: session(deadline),
        readSession,
        renewSession,
        onExpire,
        onSignedOut,
    });
};
const flush = async () => {
    await vi.advanceTimersByTimeAsync(0);
};
const activity = (name = "pointermove") =>
    window.dispatchEvent(new Event(name));
const announce = (deadline: number, id = SESSION_ID) =>
    window.dispatchEvent(
        new StorageEvent("storage", {
            key: IDLE_SESSION_STORAGE_KEY,
            newValue: JSON.stringify(session(deadline, id)),
        }),
    );

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.resetAllMocks();
    localStorage.clear();
    readSession.mockResolvedValue(null);
    renewSession.mockImplementation(async (_id: string, idleForMs: number) =>
        session(Date.now() - idleForMs + IDLE_TIMEOUT_MS),
    );
});
afterEach(() => {
    stop?.();
    vi.useRealTimers();
});

describe("idle session client", () => {
    it("Should expire automatically when no activity occurs", async () => {
        start();
        await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - 1);
        expect(onExpire).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(onExpire).toHaveBeenCalledTimes(1);
        expect(renewSession).not.toHaveBeenCalled();
    });
    it.each(["pointerdown", "pointermove", "keydown", "touchstart", "scroll"])(
        "Should renew when %s input occurs",
        async (name) => {
            start();
            await vi.advanceTimersByTimeAsync(1000);
            activity(name);
            await flush();
            expect(renewSession).toHaveBeenCalledWith(
                SESSION_ID,
                0,
                expect.any(AbortSignal),
            );
            await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - 1);
            expect(onExpire).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            expect(onExpire).toHaveBeenCalledTimes(1);
        },
    );
    it("Should retain the final event when activity falls inside the throttle window", async () => {
        start();
        activity();
        await flush();
        await vi.advanceTimersByTimeAsync(ACTIVITY_THROTTLE_MS - 1);
        activity("keydown");
        await flush();
        expect(renewSession).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(renewSession).toHaveBeenLastCalledWith(
            SESSION_ID,
            1,
            expect.any(AbortSignal),
        );
        expect(renewSession).toHaveBeenCalledTimes(2);
    });
    it("Should preserve activity that arrives while renewal waits for a response", async () => {
        let resolve!: (value: ReturnType<typeof session>) => void;
        renewSession.mockReturnValueOnce(
            new Promise((done) => {
                resolve = done;
            }),
        );
        start();
        activity();
        await flush();
        await vi.advanceTimersByTimeAsync(1000);
        activity("keydown");
        resolve(session(NOW + IDLE_TIMEOUT_MS));
        await flush();
        await vi.advanceTimersByTimeAsync(ACTIVITY_THROTTLE_MS - 1000);
        expect(renewSession).toHaveBeenCalledTimes(2);
        expect(renewSession).toHaveBeenLastCalledWith(
            SESSION_ID,
            ACTIVITY_THROTTLE_MS - 1000,
            expect.any(AbortSignal),
        );
    });
    it("Should keep an idle tab open when another tab renews the session", async () => {
        start();
        await vi.advanceTimersByTimeAsync(1000);
        announce(NOW + 1000 + IDLE_TIMEOUT_MS);
        await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - 1000);
        expect(onExpire).not.toHaveBeenCalled();
        expect(renewSession).not.toHaveBeenCalled();
    });
    it("Should ignore an older deadline when a delayed response follows another tab's renewal", async () => {
        let resolve!: (value: ReturnType<typeof session>) => void;
        renewSession.mockReturnValueOnce(
            new Promise((done) => {
                resolve = done;
            }),
        );
        start();
        activity();
        await flush();
        await vi.advanceTimersByTimeAsync(1000);
        announce(NOW + 1000 + IDLE_TIMEOUT_MS);
        resolve(session(NOW + IDLE_TIMEOUT_MS));
        await flush();
        await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - 1000);
        expect(onExpire).not.toHaveBeenCalled();
    });
    it("Should recheck the cookie when an old tab sees a different login", async () => {
        readSession.mockResolvedValue(
            session(NOW + IDLE_TIMEOUT_MS + 5000, "new-session"),
        );
        start();
        announce(NOW + IDLE_TIMEOUT_MS + 5000, "new-session");
        await flush();
        activity();
        await flush();
        expect(renewSession).toHaveBeenCalledWith(
            "new-session",
            0,
            expect.any(AbortSignal),
        );
    });
    it("Should check expiry after sleep without treating focus as activity", async () => {
        start();
        vi.setSystemTime(NOW + IDLE_TIMEOUT_MS + 1);
        window.dispatchEvent(new Event("focus"));
        await flush();
        expect(onExpire).toHaveBeenCalledTimes(1);
        expect(renewSession).not.toHaveBeenCalled();
    });
    it("Should check the session when visibility returns", async () => {
        readSession.mockResolvedValue(session(NOW + IDLE_TIMEOUT_MS));
        start();
        document.dispatchEvent(new Event("visibilitychange"));
        await flush();
        expect(readSession).toHaveBeenCalledTimes(1);
        expect(renewSession).not.toHaveBeenCalled();
    });
    it("Should avoid an expiry notice when another tab signs out before the deadline", async () => {
        start();
        window.dispatchEvent(new Event("focus"));
        await flush();
        expect(onSignedOut).toHaveBeenCalledTimes(1);
        expect(onExpire).not.toHaveBeenCalled();
    });
    it("Should ignore late input when the local deadline already passed", async () => {
        start();
        vi.setSystemTime(NOW + IDLE_TIMEOUT_MS);
        activity();
        await flush();
        expect(renewSession).not.toHaveBeenCalled();
        expect(onExpire).toHaveBeenCalledTimes(1);
    });
    it("Should remove timers and listeners when the guard unmounts", async () => {
        start();
        activity();
        await flush();
        activity("keydown");
        stop?.();
        renewSession.mockClear();
        activity();
        window.dispatchEvent(new Event("focus"));
        announce(NOW + IDLE_TIMEOUT_MS);
        await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS * 2);
        expect(renewSession).not.toHaveBeenCalled();
        expect(readSession).not.toHaveBeenCalled();
        expect(onExpire).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});

it("Should discard a stale null response after another tab reports activity", async () => {
    let resolve!: (value: null) => void;
    readSession
        .mockReturnValueOnce(
            new Promise((done) => {
                resolve = done;
            }),
        )
        .mockResolvedValue(session(NOW + IDLE_TIMEOUT_MS + 1000));
    start();
    window.dispatchEvent(new Event("focus"));
    announce(NOW + IDLE_TIMEOUT_MS + 1000);
    resolve(null);
    await flush();
    expect(onExpire).not.toHaveBeenCalled();
    expect(onSignedOut).not.toHaveBeenCalled();
    expect(readSession).toHaveBeenCalledTimes(2);
});

it("Should retry the final activity after a transient renewal failure", async () => {
    renewSession.mockRejectedValueOnce(new Error("offline"));
    start();
    activity();
    await flush();
    await vi.advanceTimersByTimeAsync(ACTIVITY_THROTTLE_MS);
    expect(renewSession).toHaveBeenCalledTimes(2);
    expect(renewSession).toHaveBeenLastCalledWith(
        SESSION_ID,
        ACTIVITY_THROTTLE_MS,
        expect.any(AbortSignal),
    );
});

it("Should ignore a pending response after cleanup", async () => {
    let resolve!: (value: ReturnType<typeof session>) => void;
    renewSession.mockReturnValueOnce(
        new Promise((done) => {
            resolve = done;
        }),
    );
    start();
    activity();
    await flush();
    stop?.();
    resolve(session(NOW + IDLE_TIMEOUT_MS));
    await flush();
    expect(vi.getTimerCount()).toBe(0);
    expect(onExpire).not.toHaveBeenCalled();
});

it("Should enforce expiry when a passive read never resolves", async () => {
    readSession.mockReturnValue(new Promise(() => {}));
    start();
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 60_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
});

it("Should enforce expiry when activity renewal never resolves", async () => {
    renewSession.mockReturnValue(new Promise(() => {}));
    readSession.mockReturnValue(new Promise(() => {}));
    start();
    activity();
    await flush();
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 60_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
});

it("Should avoid immediate retries when renewal fails just before expiry", async () => {
    renewSession.mockRejectedValue(new Error("offline"));
    start();
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - 500);
    activity();
    await flush();
    expect(renewSession).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(renewSession).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(renewSession).toHaveBeenCalledTimes(1);
});
