// @vitest-environment node
import { expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { toWebSession } from "@/lib/auth/web-session";

it("Should start the idle window when credentials identify a user", () => {
    expect(authConfig.session.expiresIn).toBe(1800);
});
it("Should preserve the deadline when a passive session read occurs", () => {
    expect(authConfig.session.disableSessionRefresh).toBe(true);
    expect(authConfig.session.cookieCache.enabled).toBe(false);
});
it("Should expose the authoritative deadline when a valid session forms", () => {
    expect(
        toWebSession({
            user: {
                id: "invented",
                name: "Invented",
                email: "invented@example.com",
            },
            session: {
                id: "session",
                expiresAt: new Date("2026-01-01T00:30:00Z"),
            },
        }),
    ).toEqual({
        user: {
            id: "invented",
            name: "Invented",
            email: "invented@example.com",
        },
        idleSessionId: "session",
        idleExpiresAt: 1767227400000,
        expires: "2026-01-01T00:30:00.000Z",
    });
});
it("keeps bcrypt cost 10 and legacy short password verification", async () => {
    const hash = await authConfig.emailAndPassword.password.hash("abc");
    expect(bcrypt.getRounds(hash)).toBe(10);
    expect(
        await authConfig.emailAndPassword.password.verify({
            hash,
            password: "abc",
        }),
    ).toBe(true);
    expect(
        await authConfig.emailAndPassword.password.verify({
            hash,
            password: "wrong",
        }),
    ).toBe(false);
});
