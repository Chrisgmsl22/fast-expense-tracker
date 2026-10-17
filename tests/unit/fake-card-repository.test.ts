import { describe, expect, it } from "vitest";

import type { CardHistoryEntry } from "@/lib/domain/card-balance";
import { FakeCardRepository } from "@/tests/support/fake-card-repository";

// Parity with PrismaCardRepository: tests/integration/card-balance-repository.test.ts
// pins the same per-month rule against the real database.

const entry = (
    over: Pick<CardHistoryEntry, "id" | "kind" | "amount"> & { date: string },
): CardHistoryEntry => ({
    createdAt: new Date(over.date),
    description: over.kind === "charge" ? "Charge" : null,
    detail: null,
    isShared: false,
    ...over,
    date: new Date(over.date),
});

const september = entry({
    id: "e0",
    kind: "charge",
    amount: 830,
    date: "2026-09-20T06:00:00Z",
});
const shared = entry({
    id: "e1",
    kind: "charge",
    amount: 1300,
    date: "2026-10-02T06:00:00Z",
});
const payment = entry({
    id: "m1",
    kind: "payment",
    amount: 416,
    date: "2026-10-04T06:00:00Z",
});

function arranged() {
    const repo = new FakeCardRepository();
    const id = repo.seed({ userId: "u1", name: "NU" });
    repo.entries.set(id, [september, shared, payment]);
    return { repo, id };
}

describe("FakeCardRepository per-month reads (parity)", () => {
    it("sums only the month's own charges and payments", async () => {
        const { repo } = arranged();

        const [sep] = await repo.listBalances("u1", "2026-09");
        const [oct] = await repo.listBalances("u1", "2026-10");
        const [nov] = await repo.listBalances("u1", "2026-11");

        expect(sep).toMatchObject({ charged: 830, paid: 0, redeemed: 0 });
        expect(oct).toMatchObject({ charged: 1300, paid: 416, redeemed: 0 });
        expect(nov).toMatchObject({ charged: 0, paid: 0, redeemed: 0 });
    });

    it("lists only the month's own entries in the history", async () => {
        const { repo, id } = arranged();

        expect(await repo.getHistory("u1", id, "2026-09")).toEqual([september]);
        expect(await repo.getHistory("u1", id, "2026-10")).toEqual([
            shared,
            payment,
        ]);
        expect(await repo.getHistory("u1", id, "2026-11")).toEqual([]);
    });

    it("files a row at a month's start by its CDMX date", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1" });
        repo.entries.set(id, [
            entry({
                id: "a",
                kind: "charge",
                amount: 70,
                date: "2026-10-01T05:59:59Z",
            }),
            entry({
                id: "b",
                kind: "charge",
                amount: 30,
                date: "2026-10-01T06:00:00Z",
            }),
        ]);

        const [sep] = await repo.listBalances("u1", "2026-09");
        const [oct] = await repo.listBalances("u1", "2026-10");

        expect(sep?.charged).toBe(70);
        expect(oct?.charged).toBe(30);
    });

    it("reads zeros and no history for a card with nothing arranged", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1" });

        const [row] = await repo.listBalances("u1", "2026-10");

        expect(row).toMatchObject({ charged: 0, paid: 0, redeemed: 0 });
        expect(await repo.getHistory("u1", id, "2026-10")).toEqual([]);
    });
});
