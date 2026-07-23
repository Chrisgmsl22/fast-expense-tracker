import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { updateCard } from "@/app/_actions/card/update";
import { FakeCardRepository } from "@/tests/support/fake-card-repository";

describe("updateCard (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("renames and recolors the user's card", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "NU", color: "#9333ea" });

        const res = await updateCard(
            { id, name: "Nubank", type: "credit", color: "#7c3aed" },
            repo,
        );

        expect(res.ok).toBe(true);
        const rows = await repo.listForSettings("u1");
        expect(rows[0]).toMatchObject({ name: "Nubank", color: "#7c3aed" });
    });

    it("changes the card type (credit → debit)", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "NU", type: "credit" });

        const res = await updateCard(
            { id, name: "NU", type: "debit", color: "#9333ea" },
            repo,
        );

        expect(res.ok).toBe(true);
        const rows = await repo.listForSettings("u1");
        expect(rows[0]?.type).toBe("debit");
    });

    it("rejects changing a card to cash (validation)", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "NU", type: "credit" });

        const res = await updateCard(
            { id, name: "NU", type: "cash", color: "#9333ea" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.type).toBeDefined();
        expect((await repo.listForSettings("u1"))[0]?.type).toBe("credit");
    });

    it("allows a pure recolor (same name — dup-check excludes self)", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "NU", color: "#9333ea" });

        const res = await updateCard(
            { id, name: "NU", type: "credit", color: "#111111" },
            repo,
        );
        expect(res.ok).toBe(true);
    });

    it("rejects invalid input with field errors", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "NU" });
        const res = await updateCard(
            { id, name: "", type: "credit", color: "#111111" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.name).toBeDefined();
    });

    it("returns unauthenticated with no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "NU" });
        const res = await updateCard(
            { id, name: "Nubank", type: "credit", color: "#111111" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
    });

    it("locks the cash card", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "Cash", type: "cash" });
        const res = await updateCard(
            { id, name: "Efectivo", type: "credit", color: "#111111" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("cash_locked");
    });

    it("rejects a duplicate active name from another card", async () => {
        const repo = new FakeCardRepository();
        repo.seed({ userId: "u1", name: "BBVA" });
        const id = repo.seed({ userId: "u1", name: "NU" });
        const res = await updateCard(
            { id, name: "bbva", type: "credit", color: "#111111" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("duplicate_name");
        expect(res.fieldErrors?.name).toBeDefined();
    });

    it("returns not_found for another user's card (IDOR guard)", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "other", name: "NotMine" });
        const res = await updateCard(
            { id, name: "Renamed", type: "credit", color: "#111111" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
    });

    it("maps a repository failure to db_error", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "NU" });
        repo.failOnWrite = true;
        const res = await updateCard(
            { id, name: "Nubank", type: "credit", color: "#111111" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});
