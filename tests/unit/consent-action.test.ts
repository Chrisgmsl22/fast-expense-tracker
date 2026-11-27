// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { answerConsentMock, errorMock } = vi.hoisted(() => ({
    answerConsentMock: vi.fn(),
    errorMock: vi.fn(),
}));
vi.mock("@/lib/auth/oauth-consent", () => ({
    answerConsent: answerConsentMock,
}));
vi.mock("@sentry/nextjs", () => ({
    logger: { info: vi.fn(), error: errorMock },
    getGlobalScope: () => ({ getScopeData: () => ({ attributes: {} }) }),
    withIsolationScope: (callback: (scope: { clear: () => void }) => unknown) =>
        callback({ clear: vi.fn() }),
    withScope: (callback: (scope: { clear: () => void }) => unknown) =>
        callback({ clear: vi.fn() }),
}));

import { consentAction } from "@/app/_actions/auth/consent";

const oauthQuery = "client_id=invented&sig=abc";

beforeEach(() => {
    answerConsentMock.mockReset();
    errorMock.mockReset();
});

describe("consentAction", () => {
    it.each([true, false])(
        "guard: forwards accept=%s and returns the provider URL",
        async (accept) => {
            answerConsentMock.mockResolvedValue("fet-test://oauth/cb?code=x");

            expect(await consentAction({ accept, oauthQuery })).toEqual({
                ok: true,
                data: "fet-test://oauth/cb?code=x",
            });
            expect(answerConsentMock).toHaveBeenCalledWith(accept, oauthQuery);
        },
    );

    it("guard: rejects a request without a query", async () => {
        const result = await consentAction({ accept: true });

        expect(result).toMatchObject({ ok: false, code: "error" });
        expect(answerConsentMock).not.toHaveBeenCalled();
        expect(errorMock).toHaveBeenCalledWith("auth.oauth_consent_failed", {
            event: "auth.oauth_consent_failed",
        });
    });

    it("guard: reports a provider failure without leaking it", async () => {
        answerConsentMock.mockRejectedValue(new Error("invalid_signature"));

        const result = await consentAction({ accept: true, oauthQuery });

        expect(result).toMatchObject({ ok: false, code: "error" });
        if (!result.ok) expect(result.message).not.toMatch(/signature/);
        expect(errorMock).toHaveBeenCalledWith("auth.oauth_consent_failed", {
            event: "auth.oauth_consent_failed",
        });
    });
});
