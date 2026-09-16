import type { PrismaClient } from "@prisma/client";

/**
 * Every settlement-cycle close instant this user has filed, unordered.
 *
 * An expense carries no marker column — its cycle is its `createdAt` against
 * this sequence — so any repository that returns expense rows needs the same
 * set. One function, so the two adapters cannot answer the question differently.
 *
 * The query is deliberately dumb: no boundary comparison, no ordering, no
 * "nearest". WHICH close owns a row is decided by `cycleCloseAtOrAfter`, in pure
 * domain code that is unit-tested with plain Dates. The set is one row per
 * closed cycle, so reading all of them is cheaper than a per-row query.
 */
export async function getCycleCloses(
    db: PrismaClient,
    userId: string,
): Promise<Date[]> {
    const markers = await db.movement.findMany({
        where: { userId, closedAt: { not: null } },
        select: { closedAt: true },
    });
    return markers.map((m) => m.closedAt).filter((c): c is Date => c !== null);
}
