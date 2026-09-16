import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { replayMigration } from "@/tests/support/replay-migration";

/**
 * The partner-money marker column — schema shape only.
 *
 * The migration (and this file) are named for spec 0007 §6a decision 1, which
 * §6b REVERSED: a debt is settlement-only, and the payment you send the partner
 * is the expense. The column survived the reversal, only its meaning changed, so
 * what this file pins is unaffected. Prisma's checksum freezes both names.
 *
 * This migration used to also rename the "Purchases made by girlfriend"
 * subcategory in place and convert existing `gf_fronted` movements into
 * expenses; both are deferred to a second, deliberate PR (CHORE-12), so that a
 * production data rewrite is reviewed and released on its own. The
 * duplicate-subcategory trap the rename would have sprung is covered instead
 * by the seed test in `tests/unit/seed.test.ts`, which pins that the seeded
 * name still matches what live rows hold. All this file pins now is the
 * marker column the deployed code reads: it exists, defaults to false, and
 * a replay is idempotent.
 */
const MIGRATION = "20260914210000_fronted_debt_as_expense";

async function expenseColumnNames(): Promise<string[]> {
    const rows = await db.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'Expense'`,
    );
    return rows.map((r) => r.column_name);
}

describe("partner-money marker migration (spec 0007 §6b governs) — schema only", () => {
    it("adds the isFronted marker column", async () => {
        await replayMigration(MIGRATION);

        expect(await expenseColumnNames()).toContain("isFronted");
    });

    it("is idempotent on a second replay", async () => {
        await replayMigration(MIGRATION);
        await replayMigration(MIGRATION);

        expect(await expenseColumnNames()).toContain("isFronted");
    });
});
