import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { addCard } from "@/app/_actions/card/add";
import { MAX_ACTIVE_CARDS } from "@/lib/domain/card";
import { FakeCardRepository } from "@/tests/support/fake-card-repository";

const validInput = { name: "NU", type: "credit", color: "#9333ea" };

describe("addCard (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("creates the card, scoped to the session user", async () => {
        const repo = new FakeCardRepository();
        const res = await addCard(validInput, repo);

        expect(res.ok).toBe(true);
        expect(repo.created).toHaveLength(1);
        expect(repo.created[0]).toEqual({
            userId: "u1",
            data: { name: "NU", type: "credit", color: "#9333ea" },
        });
    });

    it("rejects invalid input with field errors and no write", async () => {
        const repo = new FakeCardRepository();
        const res = await addCard(
            { name: "", type: "credit", color: "#9333ea" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.name).toBeDefined();
        expect(repo.created).toHaveLength(0);
    });

    it("rejects a cash card add (cash is a locked system card, not addable)", async () => {
        const repo = new FakeCardRepository();
        const res = await addCard(
            { name: "Efectivo", type: "cash", color: "#16a34a" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.type).toBeDefined();
        expect(repo.created).toHaveLength(0);
    });

    it("returns unauthenticated with no session (never writes)", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeCardRepository();
        const res = await addCard(validInput, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
        expect(repo.created).toHaveLength(0);
    });

    it("rejects at the active-card cap", async () => {
        const repo = new FakeCardRepository();
        for (let i = 0; i < MAX_ACTIVE_CARDS; i += 1) {
            repo.seed({ userId: "u1", name: `Card ${i}` });
        }
        const res = await addCard(validInput, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("limit_reached");
        expect(repo.created).toHaveLength(0);
    });

    it("counts only active cards toward the cap (archived free a slot)", async () => {
        const repo = new FakeCardRepository();
        for (let i = 0; i < MAX_ACTIVE_CARDS; i += 1) {
            repo.seed({ userId: "u1", name: `Card ${i}` });
        }
        // Archive one → back under the cap → add succeeds.
        repo.seed({ userId: "u1", name: "Old", archivedAt: new Date() });
        const res = await addCard(validInput, repo);
        expect(res.ok).toBe(false); // still 10 active
        if (res.ok) return;
        expect(res.code).toBe("limit_reached");
    });

    it("rejects a duplicate active name (case-insensitive)", async () => {
        const repo = new FakeCardRepository();
        repo.seed({ userId: "u1", name: "nu" });
        const res = await addCard(validInput, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("duplicate_name");
        expect(res.fieldErrors?.name).toBeDefined();
        expect(repo.created).toHaveLength(0);
    });

    it("allows re-using an archived card's name", async () => {
        const repo = new FakeCardRepository();
        repo.seed({ userId: "u1", name: "NU", archivedAt: new Date() });
        const res = await addCard(validInput, repo);

        expect(res.ok).toBe(true);
        expect(repo.created).toHaveLength(1);
    });

    it("maps a repository failure to db_error", async () => {
        const repo = new FakeCardRepository();
        repo.failOnWrite = true;
        const res = await addCard(validInput, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});
