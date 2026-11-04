import { cookies, headers } from "next/headers";
import { getCookies } from "better-auth/cookies";
import { authProvider } from "@/auth";
import { authConfig } from "@/auth.config";
import { authSessionRepository } from "@/lib/repositories";
import { isIdleElapsed } from "./idle-session";
import { toWebSession, type WebSession } from "./web-session";

export async function renewSession(
    id: string,
    idleForMs: number,
): Promise<WebSession | null> {
    if (typeof id !== "string" || !id || !isIdleElapsed(idleForMs)) return null;
    const current = await authProvider.api.getSession({
        headers: await headers(),
    });
    if (!current || current.session.id !== id) return null;
    const cookie = getCookies(authConfig).sessionToken;
    const store = await cookies();
    const signedToken = store.get(cookie.name)?.value;
    if (!signedToken) return null;
    const expiresAt = await authSessionRepository.renew(
        {
            id,
            token: current.session.token,
            userId: current.user.id,
        },
        idleForMs,
    );
    if (!expiresAt) return null;
    store.set(cookie.name, signedToken, {
        ...cookie.attributes,
        sameSite: "lax",
        maxAge: Math.max(
            0,
            Math.ceil((expiresAt.getTime() - Date.now()) / 1000),
        ),
        expires: expiresAt,
    });
    return toWebSession({
        ...current,
        session: { ...current.session, expiresAt },
    });
}
