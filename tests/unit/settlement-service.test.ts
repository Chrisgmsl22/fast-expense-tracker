// @vitest-environment node
import { describe, expect, it } from "vitest";

import { computeActualExpenditure } from "@/lib/domain/expense";
import { getSettlement } from "@/lib/services/settlement/settlement.service";
import type { SettlementJournalItem } from "@/lib/services/settlement/settlement.service";
import type {
    SettlementCycleMarker,
    SettlementExpenseRow,
    SettlementMovementRow,
} from "@/lib/repositories/settlement.repository";
import { FakeSettlementRepository } from "@/tests/support/fake-settlement-repository";
import { FakeSettingsRepository } from "@/tests/support/fake-settings-repository";

// now = mid-July. The balance window is the OPEN CYCLE (spec 0007 §3.5), not a
// month range, so age alone never drops a row; July is the calendar month the
// Month view shows.
const NOW = new Date("2026-07-15T12:00:00Z");
const JULY = new Date("2026-07-10T06:00:00Z");
const JUNE = new Date("2026-06-20T06:00:00Z");
const MAY = new Date("2026-05-20T06:00:00Z");
const FEBRUARY = new Date("2026-02-10T06:00:00Z");

// Entry time defaults to the row's own date — the ordinary case, where a row is
// logged the day it happened. The cycle tests below set the two apart on
// purpose, which is exactly the distinction membership turns on.
const expense = (
    over: Partial<SettlementExpenseRow> = {},
): SettlementExpenseRow => {
    const date = over.date ?? JULY;
    return {
        id: "e1",
        date,
        description: "Groceries",
        amount: 1000,
        actualExpenditure: 680,
        isShared: true,
        isFronted: false,
        createdAt: date,
        ...over,
    };
};

const movement = (
    over: Partial<SettlementMovementRow> = {},
): SettlementMovementRow => {
    const date = over.date ?? JULY;
    return {
        id: "m1",
        date,
        amount: 100,
        type: "gf_paid",
        note: null,
        createdAt: date,
        closedAt: null,
        ...over,
    };
};

