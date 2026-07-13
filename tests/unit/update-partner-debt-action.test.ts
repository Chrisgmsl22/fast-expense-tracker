import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { updatePartnerDebt } from "@/app/_actions/movement/update-partner-debt";
import { FakeMovementRepository } from "@/tests/support/fake-movement-repository";

/** Seed a gf_fronted debt movement owned by u1 that the edit will target. */
function seededRepo() {
    const repo = new FakeMovementRepository();
    repo.seed("mv1", "u1", {
        type: "gf_fronted",
        cardId: null,
        amount: 300,
        note: null,
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
                id: "mv1",
                date: "2026-07-10",
                amount: "680",
                note: "gas she covered",
            },
            repo,
        );

        expect(res.ok).toBe(true);
        expect(repo.updates).toHaveLength(1);
        const { id, data } = repo.updates[0]!;
        expect(id).toBe("mv1");
        expect(data.type).toBe("gf_fronted");
        expect(data.cardId).toBeNull();
        expect(data.amount).toBe(680);
        expect(data.note).toBe("gas she covered");
    });

    it("stores a null note when the note is cleared", async () => {
        const repo = seededRepo();
        await updatePartnerDebt(
            { id: "mv1", date: "2026-07-10", amount: "300" },
            repo,
        );
        expect(repo.updates[0]!.data.note).toBeNull();
    });

    it("rejects an invalid edit with a validation code + no write", async () => {
        const repo = seededRepo();
        const res = await updatePartnerDebt(
            { id: "mv1", date: "2026-07-10", amount: "0" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(repo.updates).toHaveLength(0);
    });

    it("returns not_found when the row isn't the user's (IDOR guard)", async () => {
        const repo = seededRepo(); // mv1 belongs to u1
        authMock.mockResolvedValue({ user: { id: "someone_else" } });
        const res = await updatePartnerDebt(
            { id: "mv1", date: "2026-07-10", amount: "300" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
        expect(repo.updates).toHaveLength(0);
    });

    it("refuses to retype a non-debt movement (only gf_fronted is editable)", async () => {
        const repo = new FakeMovementRepository();
        repo.seed("mv1", "u1", { type: "card_payment", cardId: "card_1" });
        const res = await updatePartnerDebt(
            { id: "mv1", date: "2026-07-10", amount: "300" },
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
            { id: "mv1", date: "2026-07-10", amount: "300" },
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
            { id: "mv1", date: "2026-07-10", amount: "300" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});
