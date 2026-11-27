/**
 * The signed authorization query the OAuth provider appends to `/login` and
 * `/consent`, rebuilt from Next's search params. `undefined` when the URL
 * carries no signature, so a plain visit keeps today's behavior.
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
