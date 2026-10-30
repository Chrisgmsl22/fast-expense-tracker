import { auth } from "@/auth";

export interface SessionContext {
    userId: string;
    name?: string | null;
    email?: string | null;
    idleExpiresAt?: number;
    idleSessionId?: string;
}

export async function getSessionUserId(): Promise<string | null> {
    const session = await auth();
    return session?.user?.id || null;
}

export async function getSessionContext(): Promise<SessionContext | null> {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return null;

    return {
        userId,
        name: session.user.name,
        email: session.user.email,
        idleExpiresAt: session.idleExpiresAt,
        idleSessionId: session.idleSessionId,
    };
}
