import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { addPartnerDebt } from "@/app/_actions/movement/add-partner-debt";
import { FakeMovementRepository } from "@/tests/support/fake-movement-repository";

describe("addPartnerDebt (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("stores a gf_fronted Movement (no card, note carried through)", async () => {
        const repo = new FakeMovementRepository();
        const res = await addPartnerDebt(
            {
                date: "2026-07-10",
                amount: "500",
                note: "groceries she covered",
            },
            repo,
        );

        expect(res.ok).toBe(true);
        expect(repo.inserts).toHaveLength(1);
        const row = repo.inserts[0]!;
        expect(row.type).toBe("gf_fronted");
        expect(row.amount).toBe(500);
        expect(row.cardId).toBeNull();
        expect(row.fundedByPartner).toBe(false);
        expect(row.note).toBe("groceries she covered");
    });

    it("stores a null note when none is given (label is a view concern)", async () => {
        const repo = new FakeMovementRepository();
        await addPartnerDebt({ date: "2026-07-10", amount: "300" }, repo);
        expect(repo.inserts[0]!.note).toBeNull();
    });

    it("rejects an invalid debt with a validation code + no write", async () => {
        const repo = new FakeMovementRepository();
        const res = await addPartnerDebt(
            { date: "2026-07-10", amount: "0" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(repo.inserts).toHaveLength(0);
    });

    it("returns unauthenticated with no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeMovementRepository();
        const res = await addPartnerDebt(
            { date: "2026-07-10", amount: "500" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
        expect(repo.inserts).toHaveLength(0);
    });

    it("maps a repository failure to db_error", async () => {
        const repo = new FakeMovementRepository();
        repo.failOnWrite = true;
        const res = await addPartnerDebt(
            { date: "2026-07-10", amount: "500" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});
