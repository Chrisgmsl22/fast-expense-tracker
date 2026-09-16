// @vitest-environment node
import { describe, expect, it } from "vitest";

import { getSettlement } from "@/lib/services/settlement/settlement.service";
import type {
    SettlementExpenseRow,
    SettlementMovementRow,
} from "@/lib/repositories/settlement.repository";
import { FakeSettlementRepository } from "@/tests/support/fake-settlement-repository";
import { FakeSettingsRepository } from "@/tests/support/fake-settings-repository";

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
    ...over,
});

const movement = (
    over: Partial<SettlementMovementRow> = {},
): SettlementMovementRow => ({
    id: "m1",
    date: JULY,
    amount: 100,
    type: "gf_paid",
    note: null,
    fundedFrom: "income",
    ...over,
});

function run(
    expenses: SettlementExpenseRow[],
    movements: SettlementMovementRow[] = [],
) {
    const repo = new FakeSettlementRepository();
    repo.setExpenses(expenses);
    repo.setMovements(movements);
    const settingsRepo = new FakeSettingsRepository();
    settingsRepo.seed("u1", { sharesExpenses: true, partnerName: "Brenda" });
    return getSettlement("u1", {
        settlementRepo: repo,
        settingsRepo,
        now: NOW,
    });
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
        // she owes 320 (your shared), you owe 300 (gf_fronted debt), she paid 20 → 0
        const s = await run(
            [expense()],
            [
                movement({
                    id: "mdebt",
                    type: "gf_fronted",
                    amount: 300,
                    note: "I owe Brenda",
                }),
                movement({ id: "m2", type: "gf_received", amount: 20 }),
            ],
        );
        expect(s.balance.direction).toBe("settled");
        expect(s.balance.amount).toBe(0);
        expect(s.journal).toHaveLength(3);
        const debt = s.journal.find((j) => j.kind === "partner_debt");
        expect(debt).toBeDefined();
        if (debt?.kind === "partner_debt") {
            expect(debt.amount).toBe(300);
            expect(debt.description).toBe("I owe Brenda");
        }
    });

    it("money Brenda sent you (gf_received) draws the balance down and shows as a transfer", async () => {
        const s = await run(
            [expense()], // she owes 320
            [movement({ id: "m3", type: "gf_received", amount: 320 })],
        );
        expect(s.balance.direction).toBe("settled");
        expect(s.journal).toHaveLength(2); // the expense + the transfer
        expect(s.journal.some((j) => j.kind === "transfer")).toBe(true);
    });

    describe("the funding source never moves the balance (spec 0007 §6a)", () => {
        // The two ledgers are separate: paying her from savings really did reach
        // her, so it reduces what you owe in full. Filtering here too is the easy mistake.
        const transfer = (fundedFrom: "income" | "savings") =>
            movement({ id: "mt", type: "gf_paid", amount: 300, fundedFrom });

        /** You owe her 500; the transfer pays 300 of it, whatever funded it. */
        const debt = movement({
            id: "mdebt",
            type: "gf_fronted",
            amount: 500,
        });

        it("gives a savings-funded transfer the same balance as an income-funded one", async () => {
            const fromIncome = await run([], [debt, transfer("income")]);
            const fromSavings = await run([], [debt, transfer("savings")]);

            expect(fromSavings.balance).toEqual(fromIncome.balance);
            // And the figure is the real one: 500 owed − 300 sent.
            expect(fromSavings.balance.direction).toBe("you_owe");
            expect(fromSavings.balance.amount).toBe(200);
        });

        it("settles a debt to zero when paid entirely from savings", async () => {
            const s = await run(
                [],
                [
                    debt,
                    movement({
                        id: "mt",
                        type: "gf_paid",
                        amount: 500,
                        fundedFrom: "savings",
                    }),
                ],
            );
            expect(s.balance.direction).toBe("settled");
            expect(s.balance.amount).toBe(0);
        });

        it("carries the source onto the journal row so an edit can't reset it", async () => {
            const s = await run([], [transfer("savings")]);
            const row = s.journal.find((j) => j.kind === "transfer");
            expect(row).toBeDefined();
            if (row?.kind === "transfer")
                expect(row.fundedFrom).toBe("savings");
        });
    });

    it("a card payment is never a journal row (ADR-0020)", async () => {
        const s = await run(
            [expense()],
            [movement({ id: "m4", type: "card_payment", amount: 320 })],
        );
        expect(s.journal).toHaveLength(1); // only the expense
        expect(s.journal[0]!.kind).toBe("your_expense");
    });

    it("a card payment does not touch the balance", async () => {
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
