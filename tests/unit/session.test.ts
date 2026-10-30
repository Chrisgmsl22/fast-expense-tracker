// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { getSessionContext, getSessionUserId } from "@/lib/auth/session";

beforeEach(() => {
    authMock.mockReset();
});

describe.each([
    ["getSessionUserId", getSessionUserId],
    ["getSessionContext", getSessionContext],
])("%s", (_name, readSession) => {
    it.each([null, {}, { user: null }, { user: {} }, { user: { id: "" } }])(
        "Should return null for a session without a user id: %j",
        async (session) => {
            authMock.mockResolvedValue(session);

            expect(await readSession()).toBeNull();
            expect(authMock).toHaveBeenCalledTimes(1);
        },
    );

    it("Should propagate a provider failure", async () => {
        const error = new Error("session unavailable");
        authMock.mockRejectedValue(error);

        await expect(readSession()).rejects.toBe(error);
    });
});

it("Should return the provider user id unchanged on each read", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "user-a" } });
    authMock.mockResolvedValueOnce({ user: { id: "user-b" } });

    expect(await getSessionUserId()).toBe("user-a");
    expect(await getSessionUserId()).toBe("user-b");
    expect(authMock).toHaveBeenCalledTimes(2);
});

it("Should preserve the layout's display and idle fields with one read", async () => {
    authMock.mockResolvedValue({
        user: {
            id: "user-a",
            name: "Invented Name",
            email: "test@example.com",
        },
        idleExpiresAt: 1792854000000,
        idleSessionId: "idle-a",
        expires: "2026-10-24T18:00:00Z",
    });

    expect(await getSessionContext()).toEqual({
        userId: "user-a",
        name: "Invented Name",
        email: "test@example.com",
        idleExpiresAt: 1792854000000,
        idleSessionId: "idle-a",
    });
    expect(authMock).toHaveBeenCalledTimes(1);
});

it("Should preserve absent display and idle fields", async () => {
    authMock.mockResolvedValue({
        user: { id: "user-a", name: null, email: null },
    });

    expect(await getSessionContext()).toEqual({
        userId: "user-a",
        name: null,
        email: null,
        idleExpiresAt: undefined,
        idleSessionId: undefined,
    });
});
