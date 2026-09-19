import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { db } from "@/lib/db";
import { addPartnerDebt } from "@/app/_actions/movement/add-partner-debt";
import { updatePartnerDebt } from "@/app/_actions/movement/update-partner-debt";
import { deleteMovement } from "@/app/_actions/movement/delete";
import { PrismaMovementRepository } from "@/lib/repositories/movement.repository";
import { PrismaSettlementRepository } from "@/lib/repositories/settlement.repository";
import { PrismaSettingsRepository } from "@/lib/repositories/settings.repository";
import { PrismaDashboardRepository } from "@/lib/repositories/dashboard.repository";
import { PrismaExpenseRepository } from "@/lib/repositories/expense.repository";
import { getSettlement } from "@/lib/services/settlement/settlement.service";

const movementRepo = new PrismaMovementRepository(db);
const settlementRepo = new PrismaSettlementRepository(db);
const settingsRepo = new PrismaSettingsRepository(db);
const dashboardRepo = new PrismaDashboardRepository(db);
const expenseRepo = new PrismaExpenseRepository(db);
const date = new Date("2026-09-10T06:00:00Z");
const now = new Date("2026-09-18T12:00:00Z");
const payload = {
    date: "2026-09-10",
    amount: "100",
    direction: "partner_debt",
};

async function user(email = "debt@example.com") {
    const row = await db.user.create({
        data: { email, name: "Test", password: "x" },
    });
    authMock.mockResolvedValue({ user: { id: row.id } });
    return row;
}

describe("partner debt directions against real repositories", () => {
    beforeEach(() => authMock.mockReset());

    it("adds 100 to settlement without expenses, income, budget, card spend, or feed rows", async () => {
        const owner = await user();
        const created = await addPartnerDebt(payload, movementRepo);
        expect(created.ok).toBe(true);
        const settlement = await getSettlement(owner.id, {
            settlementRepo,
            settingsRepo,
            now,
        });
        expect(settlement.balance.balance).toBe(100);
        expect(settlement.breakdownItems.partner_debt).toEqual([
            expect.objectContaining({ amount: 100, gross: null }),
        ]);
        expect(settlement.month.journal).toEqual([
            expect.objectContaining({ direction: "partner_debt", amount: 100 }),
        ]);
        expect(await movementRepo.getForMonth(owner.id, "2026-09")).toEqual([]);
        expect(await expenseRepo.getForMonth(owner.id, "2026-09")).toEqual([]);
        expect(
            await dashboardRepo.getCategorySpends(owner.id, "2026-09"),
        ).toEqual([]);
        expect(await dashboardRepo.getCardSpends(owner.id, "2026-09")).toEqual(
            [],
        );
        expect(await db.income.count({ where: { userId: owner.id } })).toBe(0);
        await db.movement.create({
            data: { userId: owner.id, date, type: "gf_received", amount: 100 },
        });
        expect(
            (
                await getSettlement(owner.id, {
                    settlementRepo,
                    settingsRepo,
                    now,
                })
            ).balance.balance,
        ).toBe(0);
    });

    it.each(["gf_fronted", "partner_debt"] as const)(
        "excludes %s from feeds and refuses it as a close marker",
        async (type) => {
            const owner = await user();
            const debt = await db.movement.create({
                data: { userId: owner.id, date, type, amount: 100 },
            });
            expect(await movementRepo.getForMonth(owner.id, "2026-09")).toEqual(
                [],
            );
            expect(
                await settlementRepo.markCycleClose(
                    owner.id,
                    { id: debt.id, kind: "movement" },
                    now,
                ),
            ).toBe(0);
            expect(
                (await settlementRepo.getForCreatedRange(owner.id, null, null))
                    .movements,
            ).toEqual([expect.objectContaining({ id: debt.id, type })]);
        },
    );

    it("preserves direction on edit and enforces ownership on edit and delete", async () => {
        const owner = await user();
        const debt = await db.movement.create({
            data: { userId: owner.id, date, type: "partner_debt", amount: 100 },
        });
        await user("other-debt@example.com");
        expect(
            await updatePartnerDebt({ ...payload, id: debt.id }, movementRepo),
        ).toMatchObject({ ok: false, code: "not_found" });
        expect(
            await deleteMovement({ id: debt.id }, movementRepo),
        ).toMatchObject({ ok: false, code: "not_found" });
        authMock.mockResolvedValue({ user: { id: owner.id } });
        expect(
            await updatePartnerDebt(
                { id: debt.id, date: payload.date, amount: 120 },
                movementRepo,
            ),
        ).toMatchObject({ ok: true });
        expect(await movementRepo.getById(owner.id, debt.id)).toMatchObject({
            type: "partner_debt",
            amount: 120,
        });
        expect(
            await deleteMovement({ id: debt.id }, movementRepo),
        ).toMatchObject({ ok: true });
        expect(await movementRepo.getById(owner.id, debt.id)).toBeNull();
    });

    it("freezes partner debt in every settlement view and refuses edit or delete", async () => {
        const owner = await user();
        const debt = await db.movement.create({
            data: {
                userId: owner.id,
                date,
                createdAt: date,
                type: "partner_debt",
                amount: 100,
            },
        });
        const closedAt = new Date("2026-09-11T12:00:00Z");
        await db.movement.create({
            data: {
                userId: owner.id,
                date: closedAt,
                createdAt: closedAt,
                closedAt,
                type: "gf_received",
                amount: 100,
            },
        });
        expect(await movementRepo.getById(owner.id, debt.id)).toMatchObject({
            cycleClosedAt: closedAt,
        });
        expect(
            await updatePartnerDebt(
                { ...payload, id: debt.id, amount: 120 },
                movementRepo,
            ),
        ).toMatchObject({ ok: false, code: "cycle_closed" });
        expect(
            await deleteMovement({ id: debt.id }, movementRepo),
        ).toMatchObject({ ok: false, code: "cycle_closed" });
        const settlement = await getSettlement(owner.id, {
            settlementRepo,
            settingsRepo,
            now,
        });
        expect(settlement.journal).toEqual([]);
        expect(settlement.balance.balance).toBe(0);
        expect(
            settlement.month.journal.find((r) => r.id === debt.id),
        ).toMatchObject({ direction: "partner_debt", locked: true });
        expect(
            settlement.history[0]?.journal.find((r) => r.id === debt.id),
        ).toMatchObject({ direction: "partner_debt", locked: true });
        expect(settlement.history[0]?.summary).toMatchObject({
            spentUnsplit: 0,
            youOwed: 0,
            sheOwed: 100,
        });
    });
});
