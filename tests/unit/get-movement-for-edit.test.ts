import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { deleteMovement } from "@/app/_actions/movement/delete";
import { getMovementForEdit } from "@/app/_actions/movement/get-for-edit";
import { updateCardPayment } from "@/app/_actions/movement/update-card-payment";
import { updatePartnerDebt } from "@/app/_actions/movement/update-partner-debt";
import { updateTransfer } from "@/app/_actions/movement/update-transfer";
import type { MovementType } from "@/lib/domain/movement";
import { FakeMovementRepository } from "@/tests/support/fake-movement-repository";

const CLOSED = new Date("2026-06-30T12:00:00Z");

function repoWith(
    type: MovementType,
    over: { closedAt?: Date | null; cycleClosedAt?: Date | null } = {},
) {
    const repo = new FakeMovementRepository();
    repo.seed("mv1", "u1", {
        type,
        amount: 300,
        cardId: type === "card_payment" ? "card1" : null,
        note: "netted",
        ...over,
    });
    return repo;
}

describe("getMovementForEdit (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("prefills a transfer whose cycle is still open, card and note included", async () => {
        const res = await getMovementForEdit("mv1", repoWith("gf_paid"));

        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.data).toEqual(
            expect.objectContaining({
                id: "mv1",
                type: "gf_paid",
                amount: 300,
                cardId: null,
                note: "netted",
                cycleClosedAt: null,
            }),
        );
    });

    it("refuses the transfer that closed a cycle", async () => {
        const res = await getMovementForEdit(
            "mv1",
            repoWith("gf_paid", { closedAt: CLOSED }),
        );

        expect(res).toEqual({
            ok: false,
            code: "cycle_closed",
            message: "This transfer closed a settlement and can't be edited.",
        });
    });

    it("refuses a transfer inside a closed cycle that did not close it", async () => {
        const res = await getMovementForEdit(
            "mv1",
            repoWith("gf_received", { cycleClosedAt: CLOSED }),
        );

        expect(res).toEqual({
            ok: false,
            code: "cycle_closed",
            message:
                "This transfer counts in a settlement you already closed, so it can't be edited.",
        });
    });

    it("refuses a debt a closed cycle counted, naming it a debt", async () => {
        const res = await getMovementForEdit(
            "mv1",
            repoWith("gf_fronted", { cycleClosedAt: CLOSED }),
        );

        expect(res).toEqual({
            ok: false,
            code: "cycle_closed",
            message:
                "This debt counts in a settlement you already closed, so it can't be edited.",
        });
    });

    it("prefills a card payment of the same closed cycle, which no cycle counts", async () => {
        const res = await getMovementForEdit(
            "mv1",
            repoWith("card_payment", { cycleClosedAt: CLOSED }),
        );

        expect(res.ok).toBe(true);
    });

    it("returns not_found when the row isn't the user's (IDOR guard)", async () => {
        authMock.mockResolvedValue({ user: { id: "someone_else" } });
        const res = await getMovementForEdit("mv1", repoWith("gf_paid"));

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
    });

    it("returns not_found for an empty id without reading", async () => {
        const repo = repoWith("gf_paid");
        const getById = vi.spyOn(repo, "getById");

        const res = await getMovementForEdit("", repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
        expect(getById).not.toHaveBeenCalled();
    });

    it("returns unauthenticated with no session", async () => {
        authMock.mockResolvedValue(null);
        const res = await getMovementForEdit("mv1", repoWith("gf_paid"));

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
    });

    it("maps a repository failure to db_error", async () => {
        const repo = repoWith("gf_paid");
        vi.spyOn(repo, "getById").mockRejectedValue(new Error("fake: down"));

        const res = await getMovementForEdit("mv1", repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});

describe("the edit read refuses exactly the movements the write refuses", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    const TYPES = [
        "card_payment",
        "gf_paid",
        "gf_received",
        "gf_fronted",
        "partner_debt",
    ] as const satisfies readonly MovementType[];
    const FROZEN = new Set<MovementType>([
        "gf_paid",
        "gf_received",
        "gf_fronted",
        "partner_debt",
    ]);

    /** The update action that owns each type, sent the row unchanged. */
    function updateUnchanged(
        type: (typeof TYPES)[number],
        repo: FakeMovementRepository,
    ) {
        const base = { id: "mv1", date: "2026-06-10", amount: 300 };
        switch (type) {
            case "card_payment":
                return updateCardPayment({ ...base, cardId: "card1" }, repo);
            case "gf_paid":
            case "gf_received":
                return updateTransfer(
                    { ...base, direction: type, note: "netted" },
                    repo,
                );
            case "gf_fronted":
            case "partner_debt":
                return updatePartnerDebt(
                    { ...base, direction: type, note: "netted" },
                    repo,
                );
        }
    }

    it.each(
        TYPES.flatMap(
            (type) =>
                [
                    [type, null],
                    [type, CLOSED],
                ] as const,
        ),
    )("%s, cycle closed at %s", async (type, cycleClosedAt) => {
        const isCycleClosed = (res: { ok: boolean; code?: string }) =>
            !res.ok && res.code === "cycle_closed";

        const read = await getMovementForEdit(
            "mv1",
            repoWith(type, { cycleClosedAt }),
        );
        const update = await updateUnchanged(
            type,
            repoWith(type, { cycleClosedAt }),
        );
        const remove = await deleteMovement(
            { id: "mv1" },
            repoWith(type, { cycleClosedAt }),
        );

        // Pinned, so the three cannot agree by all being wrong.
        const frozen = cycleClosedAt !== null && FROZEN.has(type);
        expect(isCycleClosed(read)).toBe(frozen);
        expect(isCycleClosed(read)).toBe(isCycleClosed(update));
        expect(isCycleClosed(read)).toBe(isCycleClosed(remove));
        // The same words on every path: the read says what the save would say.
        if (frozen) {
            const messageOf = (res: { ok: boolean; message?: string }) =>
                res.ok ? null : res.message;
            const noun =
                type === "gf_fronted" || type === "partner_debt"
                    ? "debt"
                    : "transfer";
            expect(messageOf(read)).toBe(
                `This ${noun} counts in a settlement you already closed, so it can't be edited.`,
            );
            expect(messageOf(update)).toBe(messageOf(read));
            expect(messageOf(remove)).toBe(
                "This row counts in a settlement you already closed, so it can't be deleted.",
            );
        }
        // Every unfrozen row really saves, so "not refused" is not a validation miss.
        if (!frozen) {
            expect(read.ok).toBe(true);
            expect(update.ok).toBe(true);
            expect(remove.ok).toBe(true);
        }
    });
});
