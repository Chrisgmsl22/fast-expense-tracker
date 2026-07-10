import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { updatePartnerDebt } from "@/app/_actions/movement/update-partner-debt";
import { FakeExpenseRepository } from "@/tests/support/fake-expense-repository";

/** Seed a gf-fronted debt owned by u1 that the edit will target. */
function seededRepo() {
    const repo = new FakeExpenseRepository();
    repo.seedExpense("e1", "u1", {
        paidBy: "gf",
        cardId: null,
        isShared: false,
        yourPercentage: 1,
        amount: 300,
        actualExpenditure: 300,
        description: "I owe Brenda",
    });
    return repo;
}

describe("updatePartnerDebt (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("re-asserts the debt invariants on the edited row", async () => {
        const repo = seededRepo();
        const res = await updatePartnerDebt(
            {
                id: "e1",
                date: "2026-07-10",
                amount: "680",
                categoryId: "cat_transport",
                note: "gas she covered",
            },
            repo,
        );

        expect(res.ok).toBe(true);
        expect(repo.updates).toHaveLength(1);
        const { id, data } = repo.updates[0]!;
        expect(id).toBe("e1");
        expect(data.paidBy).toBe("gf");
        expect(data.cardId).toBeNull();
        expect(data.subcategoryId).toBeNull();
        expect(data.isShared).toBe(false);
        expect(data.yourPercentage).toBe(1);
        expect(data.amount).toBe(680);
        expect(data.actualExpenditure).toBe(680); // whole amount is your cost
        expect(data.categoryId).toBe("cat_transport");
        expect(data.description).toBe("gas she covered");
    });

    it("defaults the description to 'I owe Brenda' when the note is cleared", async () => {
        const repo = seededRepo();
        await updatePartnerDebt(
            { id: "e1", date: "2026-07-10", amount: "300", categoryId: "c1" },
            repo,
        );
        expect(repo.updates[0]!.data.description).toBe("I owe Brenda");
    });

    it("rejects an invalid edit with a validation code + no write", async () => {
        const repo = seededRepo();
        const res = await updatePartnerDebt(
            { id: "e1", date: "2026-07-10", amount: "0", categoryId: "" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(repo.updates).toHaveLength(0);
    });

    it("returns not_found when the row isn't the user's (IDOR guard)", async () => {
        const repo = seededRepo(); // e1 belongs to u1
        authMock.mockResolvedValue({ user: { id: "someone_else" } });
        const res = await updatePartnerDebt(
            { id: "e1", date: "2026-07-10", amount: "300", categoryId: "c1" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
        expect(repo.updates).toHaveLength(0);
    });

    it("refuses to retype a non-debt expense (only paidBy:'gf' rows are editable)", async () => {
        const repo = new FakeExpenseRepository();
        repo.seedExpense("e1", "u1", { paidBy: "you", cardId: "card_1" });
        const res = await updatePartnerDebt(
            { id: "e1", date: "2026-07-10", amount: "300", categoryId: "c1" },
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
        const res = await updatePartnerDebt(
            { id: "e1", date: "2026-07-10", amount: "300", categoryId: "c1" },
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
        const res = await updatePartnerDebt(
            { id: "e1", date: "2026-07-10", amount: "300", categoryId: "c1" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});
