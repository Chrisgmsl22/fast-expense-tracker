"use server";

import { renewSession } from "@/lib/auth/renew-session";
import type { WebSession } from "@/lib/auth/web-session";

export async function renewIdleSessionAction(
    idleSessionId: string,
    idleForMs: number,
): Promise<WebSession | null> {
    return renewSession(idleSessionId, idleForMs);
}
