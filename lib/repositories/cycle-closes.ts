import type { PrismaClient } from "@prisma/client";

/**
 * Every settlement-cycle close instant this user has filed, unordered. The marker
 * lives on a transfer OR on the payment-expense that squared the cycle (spec 0007
 * §6b), so both tables are read. WHICH close owns a row is decided by
 * `cycleCloseAtOrAfter`, in pure domain code.
 */
export async function getCycleCloses(
    db: PrismaClient,
    userId: string,
): Promise<Date[]> {
    const [movements, expenses] = await Promise.all([
        db.movement.findMany({
            where: { userId, closedAt: { not: null } },
            select: { closedAt: true },
        }),
        db.expense.findMany({
            where: { userId, closedAt: { not: null } },
            select: { closedAt: true },
        }),
    ]);
    return [...movements, ...expenses]
        .map((m) => m.closedAt)
        .filter((c): c is Date => c !== null);
}
