// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const { read, renew, set, get } = vi.hoisted(() => ({
    read: vi.fn(),
    renew: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
}));
vi.mock("@/auth", () => ({ authProvider: { api: { getSession: read } } }));
vi.mock("@/lib/repositories", () => ({ authSessionRepository: { renew } }));
vi.mock("next/headers", () => ({
    headers: async () => new Headers(),
    cookies: async () => ({ get, set }),
}));
import { renewSession } from "@/lib/auth/renew-session";
const current = {
    user: {
        id: "invented-user",
        name: "Invented",
        email: "invented@example.com",
    },
    session: {
        id: "invented-session",
        token: "invented-token",
        expiresAt: new Date(Date.now() + 60_000),
    },
};
beforeEach(() => {
    vi.resetAllMocks();
    read.mockResolvedValue(current);
    get.mockReturnValue({ value: "invented-signed-cookie" });
});
it.each([-1, Infinity, NaN, 1800000, "0", null])(
    "Should preserve the deadline when activity input is invalid (%s)",
    async (idleForMs) => {
        expect(
            await renewSession("invented-session", idleForMs as number),
        ).toBeNull();
        expect(read).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
    },
);
it("Should preserve the deadline when an update lacks real activity", async () => {
    expect(await renewSession("", 0)).toBeNull();
    expect(renew).not.toHaveBeenCalled();
});
it("Should ignore activity from a prior login in another tab", async () => {
    expect(await renewSession("prior-session", 0)).toBeNull();
    expect(renew).not.toHaveBeenCalled();
});
it("Should reject prior tokens when idle claims are absent", async () => {
    read.mockResolvedValue(null);
    expect(await renewSession("invented-session", 0)).toBeNull();
    expect(renew).not.toHaveBeenCalled();
});
it("publishes the signed cookie only after the guarded database write resolves", async () => {
    const expiresAt = new Date(Date.now() + 1800000);
    renew.mockImplementation(async () => {
        expect(set).not.toHaveBeenCalled();
        return expiresAt;
    });
    expect(await renewSession("invented-session", 25)).toMatchObject({
        idleSessionId: "invented-session",
        idleExpiresAt: expiresAt.getTime(),
    });
    expect(renew).toHaveBeenCalledWith(
        {
            id: "invented-session",
            token: "invented-token",
            userId: "invented-user",
        },
        25,
    );
    expect(set).toHaveBeenCalledWith(
        expect.any(String),
        "invented-signed-cookie",
        expect.objectContaining({
            httpOnly: true,
            sameSite: "lax",
            expires: expiresAt,
        }),
    );
});
it("never publishes cookies when expiry or revocation wins the renewal race", async () => {
    renew.mockResolvedValue(null);
    expect(await renewSession("invented-session", 0)).toBeNull();
    expect(set).not.toHaveBeenCalled();
});
it("never publishes cookies when the database write fails", async () => {
    renew.mockRejectedValue(new Error("injected"));
    await expect(renewSession("invented-session", 0)).rejects.toThrow(
        "injected",
    );
    expect(set).not.toHaveBeenCalled();
});
