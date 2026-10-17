/** Whether a new account may be created right now, and the account cap when it may. */
export type SignupGateState =
    | { open: true; maxUsers: number }
    | { open: false };

export const SIGNUP_CLOSED: SignupGateState = { open: false };

/**
 * Fails closed (ADR-0026): only a `true` switch and a positive whole cap open
 * signup. Takes `unknown` because the values come from an external store.
 */
export function toSignupGateState(
    signupEnabled: unknown,
    maxUsers: unknown,
): SignupGateState {
    if (signupEnabled !== true || !isAccountCap(maxUsers)) return SIGNUP_CLOSED;
    return { open: true, maxUsers };
}

/** A positive whole number of accounts. */
export function isAccountCap(value: unknown): value is number {
    return (
        typeof value === "number" && Number.isSafeInteger(value) && value >= 1
    );
}

/** A positive whole number written in plain digits, else `undefined`. */
export function parsePositiveInteger(
    raw: string | undefined,
): number | undefined {
    if (raw === undefined || !/^[1-9]\d*$/.test(raw)) return undefined;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : undefined;
}

export function isAtAccountCap(userCount: number, maxUsers: number): boolean {
    return userCount >= maxUsers;
}
