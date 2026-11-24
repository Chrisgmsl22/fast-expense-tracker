export interface WebSession {
    user: { id: string; name: string; email: string };
    idleExpiresAt: number;
    idleSessionId: string;
    expires: string;
}

export function toWebSession(value: {
    user: { id: string; name: string; email: string };
    session: { id: string; expiresAt: Date | string };
}): WebSession {
    const expiry = new Date(value.session.expiresAt);
    return {
        user: {
            id: value.user.id,
            name: value.user.name,
            email: value.user.email,
        },
        idleSessionId: value.session.id,
        idleExpiresAt: expiry.getTime(),
        expires: expiry.toISOString(),
    };
}
