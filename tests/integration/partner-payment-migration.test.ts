import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { replayMigration } from "@/tests/support/replay-migration";

/**
 * Spec 0007 §6b — schema shape only.
 *
 * This migration used to also convert data (debts back to movements,
 * `gf_paid` movements into payment-expenses); that conversion is deferred to
 * a second, deliberate PR — see fet-payment-is-the-expense in the harness
 * task log for the exact statements and the original data-behavior tests
 * that exercised them. All this file pins now is the one thing the deployed
 * code actually needs: the column exists under its final name, and a replay
 * of the guarded rename is safe.
 *
 * This does not assert `isFronted` is absent: the integration suite shares
 * one long-lived database across files (truncation resets rows, not
 * columns), and a sibling file's replay of the earlier
 * `fronted_debt_as_expense` migration can legitimately re-add that column
 * via its own unconditional `ADD COLUMN IF NOT EXISTS`. That column's
 * presence or absence is that file's concern, not this one's.
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
