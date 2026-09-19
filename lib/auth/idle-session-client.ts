import { ACTIVITY_THROTTLE_MS } from "./idle-session";
import {
    boundedSessionRequest,
    SESSION_REQUEST_TIMEOUT_MS,
} from "./session-request";

export const IDLE_SESSION_STORAGE_KEY = "fet:idle-session";
type IdleSession = { idleExpiresAt?: number; idleSessionId?: string };
type Options = {
    session: IdleSession;
    readSession: (signal: AbortSignal) => Promise<IdleSession | null>;
    renewSession: (
        sessionId: string,
        idleForMs: number,
        signal: AbortSignal,
    ) => Promise<IdleSession | null>;
    onExpire: (sessionId: string, deadline: number) => void;
    onSignedOut: () => void;
};
const ACTIVITY_EVENTS = [
    "pointerdown",
    "pointermove",
    "keydown",
    "touchstart",
    "scroll",
];

export function watchIdleSession(options: Options): () => void {
    let sessionId = options.session.idleSessionId ?? "";
    let deadline = options.session.idleExpiresAt ?? 0;
    let stopped = false;
    let busy = false;
    let checkRequested = false;
    let revision = 0;
    let activityAt: number | null = null;
    let lastRequestAt = -Infinity;
    let retryNotBefore = 0;
    const lifetime = new AbortController();
    let expiryFallback: ReturnType<typeof setTimeout>;
    let expiryTimer: ReturnType<typeof setTimeout>;
    let activityTimer: ReturnType<typeof setTimeout>;

    function stop() {
        stopped = true;
        clearTimeout(expiryTimer);
        clearTimeout(expiryFallback);
        clearTimeout(activityTimer);
        lifetime.abort();
        ACTIVITY_EVENTS.forEach((name) =>
            window.removeEventListener(name, onActivity, true),
        );
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("storage", onStorage);
        document.removeEventListener("visibilitychange", onVisibility);
    }
    function finish(expired: boolean) {
        stop();
        if (expired) options.onExpire(sessionId, deadline);
        else options.onSignedOut();
    }
    function scheduleExpiry() {
        clearTimeout(expiryTimer);
        clearTimeout(expiryFallback);
        if (!stopped)
            expiryTimer = setTimeout(
                () => {
                    clearTimeout(activityTimer);
                    activityAt = null;
                    expiryFallback = setTimeout(() => {
                        if (!stopped && Date.now() >= deadline) finish(true);
                    }, SESSION_REQUEST_TIMEOUT_MS);
                    void checkSession();
                },
                Math.max(0, deadline - Date.now()),
            );
    }
    function accept(session: IdleSession | null): boolean {
        if (
            !session?.idleSessionId ||
            typeof session.idleExpiresAt !== "number" ||
            !Number.isFinite(session.idleExpiresAt) ||
            session.idleExpiresAt <= Date.now()
        )
            return false;
        if (session.idleSessionId !== sessionId) {
            sessionId = session.idleSessionId;
            activityAt = null;
            deadline = session.idleExpiresAt;
        } else {
            deadline = Math.max(deadline, session.idleExpiresAt);
        }
        scheduleExpiry();
        return true;
    }
    function publish() {
        try {
            localStorage.setItem(
                IDLE_SESSION_STORAGE_KEY,
                JSON.stringify({
                    idleSessionId: sessionId,
                    idleExpiresAt: deadline,
                }),
            );
        } catch {
            // Focus and deadline checks still protect tabs when storage is unavailable.
        }
    }
    function afterRequest() {
        busy = false;
        if (stopped) return;
        if (checkRequested) {
            checkRequested = false;
            void checkSession();
        } else if (activityAt !== null) scheduleActivity();
    }
    async function checkSession() {
        if (stopped) return;
        if (busy) {
            checkRequested = true;
            return;
        }
        busy = true;
        const checkedRevision = revision;
        try {
            const session = await boundedSessionRequest(
                options.readSession,
                lifetime.signal,
            );
            if (stopped) return;
            if (checkedRevision !== revision) {
                checkRequested = true;
                return;
            }
            if (!accept(session)) finish(Date.now() >= deadline);
        } catch {
            if (Date.now() >= deadline && !stopped) finish(true);
            else scheduleExpiry();
        } finally {
            afterRequest();
        }
    }
    function scheduleActivity() {
        if (stopped || busy || activityAt === null) return;
        clearTimeout(activityTimer);
        const delay = Math.max(
            retryNotBefore - Date.now(),
            Math.min(
                Math.max(0, lastRequestAt + ACTIVITY_THROTTLE_MS - Date.now()),
                Math.max(0, deadline - Date.now() - 1000),
            ),
        );
        if (Date.now() + delay < deadline)
            activityTimer = setTimeout(() => void renew(), delay);
    }
    async function renew() {
        if (stopped || busy || activityAt === null) return;
        if (Date.now() >= deadline) {
            void checkSession();
            return;
        }
        const sentActivity = activityAt;
        const sentSessionId = sessionId;
        activityAt = null;
        lastRequestAt = Date.now();
        busy = true;
        try {
            const session = await boundedSessionRequest(
                (signal) =>
                    options.renewSession(
                        sentSessionId,
                        Math.max(0, Date.now() - sentActivity),
                        signal,
                    ),
                lifetime.signal,
            );
            if (stopped) return;
            if (sentSessionId !== sessionId || !accept(session))
                checkRequested = true;
            else publish();
        } catch {
            activityAt = Math.max(activityAt ?? 0, sentActivity);
            retryNotBefore = Date.now() + ACTIVITY_THROTTLE_MS;
        } finally {
            afterRequest();
        }
    }
    function onActivity() {
        if (Date.now() >= deadline) {
            void checkSession();
            return;
        }
        activityAt = Date.now();
        scheduleActivity();
    }
    function onFocus() {
        void checkSession();
    }
    function onVisibility() {
        if (document.visibilityState === "visible") void checkSession();
    }
    function onStorage(event: StorageEvent) {
        if (event.key !== IDLE_SESSION_STORAGE_KEY || !event.newValue) return;
        try {
            const session: IdleSession = JSON.parse(event.newValue);
            if (!session || typeof session.idleSessionId !== "string") return;
            revision += 1;
            if (session.idleSessionId !== sessionId) void checkSession();
            else accept(session);
        } catch {
            /* Ignore unrelated or malformed storage data. */
        }
    }

    ACTIVITY_EVENTS.forEach((name) =>
        window.addEventListener(name, onActivity, {
            capture: true,
            passive: true,
        }),
    );
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    scheduleExpiry();
    publish();
    return stop;
}