function run(
    expenses: SettlementExpenseRow[],
    movements: SettlementMovementRow[] = [],
    markers: SettlementCycleMarker[] = [],
    /** The month the reader is viewing; omitted means "the current one". */
    month?: string,
) {
    const repo = new FakeSettlementRepository();
    repo.setExpenses(expenses);
    repo.setMovements(movements);
    repo.setMarkers(markers);
    const settingsRepo = new FakeSettingsRepository();
    settingsRepo.seed("u1", { sharesExpenses: true, partnerName: "Brenda" });
    return getSettlement(
        "u1",
        { settlementRepo: repo, settingsRepo, now: NOW },
        { month },
    );
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

    // Spec 0007 §6a: a debt she fronted is an `Expense{isFronted:true}` now, so
    // the debt side of the balance is read off an expense rather than a
    // movement. The money is identical — same $300, same line, same journal row
    // — which is why this reads exactly like the legacy case below it.
    it("reads a fronted expense as the debt side of the balance", async () => {
        const s = await run([
            expense(),
            expense({
                id: "efronted",
                description: "I owe Brenda",
                isFronted: true,
                amount: 300,
                actualExpenditure: 300,
                isShared: false,
            }),
        ]);

        // she owes 320 (your shared), you owe 300 (fronted) → she owes 20
        expect(s.balance.direction).toBe("she_owes");
        expect(s.balance.amount).toBe(20);
        const debt = s.journal.find((j) => j.kind === "partner_debt");
        expect(debt).toBeDefined();
        if (debt?.kind === "partner_debt") {
            expect(debt.amount).toBe(300);
            expect(debt.description).toBe("I owe Brenda");
        }
        expect(s.breakdownItems.your_debt).toHaveLength(1);
        const debtRow = s.journal.find((j) => j.kind === "partner_debt");
        if (debtRow?.kind === "partner_debt") {
            expect(debtRow.source).toBe("expense");
        }
    });

    it("never counts a fronted expense on the partner-share line as well", async () => {
        // An edit through the ordinary expense form could leave `amount` and
        // `actualExpenditure` apart on a fronted row. It must still land on ONE
        // line: the partner does not owe a share of a debt he owes her.
        const s = await run([
            expense({
                id: "efronted",
                isFronted: true,
                amount: 1000,
                actualExpenditure: 680,
                isShared: true,
            }),
        ]);

        expect(s.breakdownItems.your_debt).toHaveLength(1);
        expect(s.breakdownItems.your_debt[0]!.amount).toBe(680);
        expect(s.breakdownItems.partner_share).toHaveLength(0);
        expect(s.balance.direction).toBe("you_owe");
        expect(s.balance.amount).toBe(680);
    });

    it("counts a converted debt once, even if its old movement survives", async () => {
        // The conversion migration reuses the movement's id for the expense, and
        // deletes the movement in the same transaction — so a twin should never
        // exist. A partial restore or a replay against a half-migrated copy
        // could still produce one, and a silently doubled IOU is the kind of
        // error nobody catches until they pay it.
        const s = await run(
            [
                expense({
                    id: "shared",
                    isFronted: true,
                    amount: 300,
                    actualExpenditure: 300,
                    isShared: false,
                    description: "I owe Brenda",
                }),
            ],
            [movement({ id: "shared", type: "gf_fronted", amount: 300 })],
        );

        expect(s.balance.direction).toBe("you_owe");
        expect(s.balance.amount).toBe(300);
        expect(s.breakdownItems.your_debt).toHaveLength(1);
    });

    it("still nets a LEGACY gf_fronted movement and a transfer to zero", async () => {
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
            // The journal edits and deletes the two debt shapes through
            // different actions, so the row says which table it came from.
            expect(debt.source).toBe("movement");
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

    it("keeps an unsettled row older than two months in the balance", async () => {
        // The old current+previous-month window dropped February silently; the
        // open cycle has no age limit, so both shares count (320 + 320).
        const s = await run([
            expense({ id: "eFeb", date: FEBRUARY }),
            expense({ id: "eJul", date: JULY }),
        ]);
        expect(s.balance.amount).toBe(640);
        expect(s.journal.map((j) => j.id)).toEqual(["eJul", "eFeb"]);
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

// The user confirmed the close on July 12; anything ENTERED after that instant
// is in the open cycle. The closing transfer was entered earlier, on July 11 —
// the boundary is the close, not that transfer's entry time.
const CLOSED_AT = new Date("2026-07-12T00:00:00Z");
const ENTERED_AFTER_CLOSE = new Date("2026-07-14T00:00:00Z");
const ENTERED_BEFORE_CLOSE = new Date("2026-07-11T00:00:00Z");
const closingTransfer = movement({
    id: "mClose",
    type: "gf_received",
    amount: 320,
    date: JULY,
    createdAt: ENTERED_BEFORE_CLOSE,
});
const marker: SettlementCycleMarker = {
    id: "mClose",
    date: JULY,
    closedAt: CLOSED_AT,
    amount: 320,
};

describe("getSettlement — settlement cycles", () => {
    it("with no close ever, everything is one open cycle", async () => {
        const s = await run([expense({ date: FEBRUARY })]);
        expect(s.openedAt).toBeNull();
        expect(s.history).toEqual([]);
        expect(s.balance.amount).toBe(320);
    });

    it("a late expense DATED before the close joins the open cycle", async () => {
        // Dated in May — inside the closed cycle's calendar span — but entered
        // after the close, so membership by entry time puts it in the open one.
        // Comparing dates instead would wrongly bury it in the closed cycle.
        const s = await run(
            [
                expense({
                    id: "eLate",
                    date: MAY,
                    createdAt: ENTERED_AFTER_CLOSE,
                }),
            ],
            [closingTransfer],
            [marker],
        );
        expect(s.openedAt).toEqual(CLOSED_AT);
        expect(s.balance.amount).toBe(320);
        expect(s.journal.map((j) => j.id)).toEqual(["eLate"]);
    });

    it("the closed cycle keeps its own rows, and the open balance excludes them", async () => {
        const s = await run(
            [
                expense({
                    id: "eOld",
                    date: JUNE,
                    createdAt: ENTERED_BEFORE_CLOSE,
                }),
            ],
            [closingTransfer],
            [marker],
        );
        // Closed: the June expense (+320) and the transfer that settled it.
        expect(s.balance.amount).toBe(0);
        expect(s.journal).toEqual([]);
        expect(s.history).toHaveLength(1);
        expect(s.history[0]!.settledAmount).toBe(320);
        expect(s.history[0]!.journal.map((j) => j.id).sort()).toEqual([
            "eOld",
            "mClose",
        ]);
    });

    it("splits two closed cycles by their own markers, newest first", async () => {
        // Both closes happen in the viewed month (July), so History lists both
        // and the assertion is about partitioning, not month scoping.
        const firstClose = new Date("2026-07-05T00:00:00Z");
        const s = await run(
            [
                expense({
                    id: "eCycle1",
                    date: JUNE,
                    createdAt: new Date("2026-06-05T00:00:00Z"),
                }),
                expense({
                    id: "eCycle2",
                    date: JULY,
                    createdAt: ENTERED_BEFORE_CLOSE,
                }),
            ],
            [
                movement({
                    id: "mClose1",
                    type: "gf_received",
                    amount: 320,
                    date: JUNE,
                    createdAt: firstClose,
                }),
                closingTransfer,
            ],
            [
                {
                    id: "mClose1",
                    date: JUNE,
                    closedAt: firstClose,
                    amount: 320,
                },
                marker,
            ],
        );
        expect(s.history.map((c) => c.id)).toEqual(["mClose", "mClose1"]);
        expect(s.history[0]!.journal.map((j) => j.id).sort()).toEqual([
            "eCycle2",
            "mClose",
        ]);
        expect(s.history[1]!.journal.map((j) => j.id).sort()).toEqual([
            "eCycle1",
            "mClose1",
        ]);
    });

    it("summarises a closed cycle from the rows it shows", async () => {
        // In the cycle: a $1,000 shared expense (her share $320), a $220 debt
        // you owe her, and the $320 transfer she sent that closed it.
        const s = await run(
            [
                expense({
                    id: "eShared",
                    createdAt: ENTERED_BEFORE_CLOSE,
                    amount: 1000,
                    actualExpenditure: 680,
                }),
            ],
            [
                movement({
                    id: "mDebt",
                    type: "gf_fronted",
                    amount: 220,
                    createdAt: ENTERED_BEFORE_CLOSE,
                }),
                closingTransfer,
            ],
            [marker],
        );

        const { summary } = s.history[0]!;
        // Unsplit: the FULL $1,000, not the $320 share, plus the $220 debt.
        expect(summary.spentUnsplit).toBe(1220);
        expect(summary.youOwed).toBe(220);
        expect(summary.sheOwed).toBe(320);
        expect(summary.outcome).toEqual({ kind: "partner_paid", amount: 320 });
    });

    it("reports an even cycle rather than a bare zero", async () => {
        const s = await run([], [], [marker]);
        expect(s.history[0]!.summary.outcome).toEqual({ kind: "even" });
    });

    it("the summary reconciles with the rows above it", async () => {
        const s = await run(
            [
                expense({
                    id: "eShared",
                    createdAt: ENTERED_BEFORE_CLOSE,
                    amount: 1000,
                    actualExpenditure: 680,
                }),
            ],
            [closingTransfer],
            [marker],
        );
        const cycle = s.history[0]!;
        // Σ of the partner-share rows the journal renders === the footer figure.
        const fromRows = cycle.journal.reduce(
            (total, j) =>
                j.kind === "your_expense" ? total + j.partnerShare : total,
            0,
        );
        expect(fromRows).toBe(cycle.summary.sheOwed);
    });

    it("names the newest transfer in the open cycle as the one a close would mark", async () => {
        const s = await run(
            [expense()],
            [
                movement({
                    id: "mOld",
                    type: "gf_received",
                    amount: 100,
                    createdAt: new Date("2026-07-13T00:00:00Z"),
                }),
                movement({
                    id: "mNew",
                    type: "gf_received",
                    amount: 220,
                    createdAt: ENTERED_AFTER_CLOSE,
                }),
            ],
        );
        expect(s.balance.direction).toBe("settled");
        expect(s.closableMovementId).toBe("mNew");
    });

    it("has nothing to close when the open cycle holds no transfer", async () => {
        const s = await run([expense()]);
        expect(s.closableMovementId).toBeNull();
    });

    it("scopes the Month view to the month being viewed", async () => {
        const s = await run(
            [
                expense({ id: "eJun", date: JUNE }),
                expense({ id: "eJul", date: JULY }),
            ],
            [],
            [],
            "2026-06",
        );
        expect(s.month.label).toBe("2026-06");
        expect(s.month.isCurrent).toBe(false);
        expect(s.month.journal.map((j) => j.id)).toEqual(["eJun"]);
        // The balance is the open cycle whatever month is on screen.
        expect(s.balance.amount).toBe(640);
        expect(s.journal.map((j) => j.id)).toEqual(["eJul", "eJun"]);
    });

    it("lists only the settlements closed in the viewed month", async () => {
        const juneClose = new Date("2026-06-10T00:00:00Z");
        const markers: SettlementCycleMarker[] = [
            { id: "mClose1", date: JUNE, closedAt: juneClose, amount: 320 },
            marker, // closed 2026-07-12
        ];
        const movements = [
            movement({
                id: "mClose1",
                type: "gf_received",
                amount: 320,
                date: JUNE,
                createdAt: new Date("2026-06-09T00:00:00Z"),
            }),
            closingTransfer,
        ];

        const july = await run([], movements, markers, "2026-07");
        expect(july.history.map((c) => c.id)).toEqual(["mClose"]);

        const june = await run([], movements, markers, "2026-06");
        expect(june.history.map((c) => c.id)).toEqual(["mClose1"]);
    });

    it("a month with no close has an empty history, not the last six", async () => {
        const s = await run([], [closingTransfer], [marker], "2026-05");
        expect(s.history).toEqual([]);
    });

    it("quotes one expense at ONE amount in every view", async () => {
        // The real "Repair" row: $1,200 at 68% stored 816.0000000000001, so the
        // partner's share came out 383.9999999999999 and rendered $383.99 in a
        // month view holding other rows but $384.00 in a history view holding it
        // alone — the residual cent landing on a different row per row-set.
        const repair = expense({
            id: "eRepair",
            // Dated after the others so it sorts newest in the month view — the
            // row the residual used to land on.
            date: new Date("2026-07-20T06:00:00Z"),
            createdAt: ENTERED_BEFORE_CLOSE,
            description: "Repair",
            amount: 1200,
            actualExpenditure: computeActualExpenditure({
                amount: 1200,
                isShared: true,
                yourPercentage: 0.68,
            }),
        });
        // Three $33.33 splits, in the month view only (entered after the close),
        // whose rounded rows read a cent over their own total. That residual is
        // what used to be subtracted from the newest row — Repair.
        const thirds = [1, 2, 3].map((n) =>
            expense({
                id: `eThird${n}`,
                date: JULY,
                createdAt: ENTERED_AFTER_CLOSE,
                amount: 33.33,
                actualExpenditure: computeActualExpenditure({
                    amount: 33.33,
                    isShared: true,
                    yourPercentage: 0.68,
                }),
            }),
        );

        const s = await run(
            [repair, ...thirds],
            [closingTransfer],
            [marker],
            "2026-07",
        );

        const share = (row?: SettlementJournalItem) =>
            row?.kind === "your_expense" ? row.partnerShare : null;
        const inMonth = share(s.month.journal.find((j) => j.id === "eRepair"));
        const inHistory = share(
            s.history[0]!.journal.find((j) => j.id === "eRepair"),
        );

        expect(inMonth).toBe(inHistory);
        expect(inMonth).toBe(384);
    });

    it("files a cycle under the month it was CLOSED in, not the transfer's date", async () => {
        // The transfer is dated July; the user confirmed the close in August.
        const augustClose = new Date("2026-08-03T00:00:00Z");
        const markers: SettlementCycleMarker[] = [
            { id: "mClose", date: JULY, closedAt: augustClose, amount: 320 },
        ];
        const august = await run([], [closingTransfer], markers, "2026-08");
        expect(august.history.map((c) => c.id)).toEqual(["mClose"]);
        const july = await run([], [closingTransfer], markers, "2026-07");
        expect(july.history).toEqual([]);
    });

    it("the Month view shows only the calendar month, whatever cycle it is in", async () => {
        const s = await run([
            expense({ id: "eJun", date: JUNE }),
            expense({ id: "eJul", date: JULY }),
        ]);
        expect(s.month.label).toBe("2026-07");
        expect(s.month.journal.map((j) => j.id)).toEqual(["eJul"]);
        // A month row is never "carried over" — it is the month by definition.
        expect(s.month.journal.every((j) => !j.carriedOver)).toBe(true);
    });
});
