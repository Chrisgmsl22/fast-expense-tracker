export function passiveSessionResponse(response: Response): Response {
    const headers = new Headers(response.headers);
    const cookies = headers.getSetCookie();
    headers.delete("set-cookie");
    for (const cookie of cookies) {
        if (!/^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/.test(cookie)) {
            headers.append("set-cookie", cookie);
        }
    }
    // A delayed read must not restore an old deadline or delete a newer login.
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}
