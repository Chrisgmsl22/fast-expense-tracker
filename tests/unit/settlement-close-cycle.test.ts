// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { closeSettlementCycle } from "@/app/_actions/settlement/close-cycle";
import { getSettlement } from "@/lib/services/settlement/settlement.service";
import type {
    SettlementExpenseRow,
    SettlementMovementRow,
    SettlementRepository,
} from "@/lib/repositories/settlement.repository";
import { FakeSettlementRepository } from "@/tests/support/fake-settlement-repository";
import { FakeSettingsRepository } from "@/tests/support/fake-settings-repository";

const NOW = new Date("2026-07-15T12:00:00Z");
const JULY = new Date("2026-07-10T06:00:00Z");

const expense = (
    over: Partial<SettlementExpenseRow> = {},
): SettlementExpenseRow => ({
    id: "e1",
    date: JULY,
    description: "Groceries",
    amount: 1000,
    actualExpenditure: 680,
    isShared: true,
    isPartnerPayment: false,
    fundedFrom: "income",
    createdAt: JULY,
    ...over,
});

const movement = (
    over: Partial<SettlementMovementRow> = {},
): SettlementMovementRow => ({
    id: "m1",
    date: JULY,
    amount: 320,
    type: "gf_received",
    note: null,
    fundedFrom: "income",
    createdAt: JULY,
    closedAt: null,
    ...over,
});

function setup(
    expenses: SettlementExpenseRow[],
    movements: SettlementMovementRow[],
) {
    const settlementRepo = new FakeSettlementRepository();
    settlementRepo.setExpenses(expenses);
    settlementRepo.setMovements(movements);
    const settingsRepo = new FakeSettingsRepository();
    settingsRepo.seed("u1", { sharesExpenses: true, partnerName: "Brenda" });
    return {
        settlementRepo,
        deps: { settlementRepo, settingsRepo, now: NOW },
    };
}

describe("closeSettlementCycle", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("marks the settling transfer when the balance is square", async () => {
        const { settlementRepo, deps } = setup([expense()], [movement()]);

        const res = await closeSettlementCycle(deps);

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data.marked).toEqual({ id: "m1", kind: "movement" });
        }
        expect(await settlementRepo.getCycleMarkers()).toHaveLength(1);
    });

    it("refuses to close while money is still owed, and writes nothing", async () => {
        const { settlementRepo, deps } = setup(
            [expense()],
            [movement({ amount: 100 })],
        );

        const res = await closeSettlementCycle(deps);

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("not_settled");
        expect(await settlementRepo.getCycleMarkers()).toHaveLength(0);
    });

    it("a double submit never writes a second marker", async () => {
        const { settlementRepo, deps } = setup([expense()], [movement()]);

        const first = await closeSettlementCycle(deps);
        const second = await closeSettlementCycle(deps);

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (second.ok) expect(second.data.alreadyClosed).toBe(true);
        expect(await settlementRepo.getCycleMarkers()).toHaveLength(1);
    });

    it("closing opens the next cycle, so a later row starts a fresh balance", async () => {
        const { settlementRepo, deps } = setup([expense()], [movement()]);
        await closeSettlementCycle(deps);

        // Entered after the close instant (NOW) → the new open cycle.
        settlementRepo.setExpenses([
            expense(),
            expense({
                id: "eNext",
                createdAt: new Date("2026-07-16T00:00:00Z"),
            }),
        ]);
        const res = await closeSettlementCycle(deps);

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("not_settled");
    });

    it("rejects an unauthenticated caller without touching the repo", async () => {
        authMock.mockResolvedValue(null);
        const { settlementRepo, deps } = setup([expense()], [movement()]);

        const res = await closeSettlementCycle(deps);

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("unauthenticated");
        expect(await settlementRepo.getCycleMarkers()).toHaveLength(0);
    });

    it("files every row the zero balance counted, including ones entered after the transfer", async () => {
        // The debt was entered AFTER the transfer, so a boundary taken from the
        // transfer's entry time would leave it out — filing a +220 cycle as settled and
        // opening the next one at −220.
        const t0 = new Date("2026-07-10T10:00:00Z");
        const t1 = new Date("2026-07-11T10:00:00Z");
        const t2 = new Date("2026-07-12T10:00:00Z");
        const { settlementRepo, deps } = setup(
            [expense({ id: "eShared", createdAt: t0 })],
            [
                movement({
                    id: "mTransfer",
                    type: "gf_received",
                    amount: 100,
                    createdAt: t1,
                }),
                movement({
                    id: "mDebt",
                    type: "gf_fronted",
                    amount: 220,
                    createdAt: t2,
                }),
            ],
        );

        const res = await closeSettlementCycle(deps);
        expect(res.ok).toBe(true);

        const after = await getSettlement("u1", deps);
        // The next cycle starts empty and square — nothing leaked past the close.
        expect(after.journal).toEqual([]);
        expect(after.balance.amount).toBe(0);
        // And the closed cycle holds all three rows, which net to zero.
        expect(after.history).toHaveLength(1);
        expect(after.history[0]!.journal.map((j) => j.id).sort()).toEqual([
            "eShared",
            "mDebt",
            "mTransfer",
        ]);
        expect(await settlementRepo.getCycleMarkers()).toHaveLength(1);
    });

    it("cannot mark a non-transfer movement as the close", async () => {
        // A zero balance reached with no transfer at all: nothing to mark.
        const { settlementRepo, deps } = setup(
            [expense({ amount: 1000, actualExpenditure: 1000 })],
            [movement({ id: "mCard", type: "card_payment", amount: 500 })],
        );

        const res = await closeSettlementCycle(deps);

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data.marked).toBeNull();
            expect(res.data.alreadyClosed).toBe(true);
        }
        expect(await settlementRepo.getCycleMarkers()).toHaveLength(0);
    });
});

