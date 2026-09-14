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
        if (res.ok) expect(res.data.markedMovementId).toBe("m1");
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
        // Christian's normal flow: +320 partner share at t0, she sends 100 at
        // t1 (balance +220), he logs a 220 debt she fronted at t2 (balance 0),
        // then closes at t3. The debt was entered AFTER the transfer, so a
        // boundary taken from the transfer's entry time would leave it out and
        // file a +220 cycle as settled, opening the next one at −220.
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
            expect(res.data.markedMovementId).toBeNull();
            expect(res.data.alreadyClosed).toBe(true);
        }
        expect(await settlementRepo.getCycleMarkers()).toHaveLength(0);
    });
});
