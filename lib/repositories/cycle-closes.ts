import type { PrismaClient } from "@prisma/client";

/**
 * Every settlement-cycle close instant this user has filed, unordered. An expense
 * carries no marker column, so both adapters need the same set. WHICH close owns a
 * row is decided by `cycleCloseAtOrAfter`, in pure domain code.
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
