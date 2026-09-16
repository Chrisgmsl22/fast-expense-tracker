import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { replayMigration } from "@/tests/support/replay-migration";

/**
 * The partner-money marker column — schema shape only. The in-place subcategory
 * rename and the data conversion this migration once carried are deferred to their
 * own PR; `tests/unit/seed.test.ts` covers the duplicate-subcategory trap instead.
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