/** The owner's normal settle: she fronts something, he pays her, the payment is an Expense. */
const payment = (
    over: Partial<SettlementExpenseRow> = {},
): SettlementExpenseRow =>
    expense({
        id: "ePayment",
        description: "Transfer — you paid Brenda",
        isPartnerPayment: true,
        amount: 300,
        actualExpenditure: 300,
        isShared: false,
        ...over,
    });

describe("closeSettlementCycle — a cycle squared by PAYING the partner", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("marks the payment-expense, because no movement is there to carry it", async () => {
        const { settlementRepo, deps } = setup(
            [payment()],
            [movement({ id: "mDebt", type: "gf_fronted", amount: 300 })],
        );

        const res = await closeSettlementCycle(deps);

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data.marked).toEqual({
                id: "ePayment",
                kind: "expense",
            });
        }
        const markers = await settlementRepo.getCycleMarkers();
        expect(markers).toHaveLength(1);
        // The boundary is the close instant, and the settled figure is what reached her.
        expect(markers[0]).toMatchObject({
            id: "ePayment",
            kind: "expense",
            closedAt: NOW,
            amount: 300,
        });
    });

    it("files the cycle in History with every row it counted, and opens the next one empty", async () => {
        const { deps } = setup(
            [payment()],
            [movement({ id: "mDebt", type: "gf_fronted", amount: 300 })],
        );

        expect((await closeSettlementCycle(deps)).ok).toBe(true);

        const after = await getSettlement("u1", deps);
        expect(after.journal).toEqual([]);
        expect(after.balance.amount).toBe(0);
        expect(after.closableMarker).toBeNull();
        expect(after.history).toHaveLength(1);
        expect(after.history[0]!.id).toBe("ePayment");
        expect(after.history[0]!.settledAmount).toBe(300);
        expect(after.history[0]!.journal.map((j) => j.id).sort()).toEqual([
            "ePayment",
            "mDebt",
        ]);
        // Both rows are inside a closed cycle now, so both are frozen.
        expect(after.history[0]!.journal.every((j) => j.locked)).toBe(true);
    });

    it("a double submit never writes a second marker", async () => {
        const { settlementRepo, deps } = setup(
            [payment()],
            [movement({ id: "mDebt", type: "gf_fronted", amount: 300 })],
        );

        const first = await closeSettlementCycle(deps);
        const second = await closeSettlementCycle(deps);

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (second.ok) expect(second.data.alreadyClosed).toBe(true);
        expect(await settlementRepo.getCycleMarkers()).toHaveLength(1);
    });

    it("prefers the most recently entered row, whichever table it is in", async () => {
        // Her share of his expense (320) cancels the transfer she sent (320); the debt
        // he owes (300) cancels the payment he sent (300). Square, with a markable row
        // in each table — and the payment is the one entered last.
        const later = new Date("2026-07-13T00:00:00Z");
        const { deps } = setup(
            [expense(), payment({ createdAt: later })],
            [
                movement({ id: "mDebt", type: "gf_fronted", amount: 300 }),
                movement({
                    id: "mTransfer",
                    type: "gf_received",
                    amount: 320,
                    createdAt: JULY,
                }),
            ],
        );

        const res = await closeSettlementCycle(deps);

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data.marked).toEqual({
                id: "ePayment",
                kind: "expense",
            });
        }
    });
});

