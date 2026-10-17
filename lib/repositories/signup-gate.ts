import { createClient } from "@vercel/global-config";

import {
    isAccountCap,
    parsePositiveInteger,
    SIGNUP_CLOSED,
    toSignupGateState,
    type SignupGateState,
} from "@/lib/domain/signup";
import { safeErrorSummary } from "@/lib/safe-error";

/** The owner's signup switch and account cap (ADR-0026). */
export interface SignupGate {
    /** Never throws: any failure to read the switch reads as closed. */
    read(): Promise<SignupGateState>;
}

export type SignupGateEnv = {
    GLOBAL_CONFIG?: string;
    /** The pre-rename name; an older store connection may set only this. */
    EDGE_CONFIG?: string;
    NODE_ENV?: string;
    SIGNUP_ENABLED?: string;
    MAX_USERS?: string;
};

/** Reads the `signupEnabled` and `maxUsers` items of the store at `connectionString`. */
export type SignupStoreReader = (
    connectionString: string,
) => Promise<Record<string, unknown>>;

export const SIGNUP_STORE_KEYS = ["signupEnabled", "maxUsers"];

/**
 * The real store read. `staleIfError: false` stops the client from serving a
 * cached "open" for up to a week while the store errors (ADR-0026 decision 3).
 */
export const readGlobalConfigStore: SignupStoreReader = (connectionString) =>
    createClient(connectionString, { staleIfError: false }).getAll(
        SIGNUP_STORE_KEYS,
    );

/** The first item that is missing or unusable, if any. The cap counts only when the switch is on. */
function malformedItem(items: Record<string, unknown>): string | undefined {
    if (typeof items.signupEnabled !== "boolean") return "signupEnabled";
    if (items.signupEnabled && !isAccountCap(items.maxUsers)) return "maxUsers";
    return undefined;
}

/** Vercel Global Config adapter; the store client is injected at the composition root. */
export class GlobalConfigSignupGate implements SignupGate {
    private readonly env: SignupGateEnv;
    private readonly readStore: SignupStoreReader;

    constructor(env: SignupGateEnv, readStore: SignupStoreReader) {
        this.env = env;
        this.readStore = readStore;
    }

    async read(): Promise<SignupGateState> {
        // `||`, not `??`: an empty string counts as unset for both names.
        const connectionString = this.env.GLOBAL_CONFIG || this.env.EDGE_CONFIG;
        if (!connectionString) {
            // Local development has no store; a production run never falls back.
            if (this.env.NODE_ENV === "production") return SIGNUP_CLOSED;
            return toSignupGateState(
                this.env.SIGNUP_ENABLED === "true",
                parsePositiveInteger(this.env.MAX_USERS),
            );
        }

        try {
            const items = await this.readStore(connectionString);
            const key = malformedItem(items);
            if (key) {
                // The type alone tells the owner what to fix; the value stays out of logs.
                console.warn(
                    "signupGate: store item is malformed, signup stays closed",
                    { key, type: typeof items[key] },
                );
                return SIGNUP_CLOSED;
            }
            return toSignupGateState(items.signupEnabled, items.maxUsers);
        } catch (error) {
            console.warn(
                "signupGate: store read failed, signup stays closed",
                safeErrorSummary(error),
            );
            return SIGNUP_CLOSED;
        }
    }
}
