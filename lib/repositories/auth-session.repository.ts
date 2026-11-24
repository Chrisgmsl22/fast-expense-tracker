import type { PrismaClient } from "@prisma/client";

export interface AuthSessionRepository {
    renew(
        identity: { id: string; token: string; userId: string },
        idleForMs: number,
    ): Promise<Date | null>;
}

export class PrismaAuthSessionRepository implements AuthSessionRepository {
    private readonly db: PrismaClient;
    constructor(db: PrismaClient) {
        this.db = db;
    }

    async renew(
        identity: { id: string; token: string; userId: string },
        idleForMs: number,
    ): Promise<Date | null> {
        const rows = await this.db.$queryRaw<{ expiresAt: Date }[]>`
            UPDATE "session"
            SET "expiresAt" = GREATEST("expiresAt", clock_timestamp() + (1800000 - ${idleForMs}) * interval '1 millisecond'),
                "updatedAt" = clock_timestamp()
            WHERE "id" = ${identity.id} AND "token" = ${identity.token}
                AND "userId" = ${identity.userId} AND "expiresAt" > clock_timestamp()
            RETURNING "expiresAt"
        `;
        return rows[0]?.expiresAt ?? null;
    }
}