describe("closeSettlementCycle — the direction the tests never covered", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("refuses, loudly, when the squared cycle holds neither a payment nor a transfer", async () => {
        // A shared expense she owes 320 on, cancelled by a 320 debt he owes her: square,
        // and settled by no money at all, so nothing can carry the boundary.
        const { settlementRepo, deps } = setup(
            [expense()],
            [movement({ id: "mDebt", type: "gf_fronted", amount: 320 })],
        );

        const res = await closeSettlementCycle(deps);

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("no_marker");
            expect(res.message).toMatch(/payment or transfer/i);
        }
        expect(await settlementRepo.getCycleMarkers()).toHaveLength(0);
    });

    it("still reports an EMPTY cycle as already closed", async () => {
        // Nothing to mark and nothing in it — a double submit lands here, and
        // that genuinely is closed.
        const { deps } = setup([], []);

        const res = await closeSettlementCycle(deps);

        expect(res.ok).toBe(true);
        if (res.ok) expect(res.data.alreadyClosed).toBe(true);
    });
});

/**
 * `markCycleClose` returns 0 for two opposite reasons: the row is already a marker (the
 * cycle IS closed), or it was deleted since the read (the cycle did NOT close). Mapping
 * both to `alreadyClosed` reports a filing that never happened.
 */
describe("closeSettlementCycle — a zero-count write", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    /** The real deps, with the marking write forced to match nothing. */
    function withFailedWrite(markerSurvives: boolean) {
        const { settlementRepo, deps } = setup([expense()], [movement()]);
        const repo: SettlementRepository = {
            getForWindow: (userId, start, end) =>
                settlementRepo.getForWindow(userId, start, end),
            getForCreatedRange: (userId, after, through) =>
                settlementRepo.getForCreatedRange(userId, after, through),
            getCycleMarkers: async () =>
                markerSurvives
                    ? [
                          {
                              id: "m1",
                              kind: "movement" as const,
                              date: JULY,
                              closedAt: NOW,
                              amount: 320,
                          },
                      ]
                    : [],
            markCycleClose: async () => 0,
        };
        return { ...deps, settlementRepo: repo };
    }

    it("reports already-closed when a marker for that transfer exists", async () => {
        const res = await closeSettlementCycle(withFailedWrite(true));

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data.alreadyClosed).toBe(true);
            expect(res.data.marked).toBeNull();
        }
    });

    it("reports a real error when the transfer is gone instead", async () => {
        const res = await closeSettlementCycle(withFailedWrite(false));

        // Nothing was written, so "closed" would be a lie. The user gets a
        // message that tells them what to do about it.
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("marker_gone");
            expect(res.message).toMatch(/no longer there/i);
        }
    });
});
