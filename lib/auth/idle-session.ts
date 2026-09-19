export const IDLE_TIMEOUT_SECONDS = 30 * 60;
export const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_SECONDS * 1000;
export const ACTIVITY_THROTTLE_MS = 15_000;
export const EXPIRED_LOGIN_PATH = "/login?reason=session-expired";

export function isIdleElapsed(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value < IDLE_TIMEOUT_MS
    );
}
