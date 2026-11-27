// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { answerConsentMock, errorMock, ExpiredMock, SessionMissingMock } =
    vi.hoisted(() => ({
        answerConsentMock: vi.fn(),
        errorMock: vi.fn(),
        ExpiredMock: class extends Error {},
        SessionMissingMock: class extends Error {},
    }));
vi.mock("@/lib/auth/oauth-query", () => ({
    OAuthRequestExpiredError: ExpiredMock,
}));
vi.mock("@/lib/auth/oauth-consent", () => ({
    answerConsent: answerConsentMock,
    ConsentSessionMissingError: SessionMissingMock,
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
import { setServerLocale } from "@/tests/support/intl";

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
            reason: "oauth_query_invalid",
            event: "auth.oauth_consent_failed",
        });
    });

    it.each([
        ["en", "This sign-in request expired. Start again from the app."],
        [
            "es",
            "Esta solicitud de inicio de sesión venció. Vuelve a empezar desde la app.",
        ],
    ] as const)(
        "guard: explains an expired signed query in %s",
        async (locale, message) => {
            setServerLocale(locale);
            answerConsentMock.mockRejectedValue(new ExpiredMock());

            expect(await consentAction({ accept: true, oauthQuery })).toEqual({
                ok: false,
                code: "expired",
                message,
            });
            expect(errorMock).toHaveBeenCalledWith(
                "auth.oauth_consent_failed",
                {
                    reason: "oauth_query_invalid",
                    event: "auth.oauth_consent_failed",
                },
            );
        },
    );

    it("guard: tags a missing session", async () => {
        answerConsentMock.mockRejectedValue(new SessionMissingMock());

        expect(await consentAction({ accept: true, oauthQuery })).toMatchObject(
            { ok: false, code: "error" },
        );
        expect(errorMock).toHaveBeenCalledWith("auth.oauth_consent_failed", {
            reason: "session_missing",
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
