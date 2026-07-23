import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { restoreCard } from "@/app/_actions/card/restore";
import { MAX_ACTIVE_CARDS } from "@/lib/domain/card";
import { FakeCardRepository } from "@/tests/support/fake-card-repository";

describe("restoreCard (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("restores an archived card", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({
            userId: "u1",
            name: "NU",
            archivedAt: new Date(),
        });

        const res = await restoreCard({ id }, repo);

        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.data).toEqual({ id, name: "NU" });
        expect(await repo.countActive("u1")).toBe(1);
    });

    it("blocks restore when an active card already has that name", async () => {
        const repo = new FakeCardRepository();
        const archivedId = repo.seed({
            userId: "u1",
            name: "NU",
            archivedAt: new Date(),
        });
        // A new active card took the name after the archive.
        repo.seed({ userId: "u1", name: "nu" });

        const res = await restoreCard({ id: archivedId }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("name_conflict");
        // Still archived — not restored.
        expect(await repo.countActive("u1")).toBe(1);
    });

    it("allows restore at one below the active cap", async () => {
        const repo = new FakeCardRepository();
        for (let i = 0; i < MAX_ACTIVE_CARDS - 1; i += 1) {
            repo.seed({ userId: "u1", name: `Card ${i}` });
        }
        const id = repo.seed({
            userId: "u1",
            name: "Old",
            archivedAt: new Date(),
        });

        const res = await restoreCard({ id }, repo);

        expect(res.ok).toBe(true);
        expect(await repo.countActive("u1")).toBe(MAX_ACTIVE_CARDS);
    });

    it("blocks restore at the active-card cap", async () => {
        const repo = new FakeCardRepository();
        for (let i = 0; i < MAX_ACTIVE_CARDS; i += 1) {
            repo.seed({ userId: "u1", name: `Card ${i}` });
        }
        const id = repo.seed({
            userId: "u1",
            name: "Old",
            archivedAt: new Date(),
        });

        const res = await restoreCard({ id }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("limit_reached");
        // Still archived — not restored.
        expect(await repo.countActive("u1")).toBe(MAX_ACTIVE_CARDS);
    });

    it("rejects a missing id", async () => {
        const repo = new FakeCardRepository();
        const res = await restoreCard({ id: "" }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
    });

    it("returns unauthenticated with no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeCardRepository();
        const id = repo.seed({
            userId: "u1",
            name: "NU",
            archivedAt: new Date(),
        });
        const res = await restoreCard({ id }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
    });

    it("returns not_found for an already-active card (nothing to restore)", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "NU" });
        const res = await restoreCard({ id }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
    });

    it("returns not_found for another user's card (IDOR guard)", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({
            userId: "other",
            name: "NotMine",
            archivedAt: new Date(),
        });
        const res = await restoreCard({ id }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
    });

    it("maps a repository failure to db_error", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({
            userId: "u1",
            name: "NU",
            archivedAt: new Date(),
        });
        repo.failOnWrite = true;
        const res = await restoreCard({ id }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});
