import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { updateTransfer } from "@/app/_actions/movement/update-transfer";
import { FakeMovementRepository } from "@/tests/support/fake-movement-repository";

/** Seed a gf_paid transfer owned by u1 that the edit will target. */
function seededRepo() {
    const repo = new FakeMovementRepository();
    repo.seed("mv1", "u1", {
        type: "gf_paid",
        cardId: null,
        amount: 300,
        note: null,
    });
    return repo;
}

describe("updateTransfer (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("flips the direction + amount and clears the card", async () => {
        const repo = seededRepo();
        const res = await updateTransfer(
            {
                id: "mv1",
                date: "2026-07-10",
                amount: "500",
                direction: "gf_received",
                note: "she paid me back",
            },
            repo,
        );

        expect(res.ok).toBe(true);
        const { id, data } = repo.updates[0]!;
        expect(id).toBe("mv1");
        expect(data.type).toBe("gf_received");
        expect(data.cardId).toBeNull();
        expect(data.amount).toBe(500);
        expect(data.note).toBe("she paid me back");
    });

    it("stores a null note when the note is cleared", async () => {
        const repo = seededRepo();
        await updateTransfer(
            {
                id: "mv1",
                date: "2026-07-10",
                amount: "300",
                direction: "gf_paid",
            },
            repo,
        );
        expect(repo.updates[0]!.data.note).toBeNull();
    });

    it("rejects an invalid edit with a validation code + no write", async () => {
        const repo = seededRepo();
        const res = await updateTransfer(
            {
                id: "mv1",
                date: "2026-07-10",
                amount: "0",
                direction: "gf_paid",
            },
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
        const res = await updateTransfer(
            {
                id: "mv1",
                date: "2026-07-10",
                amount: "300",
                direction: "gf_paid",
            },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
        expect(repo.updates).toHaveLength(0);
    });

    it("refuses to retype a non-transfer movement", async () => {
        const repo = new FakeMovementRepository();
        repo.seed("mv1", "u1", { type: "card_payment", cardId: "card_1" });
        const res = await updateTransfer(
            {
                id: "mv1",
                date: "2026-07-10",
                amount: "300",
                direction: "gf_paid",
            },
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
        const res = await updateTransfer(
            {
                id: "mv1",
                date: "2026-07-10",
                amount: "300",
                direction: "gf_paid",
            },
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
        const res = await updateTransfer(
            {
                id: "mv1",
                date: "2026-07-10",
                amount: "300",
                direction: "gf_paid",
            },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});
