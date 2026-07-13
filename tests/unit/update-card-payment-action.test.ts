import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { updateCardPayment } from "@/app/_actions/movement/update-card-payment";
import { FakeMovementRepository } from "@/tests/support/fake-movement-repository";

/** Seed a card_payment owned by u1 that the edit will target. */
function seededRepo() {
    const repo = new FakeMovementRepository();
    repo.seed("mv1", "u1", {
        type: "card_payment",
        cardId: "card_1",
        amount: 800,
        note: null,
    });
    return repo;
}

describe("updateCardPayment (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("writes the edited card payment, keeping the type", async () => {
        const repo = seededRepo();
        const res = await updateCardPayment(
            {
                id: "mv1",
                date: "2026-07-10",
                amount: "950",
                cardId: "card_2",
                note: "min payment",
            },
            repo,
        );

        expect(res.ok).toBe(true);
        expect(repo.updates).toHaveLength(1);
        const { id, data } = repo.updates[0]!;
        expect(id).toBe("mv1");
        expect(data.type).toBe("card_payment");
        expect(data.cardId).toBe("card_2");
        expect(data.amount).toBe(950);
        expect(data.note).toBe("min payment");
    });

    it("rejects an invalid edit with a validation code + no write", async () => {
        const repo = seededRepo();
        const res = await updateCardPayment(
            { id: "mv1", date: "2026-07-10", amount: "0", cardId: "card_1" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(repo.updates).toHaveLength(0);
    });

    it("returns not_found when the row isn't the user's (IDOR guard)", async () => {
        const repo = seededRepo();
        authMock.mockResolvedValue({ user: { id: "someone_else" } });
        const res = await updateCardPayment(
            { id: "mv1", date: "2026-07-10", amount: "950", cardId: "card_1" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
        expect(repo.updates).toHaveLength(0);
    });

    it("refuses to retype a non-card-payment movement", async () => {
        const repo = new FakeMovementRepository();
        repo.seed("mv1", "u1", { type: "gf_paid", cardId: null });
        const res = await updateCardPayment(
            { id: "mv1", date: "2026-07-10", amount: "950", cardId: "card_1" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
        expect(repo.updates).toHaveLength(0);
    });

    it("returns unauthenticated with no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = seededRepo();
        const res = await updateCardPayment(
            { id: "mv1", date: "2026-07-10", amount: "950", cardId: "card_1" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
        expect(repo.updates).toHaveLength(0);
    });

    it("maps a repository failure to db_error", async () => {
        const repo = seededRepo();
        repo.failOnWrite = true;
        const res = await updateCardPayment(
            { id: "mv1", date: "2026-07-10", amount: "950", cardId: "card_1" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});
