import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { archiveCard } from "@/app/_actions/card/archive";
import { FakeCardRepository } from "@/tests/support/fake-card-repository";

describe("archiveCard (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("archives the user's card (drops it from the active count)", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "NU", references: 3 });

        const res = await archiveCard({ id }, repo);

        expect(res.ok).toBe(true);
        expect(await repo.countActive("u1")).toBe(0);
    });

    it("rejects a missing id", async () => {
        const repo = new FakeCardRepository();
        const res = await archiveCard({ id: "" }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
    });

    it("returns unauthenticated with no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "NU" });
        const res = await archiveCard({ id }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
    });

    it("locks the cash card", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "Cash", type: "cash" });
        const res = await archiveCard({ id }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("cash_locked");
    });

    it("returns not_found for another user's card (IDOR guard)", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "other", name: "NotMine" });
        const res = await archiveCard({ id }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
    });

    it("maps a repository failure to db_error", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "NU" });
        repo.failOnWrite = true;
        const res = await archiveCard({ id }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});
