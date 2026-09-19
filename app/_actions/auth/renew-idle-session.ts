"use server";

import type { Session } from "next-auth";
import { unstable_update } from "@/auth";
import { isIdleElapsed } from "@/lib/auth/idle-session";

export async function renewIdleSessionAction(
    idleSessionId: string,
    idleForMs: number,
): Promise<Session | null> {
    if (
        typeof idleSessionId !== "string" ||
        !idleSessionId ||
        !isIdleElapsed(idleForMs)
    )
        return null;
    const activity = { idleActivity: true, idleSessionId, idleForMs };
    return unstable_update(activity);
}
