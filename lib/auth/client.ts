import { toWebSession, type WebSession } from "./web-session";
import { logoutAction } from "@/app/_actions/auth/logout";

export async function getSession(_options?: {
    broadcast?: boolean;
}): Promise<WebSession | null> {
    void _options;
    const response = await fetch("/api/auth/get-session", {
        cache: "no-store",
    });
    if (!response.ok) throw new Error("Session lookup failed");
    const session = await response.json();
    return session ? toWebSession(session) : null;
}

export async function signOut(_options?: {
    redirect?: boolean;
}): Promise<void> {
    void _options;
    await logoutAction(false);
}
