import { headers } from "next/headers";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { authProvider } from "@/auth";

export type ConsentRequest = { clientName: string; scopes: string[] };

/** The client and scopes to show, or `null` for an unsigned or stale query. */
export async function loadConsentRequest(
    oauthQuery: string,
): Promise<ConsentRequest | null> {
    const { secret } = await authProvider.$context;
    if (!(await verifyOAuthQueryParams(oauthQuery, secret))) return null;
    const query = new URLSearchParams(oauthQuery);
    const clientId = query.get("client_id");
    if (!clientId) return null;
    const client = await authProvider.api
        .getOAuthClientPublic({
            query: { client_id: clientId },
            headers: await headers(),
        })
        .catch(() => null);
    if (!client) return null;
    return {
        clientName: client.client_name ?? clientId,
        scopes: (query.get("scope") ?? "").split(" ").filter(Boolean),
    };
}

/** Records the user's answer and returns the URL the browser goes to next. */
export async function answerConsent(
    accept: boolean,
    oauthQuery: string,
): Promise<string> {
    const { url } = await authProvider.api.oauth2Consent({
        headers: await headers(),
        body: { accept, oauth_query: oauthQuery },
    });
    return url;
}
