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
