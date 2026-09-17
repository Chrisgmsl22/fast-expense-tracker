import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { replayMigration } from "@/tests/support/replay-migration";

/**
 * Spec 0007 §6b — schema shape only: the column exists under its final name, and a
 * replay of the guarded rename is safe. The data conversion is deferred to its own PR.
 * `isFronted` is not asserted absent — the integration suite shares one database.
 */
const MIGRATION = "20260916210000_payment_is_the_expense";

async function expenseColumnNames(): Promise<string[]> {
    const rows = await db.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'Expense'`,
    );
    return rows.map((r) => r.column_name);
}

describe("payment-is-the-expense migration (spec 0007 §6b) — schema only", () => {
    it("leaves isPartnerPayment in place after a replay", async () => {
        await replayMigration(MIGRATION);

        expect(await expenseColumnNames()).toContain("isPartnerPayment");
    });

    it("is a no-op on a second replay", async () => {
        await replayMigration(MIGRATION);
        await replayMigration(MIGRATION);

        expect(await expenseColumnNames()).toContain("isPartnerPayment");
    });
});
