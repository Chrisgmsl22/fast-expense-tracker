import { headers } from "next/headers";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { authProvider } from "@/auth";
import { OAuthRequestExpiredError } from "@/lib/auth/oauth-query";
import { failureAttributes } from "@/lib/observability/health";
import { logAppEvent, type AppLogReason } from "@/lib/observability/log";

export type ConsentRequest = { clientName: string; scopes: string[] };

/** The user is not signed in, so the provider refused the consent call. */
export class ConsentSessionMissingError extends Error {}

/** A provider refusal the consent page answers itself; `undefined` otherwise. */
function refusalReason(error: unknown): AppLogReason | undefined {
    if (!(error instanceof Error) || error.name !== "APIError") return;
    const { status, body } = error as Error & {
        status?: unknown;
        body?: { error?: unknown };
    };
    if (status === "UNAUTHORIZED") return "session_missing";
    if (status === "NOT_FOUND" || body?.error === "invalid_signature")
        return "oauth_query_invalid";
}

/** The client and scopes to show, or `null` for an unsigned, stale or unknown request. */
export async function loadConsentRequest(
    oauthQuery: string,
): Promise<ConsentRequest | null> {
    const { secret } = await authProvider.$context;
    const clientId = new URLSearchParams(oauthQuery).get("client_id");
    if (!clientId || !(await verifyOAuthQueryParams(oauthQuery, secret))) {
        logAppEvent("auth.oauth_consent_failed", {
            reason: "oauth_query_invalid",
        });
        return null;
    }
    try {
        const client = await authProvider.api.getOAuthClientPublic({
            query: { client_id: clientId },
            headers: await headers(),
        });
        return {
            clientName: client.client_name ?? clientId,
            scopes: (new URLSearchParams(oauthQuery).get("scope") ?? "")
                .split(" ")
                .filter(Boolean),
        };
    } catch (error) {
        const reason = refusalReason(error);
        if (reason) {
            logAppEvent("auth.oauth_consent_failed", { reason });
            return null;
        }
        logAppEvent("auth.oauth_consent_failed", failureAttributes(error));
        throw error;
    }
}

/** Records the user's answer and returns the URL the browser goes to next. */
export async function answerConsent(
    accept: boolean,
    oauthQuery: string,
): Promise<string> {
    try {
        const { url } = await authProvider.api.oauth2Consent({
            headers: await headers(),
            body: { accept, oauth_query: oauthQuery },
        });
        return url;
    } catch (error) {
        const reason = refusalReason(error);
        if (reason === "oauth_query_invalid")
            throw new OAuthRequestExpiredError();
        if (reason === "session_missing")
            throw new ConsentSessionMissingError();
        throw error;
    }
}
