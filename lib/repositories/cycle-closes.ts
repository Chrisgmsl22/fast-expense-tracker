import type { Prisma, PrismaClient } from "@prisma/client";

/** The one predicate that defines a cycle-close marker row. */
export const cycleCloseWhere = (userId: string): Prisma.MovementWhereInput => ({
    userId,
    closedAt: { not: null },
});

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
        where: cycleCloseWhere(userId),
        select: { closedAt: true },
    });
    return markers.map((m) => m.closedAt).filter((c): c is Date => c !== null);
}
