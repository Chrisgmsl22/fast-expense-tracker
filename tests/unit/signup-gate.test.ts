// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, getAllMock } = vi.hoisted(() => {
    const getAllMock = vi.fn();
    return {
        getAllMock,
        createClientMock: vi.fn(() => ({ getAll: getAllMock })),
    };
});
vi.mock("@vercel/global-config", () => ({ createClient: createClientMock }));

import {
    isAtAccountCap,
    parsePositiveInteger,
    toSignupGateState,
} from "@/lib/domain/signup";
import {
    GlobalConfigSignupGate,
    readGlobalConfigStore,
    type SignupGateEnv,
    type SignupStoreReader,
} from "@/lib/repositories/signup-gate";

const STORE = "https://global-config.vercel.com/invented-id?token=invented";
const OLDER_STORE =
    "https://edge-config.vercel.com/invented-old?token=invented";

function storeGate(
    items: Record<string, unknown>,
    env: SignupGateEnv = { NODE_ENV: "production" },
) {
    const readStore = vi.fn<SignupStoreReader>(async () => items);
    return {
        gate: new GlobalConfigSignupGate(
            { ...env, GLOBAL_CONFIG: STORE },
            readStore,
        ),
        readStore,
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("readGlobalConfigStore", () => {
    it("Should read both signup items with the stale-if-error cache turned off", async () => {
        getAllMock.mockResolvedValue({ signupEnabled: true, maxUsers: 10 });

        await expect(readGlobalConfigStore(STORE)).resolves.toEqual({
            signupEnabled: true,
            maxUsers: 10,
        });
        expect(createClientMock).toHaveBeenCalledWith(STORE, {
            staleIfError: false,
        });
        expect(getAllMock).toHaveBeenCalledWith(["signupEnabled", "maxUsers"]);
    });
});

describe("GlobalConfigSignupGate with a store", () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("Should open with the cap when the store holds a true switch and a positive cap", async () => {
        const { gate, readStore } = storeGate({
            signupEnabled: true,
            maxUsers: 10,
        });

        await expect(gate.read()).resolves.toEqual({
            open: true,
            maxUsers: 10,
        });
        expect(readStore).toHaveBeenCalledWith(STORE);
    });

    it.each([
        ["switch off", { signupEnabled: false, maxUsers: 10 }],
        ["switch missing", { maxUsers: 10 }],
        ["cap missing", { signupEnabled: true }],
        ["both missing", {}],
        ["switch as a string", { signupEnabled: "true", maxUsers: 10 }],
        ["switch as a number", { signupEnabled: 1, maxUsers: 10 }],
        ["switch null", { signupEnabled: null, maxUsers: 10 }],
        ["cap as a string", { signupEnabled: true, maxUsers: "10" }],
        ["cap zero", { signupEnabled: true, maxUsers: 0 }],
        ["cap negative", { signupEnabled: true, maxUsers: -3 }],
        ["cap fractional", { signupEnabled: true, maxUsers: 2.5 }],
        ["cap NaN", { signupEnabled: true, maxUsers: Number.NaN }],
        ["cap infinite", { signupEnabled: true, maxUsers: Infinity }],
        ["cap null", { signupEnabled: true, maxUsers: null }],
    ])("Should stay closed when the store has %s", async (_case, items) => {
        const { gate } = storeGate(items);

        await expect(gate.read()).resolves.toEqual({ open: false });
    });

    it.each([
        ["switch missing", { maxUsers: 10 }, "signupEnabled", "undefined"],
        [
            "switch as a string",
            { signupEnabled: "invented-value", maxUsers: 10 },
            "signupEnabled",
            "string",
        ],
        ["switch null", { signupEnabled: null }, "signupEnabled", "object"],
        ["cap missing", { signupEnabled: true }, "maxUsers", "undefined"],
        [
            "cap as a string",
            { signupEnabled: true, maxUsers: "invented-value" },
            "maxUsers",
            "string",
        ],
        [
            "cap zero",
            { signupEnabled: true, maxUsers: 0 },
            "maxUsers",
            "number",
        ],
    ])(
        "Should warn once naming the key and its type when the store has %s",
        async (_case, items, key, type) => {
            const { gate } = storeGate(items);

            await expect(gate.read()).resolves.toEqual({ open: false });
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledWith(
                "signupGate: store item is malformed, signup stays closed",
                { key, type },
            );
            expect(JSON.stringify(warn.mock.calls)).not.toContain(
                "invented-value",
            );
        },
    );

    it.each([
        ["an open gate", { signupEnabled: true, maxUsers: 10 }],
        ["a closed switch without a cap", { signupEnabled: false }],
        [
            "a closed switch with a bad cap",
            { signupEnabled: false, maxUsers: "10" },
        ],
    ])("Should not warn for %s", async (_case, items) => {
        const { gate } = storeGate(items);

        await gate.read();
        expect(warn).not.toHaveBeenCalled();
    });

    it("Should stay closed and log only the error class when the read throws", async () => {
        const gate = new GlobalConfigSignupGate(
            { GLOBAL_CONFIG: STORE, NODE_ENV: "production" },
            async () => {
                throw new TypeError(`fetch failed for ${STORE}`);
            },
        );

        await expect(gate.read()).resolves.toEqual({ open: false });
        expect(warn).toHaveBeenCalledWith(expect.any(String), {
            name: "TypeError",
        });
        expect(JSON.stringify(warn.mock.calls)).not.toContain("token");
    });

    it("Should stay closed when the store returns no object", async () => {
        const gate = new GlobalConfigSignupGate(
            { GLOBAL_CONFIG: STORE },
            async () => null as unknown as Record<string, unknown>,
        );

        await expect(gate.read()).resolves.toEqual({ open: false });
    });

    it.each([
        ["GLOBAL_CONFIG is unset", { EDGE_CONFIG: STORE }],
        ["GLOBAL_CONFIG is empty", { GLOBAL_CONFIG: "", EDGE_CONFIG: STORE }],
    ])(
        "Should read the store named by EDGE_CONFIG when %s",
        async (_case, connection) => {
            const readStore = vi.fn<SignupStoreReader>(async () => ({
                signupEnabled: true,
                maxUsers: 10,
            }));
            const gate = new GlobalConfigSignupGate(
                { ...connection, NODE_ENV: "production" },
                readStore,
            );

            await expect(gate.read()).resolves.toEqual({
                open: true,
                maxUsers: 10,
            });
            expect(readStore).toHaveBeenCalledWith(STORE);
        },
    );

    it("Should prefer GLOBAL_CONFIG when EDGE_CONFIG is also set", async () => {
        const readStore = vi.fn<SignupStoreReader>(async () => ({
            signupEnabled: true,
            maxUsers: 10,
        }));
        const gate = new GlobalConfigSignupGate(
            {
                GLOBAL_CONFIG: STORE,
                EDGE_CONFIG: OLDER_STORE,
                NODE_ENV: "production",
            },
            readStore,
        );

        await gate.read();
        expect(readStore).toHaveBeenCalledTimes(1);
        expect(readStore).toHaveBeenCalledWith(STORE);
    });

    it("Should ignore the env fallback when a store is connected", async () => {
        const { gate } = storeGate(
            { signupEnabled: false, maxUsers: 10 },
            { NODE_ENV: "development", SIGNUP_ENABLED: "true", MAX_USERS: "5" },
        );

        await expect(gate.read()).resolves.toEqual({ open: false });
    });
});

describe("GlobalConfigSignupGate without a store", () => {
    function envGate(env: SignupGateEnv) {
        const readStore = vi.fn<SignupStoreReader>();
        return { gate: new GlobalConfigSignupGate(env, readStore), readStore };
    }

    it.each(["development", "test", undefined])(
        "Should read SIGNUP_ENABLED and MAX_USERS when NODE_ENV is %s",
        async (nodeEnv) => {
            const { gate, readStore } = envGate({
                NODE_ENV: nodeEnv,
                SIGNUP_ENABLED: "true",
                MAX_USERS: "10",
            });

            await expect(gate.read()).resolves.toEqual({
                open: true,
                maxUsers: 10,
            });
            expect(readStore).not.toHaveBeenCalled();
        },
    );

    it("Should never fall back to the environment in production", async () => {
        const { gate, readStore } = envGate({
            NODE_ENV: "production",
            SIGNUP_ENABLED: "true",
            MAX_USERS: "10",
        });

        await expect(gate.read()).resolves.toEqual({ open: false });
        expect(readStore).not.toHaveBeenCalled();
    });

    it("Should treat an empty GLOBAL_CONFIG as no store", async () => {
        const { gate } = envGate({
            GLOBAL_CONFIG: "",
            NODE_ENV: "production",
            SIGNUP_ENABLED: "true",
            MAX_USERS: "10",
        });

        await expect(gate.read()).resolves.toEqual({ open: false });
    });

    it("Should stay closed in production when GLOBAL_CONFIG and EDGE_CONFIG are both empty", async () => {
        const { gate, readStore } = envGate({
            GLOBAL_CONFIG: "",
            EDGE_CONFIG: "",
            NODE_ENV: "production",
            SIGNUP_ENABLED: "true",
            MAX_USERS: "10",
        });

        await expect(gate.read()).resolves.toEqual({ open: false });
        expect(readStore).not.toHaveBeenCalled();
    });

    it("Should read the env fallback in development when GLOBAL_CONFIG and EDGE_CONFIG are both empty", async () => {
        const { gate, readStore } = envGate({
            GLOBAL_CONFIG: "",
            EDGE_CONFIG: "",
            NODE_ENV: "development",
            SIGNUP_ENABLED: "true",
            MAX_USERS: "10",
        });

        await expect(gate.read()).resolves.toEqual({
            open: true,
            maxUsers: 10,
        });
        expect(readStore).not.toHaveBeenCalled();
    });

    it.each([
        ["SIGNUP_ENABLED unset", { MAX_USERS: "10" }],
        ["SIGNUP_ENABLED false", { SIGNUP_ENABLED: "false", MAX_USERS: "10" }],
        ["SIGNUP_ENABLED TRUE", { SIGNUP_ENABLED: "TRUE", MAX_USERS: "10" }],
        ["SIGNUP_ENABLED 1", { SIGNUP_ENABLED: "1", MAX_USERS: "10" }],
        ["MAX_USERS unset", { SIGNUP_ENABLED: "true" }],
        ["MAX_USERS zero", { SIGNUP_ENABLED: "true", MAX_USERS: "0" }],
        ["MAX_USERS negative", { SIGNUP_ENABLED: "true", MAX_USERS: "-1" }],
        ["MAX_USERS fractional", { SIGNUP_ENABLED: "true", MAX_USERS: "2.5" }],
        ["MAX_USERS words", { SIGNUP_ENABLED: "true", MAX_USERS: "ten" }],
        ["MAX_USERS empty", { SIGNUP_ENABLED: "true", MAX_USERS: "" }],
        ["MAX_USERS padded", { SIGNUP_ENABLED: "true", MAX_USERS: " 10" }],
    ])("Should stay closed with %s", async (_case, env) => {
        const { gate } = envGate({ NODE_ENV: "development", ...env });

        await expect(gate.read()).resolves.toEqual({ open: false });
    });
});

describe("signup domain helpers", () => {
    it("Should open only for a true switch and a positive whole cap", () => {
        expect(toSignupGateState(true, 1)).toEqual({ open: true, maxUsers: 1 });
        expect(toSignupGateState(true, 0)).toEqual({ open: false });
    });

    it.each([
        ["10", 10],
        ["1", 1],
        ["01", undefined],
        ["99999999999999999999", undefined],
        [undefined, undefined],
    ])("Should parse %s as %s", (raw, expected) => {
        expect(parsePositiveInteger(raw)).toBe(expected);
    });

    it.each([
        [9, 10, false],
        [10, 10, true],
        [11, 10, true],
    ])(
        "Should report %i accounts against a cap of %i as full: %s",
        (count, cap, full) => {
            expect(isAtAccountCap(count, cap)).toBe(full);
        },
    );
});
