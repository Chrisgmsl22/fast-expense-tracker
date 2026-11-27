/** The signed OAuth query on `/login` or `/consent` is stale or tampered. */
export class OAuthRequestExpiredError extends Error {}

/**
 * The provider's signed query on `/login` and `/consent`, rebuilt from search
 * params; `undefined` without a signature, so a plain visit is unchanged.
 */
export function signedOAuthQuery(
    params: Record<string, string | string[] | undefined>,
): string | undefined {
    if (!params.sig || !params.client_id) return undefined;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        for (const item of [value ?? []].flat()) query.append(key, item);
    }
    return query.toString();
}

/** The provider refused the signed query (expired, tampered or missing). */
export async function isInvalidOAuthQuery(response: Response) {
    if (response.status !== 400) return false;
    const body: unknown = await response
        .clone()
        .json()
        .catch(() => null);
    return (
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        body.error === "invalid_signature"
    );
}

/** The `url` of a provider `{ redirect, url }` JSON body, if it has one. */
export function redirectUrlOf(body: unknown): string | undefined {
    return typeof body === "object" &&
        body !== null &&
        "url" in body &&
        typeof body.url === "string"
        ? body.url
        : undefined;
}
