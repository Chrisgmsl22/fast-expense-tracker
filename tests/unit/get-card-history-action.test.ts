import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { getCardHistory } from "@/app/_actions/card/get-history";
import { FakeCardRepository } from "@/tests/support/fake-card-repository";

describe("getCardHistory (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("returns the opening balance and the month newest first, running from it", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "BBVA" });
        repo.histories.set(id, {
            before: { charged: 1000, paid: 400, redeemed: 0 },
            entries: [
                {
                    id: "e1",
                    kind: "charge",
                    date: new Date("2026-09-01T06:00:00Z"),
                    createdAt: new Date("2026-09-01T06:00:00Z"),
                    description: "Costco",
                    detail: "Groceries",
                    isShared: false,
                    amount: 500,
                },
                {
                    id: "m1",
                    kind: "payment",
                    date: new Date("2026-09-05T06:00:00Z"),
                    createdAt: new Date("2026-09-05T06:00:00Z"),
                    description: null,
                    detail: null,
                    isShared: false,
                    amount: 200,
                },
            ],
        });

        const res = await getCardHistory({ id, month: "2026-09" }, repo);

        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(repo.monthsRead).toEqual(["2026-09"]);
        expect(res.data.opening).toBe(600);
        expect(
            res.data.lines.map((l) => [l.id, l.signedAmount, l.balanceAfter]),
        ).toEqual([
            ["m1", -200, 900],
            ["e1", 500, 1100],
        ]);
    });

    it("rejects a missing id", async () => {
        const res = await getCardHistory(
            { id: "", month: "2026-09" },
            new FakeCardRepository(),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
    });

    it("rejects a value that is not a month", async () => {
        const res = await getCardHistory(
            { id: "card-1", month: "September" },
            new FakeCardRepository(),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
    });

    it("returns unauthenticated with no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1" });

        const res = await getCardHistory({ id, month: "2026-09" }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
    });

    it("returns not_found for another user's card", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "other" });

        const res = await getCardHistory({ id, month: "2026-09" }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
    });

    it("returns db_error when the read fails", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1" });
        repo.failOnRead = true;
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});

        const res = await getCardHistory({ id, month: "2026-09" }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
        spy.mockRestore();
    });
});
