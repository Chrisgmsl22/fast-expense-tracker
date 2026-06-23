// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoisted above the imports vi.mock rewrites. Real `next-auth` is mocked so the
// suite doesn't load `next/server` (unresolvable under Vitest); `AuthErrorMock`
// is the same class `login.ts` imports, so its `instanceof` check still holds.
const { signInMock, AuthErrorMock } = vi.hoisted(() => {
    // Mirror the real AuthError's `type` discriminator so the test exercises
    // the same branch the code does (CredentialsSignin vs. other AuthErrors).
    class AuthErrorMock extends Error {
        type: string;
        constructor(type: string) {
            super(type);
            this.type = type;
        }
    }
    return { signInMock: vi.fn(), AuthErrorMock };
});
vi.mock("@/auth", () => ({ signIn: signInMock }));
vi.mock("next-auth", () => ({ AuthError: AuthErrorMock }));

import { loginAction } from "@/app/_actions/auth/login";

beforeEach(() => {
    signInMock.mockReset();
});

describe("loginAction", () => {
    it("rejects invalid input without calling signIn", async () => {
        const res = await loginAction({ email: "nope", password: "" });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("validation");
            expect(res.fieldErrors?.email).toBeDefined();
            expect(res.fieldErrors?.password).toBeDefined();
        }
        expect(signInMock).not.toHaveBeenCalled();
    });

    it("maps a CredentialsSignin AuthError to a generic invalid_credentials result", async () => {
        signInMock.mockRejectedValue(new AuthErrorMock("CredentialsSignin"));

        const res = await loginAction({
            email: "admin@example.com",
            password: "wrong",
        });

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("invalid_credentials");
            // Doesn't reveal whether the email exists.
            expect(res.message).toMatch(/invalid email or password/i);
        }
    });

    it("maps a non-credentials AuthError (e.g. DB outage wrapped as CallbackRouteError) to a generic error, NOT invalid_credentials", async () => {
        signInMock.mockRejectedValue(new AuthErrorMock("CallbackRouteError"));

        const res = await loginAction({
            email: "admin@example.com",
            password: "hunter2",
        });

        expect(res.ok).toBe(false);
        if (!res.ok) {
            // Must not be reported as a credentials problem — that would mask
            // an infra failure as a wrong password.
            expect(res.code).toBe("error");
            expect(res.message).not.toMatch(/invalid email or password/i);
        }
    });

    it("re-throws the success redirect (non-AuthError) so Next can navigate", async () => {
        const redirect = new Error("NEXT_REDIRECT");
        signInMock.mockRejectedValue(redirect);

        await expect(
            loginAction({ email: "admin@example.com", password: "hunter2" }),
        ).rejects.toBe(redirect);
    });
});
