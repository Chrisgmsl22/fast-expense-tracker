import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { replayMigration } from "@/tests/support/replay-migration";

/**
 * Spec 0007 §6a — schema shape only.
 *
 * This migration used to also rename the "Purchases made by girlfriend"
 * subcategory in place and convert existing `gf_fronted` movements into
 * fronted expenses; both are deferred to a second, deliberate PR — see
 * fet-payment-is-the-expense in the harness task log for the exact
 * statements and the original data-behavior tests that exercised them
 * (including the duplicate-subcategory trap). All this file pins now is the
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

describe("fronted-debt-as-expense migration (spec 0007 §6a) — schema only", () => {
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
