// @vitest-environment node
import { describe, expect, it } from "vitest";

import { getSettlement } from "@/lib/services/settlement/settlement.service";
import type {
    SettlementExpenseRow,
    SettlementMovementRow,
} from "@/lib/repositories/settlement.repository";
import { FakeSettlementRepository } from "@/tests/support/fake-settlement-repository";

// now = mid-July → window is June + July; May is outside it.
const NOW = new Date("2026-07-15T12:00:00Z");
const JULY = new Date("2026-07-10T06:00:00Z");
const JUNE = new Date("2026-06-20T06:00:00Z");
const MAY = new Date("2026-05-20T06:00:00Z");

const expense = (
    over: Partial<SettlementExpenseRow> = {},
): SettlementExpenseRow => ({
    id: "e1",
    date: JULY,
    description: "Groceries",
    amount: 1000,
    actualExpenditure: 680,
    isShared: true,
    paidBy: "you",
    ...over,
});

const movement = (
    over: Partial<SettlementMovementRow> = {},
): SettlementMovementRow => ({
    id: "m1",
    date: JULY,
    amount: 100,
    type: "gf_paid",
    fundedByPartner: false,
    ...over,
});

function run(
    expenses: SettlementExpenseRow[],
    movements: SettlementMovementRow[] = [],
) {
    const repo = new FakeSettlementRepository();
    repo.setExpenses(expenses);
    repo.setMovements(movements);
    return getSettlement("u1", { settlementRepo: repo, now: NOW });
}

describe("getSettlement", () => {
    it("she owes you her 32% share of a shared expense you paid", async () => {
        const s = await run([expense()]);
        expect(s.balance.direction).toBe("she_owes");
        expect(s.balance.amount).toBe(320);
        expect(s.journal).toHaveLength(1);
        const row = s.journal[0]!;
        expect(row.kind).toBe("your_expense");
        if (row.kind === "your_expense") expect(row.partnerShare).toBe(320);
    });

    it("nets a logged debt and a transfer to zero", async () => {
        // she owes 320 (your shared), you owe 300 (gf debt), she paid 20 → 0
        const s = await run(
            [
                expense(),
                expense({
                    id: "e2",
                    amount: 300,
                    actualExpenditure: 300,
                    isShared: false,
                    paidBy: "gf",
                    description: "I owe Brenda",
                }),
            ],
            [movement({ id: "m2", type: "gf_received", amount: 20 })],
        );
        expect(s.balance.direction).toBe("settled");
        expect(s.balance.amount).toBe(0);
        expect(s.journal).toHaveLength(3);
    });

    it("a Brenda-funded card payment draws down the balance and shows as a journal row", async () => {
        const s = await run(
            [expense()], // she owes 320
            [
                movement({
                    id: "m3",
                    type: "card_payment",
                    amount: 320,
                    fundedByPartner: true,
                }),
            ],
        );
        expect(s.balance.direction).toBe("settled");
        expect(s.journal).toHaveLength(2); // the expense + the funded card payment
        expect(s.journal.some((j) => j.kind === "funded_card_payment")).toBe(
            true,
        );
    });

    it("a plain (own-money) card payment is not a journal row", async () => {
        const s = await run(
            [expense()],
            [movement({ id: "m4", type: "card_payment", amount: 320 })],
        );
        expect(s.journal).toHaveLength(1); // only the expense
        expect(s.journal.some((j) => j.kind === "funded_card_payment")).toBe(
            false,
        );
    });

    it("a normal (own-money) card payment does not touch the balance", async () => {
        const s = await run(
            [expense()],
            [movement({ id: "m4", type: "card_payment", amount: 320 })],
        );
        expect(s.balance.amount).toBe(320);
        expect(s.balance.direction).toBe("she_owes");
    });

    it("flags carried-over previous-month debt and its amount", async () => {
        const s = await run([
            expense({ id: "eJun", date: JUNE }), // June: partner 320
            expense({ id: "eJul", date: JULY }), // July: partner 320
        ]);
        expect(s.balance.amount).toBe(640);
        expect(s.carriedOver).toEqual({ present: true, amount: 320 });
        const june = s.journal.find((j) => j.id === "eJun")!;
        const july = s.journal.find((j) => j.id === "eJul")!;
        expect(june.carriedOver).toBe(true);
        expect(july.carriedOver).toBe(false);
    });

    it("excludes rows older than the previous month (May, outside the window)", async () => {
        const s = await run([
            expense({
                id: "eMay",
                date: MAY,
                amount: 9999,
                actualExpenditure: 0,
            }),
            expense({ id: "eJul", date: JULY }),
        ]);
        expect(s.balance.amount).toBe(320); // May's 9999 ignored
        expect(s.journal.map((j) => j.id)).toEqual(["eJul"]);
    });

    it("no carried-over note when the previous month is empty", async () => {
        const s = await run([expense({ date: JULY })]);
        expect(s.carriedOver.present).toBe(false);
    });

    it("orders the journal newest first", async () => {
        const s = await run([
            expense({ id: "eJun", date: JUNE }),
            expense({ id: "eJul", date: JULY }),
        ]);
        expect(s.journal.map((j) => j.id)).toEqual(["eJul", "eJun"]);
    });
});
