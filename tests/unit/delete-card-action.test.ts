import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { deleteCard } from "@/app/_actions/card/delete";
import { FakeCardRepository } from "@/tests/support/fake-card-repository";

describe("deleteCard (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("deletes a zero-reference card", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "Temp", references: 0 });

        const res = await deleteCard({ id }, repo);

        expect(res.ok).toBe(true);
        expect(await repo.listForSettings("u1")).toHaveLength(0);
    });

    it("refuses to delete a referenced card (archive instead)", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "Used", references: 2 });

        const res = await deleteCard({ id }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("has_references");
        // Still there — nothing deleted.
        expect(await repo.listForSettings("u1")).toHaveLength(1);
    });

    it("rejects a missing id", async () => {
        const repo = new FakeCardRepository();
        const res = await deleteCard({ id: "" }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
    });

    it("returns unauthenticated with no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "Temp" });
        const res = await deleteCard({ id }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
    });

    it("locks the cash card", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "Cash", type: "cash" });
        const res = await deleteCard({ id }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("cash_locked");
    });

    it("returns not_found for another user's card (IDOR guard)", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "other", name: "NotMine" });
        const res = await deleteCard({ id }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
    });

    it("maps a repository failure to db_error", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "Temp" });
        repo.failOnWrite = true;
        const res = await deleteCard({ id }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});
