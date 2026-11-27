// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInMock } = vi.hoisted(() => ({ signInMock: vi.fn() }));
vi.mock("@/auth", () => ({
    signIn: signInMock,
    InvalidCredentialsError: class extends Error {},
}));
vi.mock("@sentry/nextjs", () => ({
    logger: { info: vi.fn(), error: vi.fn() },
    getGlobalScope: () => ({ getScopeData: () => ({ attributes: {} }) }),
    withIsolationScope: (callback: (scope: { clear: () => void }) => unknown) =>
        callback({ clear: vi.fn() }),
    withScope: (callback: (scope: { clear: () => void }) => unknown) =>
        callback({ clear: vi.fn() }),
}));

import { loginAction } from "@/app/_actions/auth/login";

const credentials = { email: "oauth@example.com", password: "Invented-1" };

beforeEach(() => signInMock.mockReset());

describe("loginAction OAuth continuation", () => {
    it("guard: passes the signed query to signIn and returns the next URL", async () => {
        signInMock.mockResolvedValue("/consent?client_id=invented&sig=abc");
        const oauthQuery = "client_id=invented&sig=abc";

        const result = await loginAction({ ...credentials, oauthQuery });

        expect(result).toEqual({
            ok: true,
            data: "/consent?client_id=invented&sig=abc",
        });
        expect(signInMock).toHaveBeenCalledWith(
            "credentials",
            expect.objectContaining({ oauthQuery }),
        );
    });

    it("pin: a plain login sends no OAuth query", async () => {
        signInMock.mockResolvedValue(undefined);

        expect(await loginAction(credentials)).toEqual({
            ok: true,
            data: undefined,
        });
        expect(signInMock.mock.calls[0]![1]).not.toHaveProperty("oauthQuery");
    });
});
