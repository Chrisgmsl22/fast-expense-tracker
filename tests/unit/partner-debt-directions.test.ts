import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { addPartnerDebt } from "@/app/_actions/movement/add-partner-debt";
import { updatePartnerDebt } from "@/app/_actions/movement/update-partner-debt";
import { deleteMovement } from "@/app/_actions/movement/delete";
import { FakeMovementRepository } from "@/tests/support/fake-movement-repository";
import { computeFeedTotals } from "@/lib/domain/movement";
import { canCloseCycle } from "@/lib/domain/settlement";
import { buildFeed } from "@/lib/feed";

const input = { date: "2026-09-10", amount: "100", direction: "partner_debt" };

describe("debts in both directions", () => {
    beforeEach(() => authMock.mockResolvedValue({ user: { id: "u1" } }));

    it("excludes both debts from ordinary feeds, charged totals, and budget totals", () => {
        const debts = (["gf_fronted", "partner_debt"] as const).map((type) => ({
            id: type,
            type,
            amount: 100,
            date: new Date("2026-09-10T06:00:00Z"),
            card: null,
            note: null,
            fundedFrom: "income" as const,
            closedAt: null,
            cycleClosedAt: null,
        }));
        expect(buildFeed([], debts)).toEqual([]);
        expect(computeFeedTotals([], debts)).toMatchObject({
            charged: 0,
            whatIReallySpent: 0,
            setAside: 0,
            paidToPartner: 0,
            total: 0,
        });
        expect(canCloseCycle("partner_debt")).toBe(false);
    });

    it("rejects edits and deletes after the debt's cycle closes", async () => {
        const repo = new FakeMovementRepository();
        repo.seed("debt", "u1", {
            type: "partner_debt",
            amount: 100,
            cycleClosedAt: new Date("2026-09-11T12:00:00Z"),
        });
        expect(
            await updatePartnerDebt({ ...input, id: "debt" }, repo),
        ).toMatchObject({ ok: false, code: "cycle_closed" });
        expect(await deleteMovement({ id: "debt" }, repo)).toMatchObject({
            ok: false,
            code: "cycle_closed",
        });
        expect(await repo.getById("u1", "debt")).toMatchObject({ amount: 100 });
    });

    it("requires a valid date and limits the note", async () => {
        const repo = new FakeMovementRepository();
        expect(
            await addPartnerDebt({ ...input, date: "" }, repo),
        ).toMatchObject({ ok: false, code: "validation" });
        expect(
            await addPartnerDebt({ ...input, note: "x".repeat(201) }, repo),
        ).toMatchObject({ ok: false, code: "validation" });
        expect(repo.inserts).toHaveLength(0);
    });

    it("creates a partner debt at its full positive amount", async () => {
        const repo = new FakeMovementRepository();
        expect(await addPartnerDebt(input, repo)).toMatchObject({ ok: true });
        expect(repo.inserts[0]).toMatchObject({
            type: "partner_debt",
            amount: 100,
            cardId: null,
        });
    });

    it("preserves the existing direction when create omits it", async () => {
        const repo = new FakeMovementRepository();
        await addPartnerDebt({ date: input.date, amount: input.amount }, repo);
        expect(repo.inserts[0]?.type).toBe("gf_fronted");
    });

    it.each(["other", "gf_paid", "", null])(
        "rejects invalid direction %s",
        async (direction) => {
            const repo = new FakeMovementRepository();
            expect(
                await addPartnerDebt({ ...input, direction }, repo),
            ).toMatchObject({ ok: false, code: "validation" });
            expect(repo.inserts).toHaveLength(0);
        },
    );

    it.each(["0", "-1", "not a number"])(
        "rejects invalid amount %s",
        async (amount) => {
            expect(
                await addPartnerDebt(
                    { ...input, amount },
                    new FakeMovementRepository(),
                ),
            ).toMatchObject({ ok: false, code: "validation" });
        },
    );

    it("requires a session", async () => {
        authMock.mockResolvedValue(null);
        expect(
            await addPartnerDebt(input, new FakeMovementRepository()),
        ).toMatchObject({ ok: false, code: "unauthenticated" });
    });

    it("preserves the stored partner direction when an edit omits it", async () => {
        const repo = new FakeMovementRepository();
        repo.seed("debt", "u1", { type: "partner_debt", amount: 100 });
        expect(
            await updatePartnerDebt(
                { id: "debt", date: input.date, amount: 120 },
                repo,
            ),
        ).toMatchObject({ ok: true });
        expect(await repo.getById("u1", "debt")).toMatchObject({
            type: "partner_debt",
            amount: 120,
        });
    });

    it("rejects an edit that changes a debt direction", async () => {
        const repo = new FakeMovementRepository();
        repo.seed("debt", "u1", { type: "gf_fronted", amount: 100 });
        expect(
            await updatePartnerDebt({ ...input, id: "debt" }, repo),
        ).toMatchObject({ ok: false, code: "validation" });
        expect(await repo.getById("u1", "debt")).toMatchObject({
            type: "gf_fronted",
            amount: 100,
        });
    });

    it("does not edit another user's debt", async () => {
        const repo = new FakeMovementRepository();
        repo.seed("debt", "u2", { type: "partner_debt", amount: 100 });
        expect(
            await updatePartnerDebt({ ...input, id: "debt" }, repo),
        ).toMatchObject({ ok: false, code: "not_found" });
    });

    it("deletes an open partner debt", async () => {
        const repo = new FakeMovementRepository();
        repo.seed("debt", "u1", { type: "partner_debt", amount: 100 });
        expect(await deleteMovement({ id: "debt" }, repo)).toMatchObject({
            ok: true,
        });
        expect(await repo.getById("u1", "debt")).toBeNull();
    });
});
