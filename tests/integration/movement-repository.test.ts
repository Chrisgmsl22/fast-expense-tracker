import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import {
    PrismaMovementRepository,
    type MovementWriteData,
} from "@/lib/repositories/movement.repository";

const repo = new PrismaMovementRepository(db);

async function seedUser(email = "u@example.com") {
    return db.user.create({ data: { email, password: "x", name: "Test" } });
}

const write = (over: Partial<MovementWriteData> = {}): MovementWriteData => ({
    date: new Date("2026-07-10T06:00:00Z"),
    amount: 100,
    type: "gf_paid",
    cardId: null,
    note: null,
    ...over,
});

describe("PrismaMovementRepository (integration)", () => {
    it("getForMonth EXCLUDES gf_fronted, so a debt never reaches a feed", async () => {
        // A debt she fronted is settlement-only and provisional (spec 0007
        // §6b): it may shrink or vanish before money moves, so it must not sit
        // beside real spending. Filtered here, at the query, rather than hidden
        // at render — a row that never arrives cannot be forgotten by a view.
        const user = await seedUser();
        await repo.insert(user.id, write({ type: "gf_paid", amount: 50 }));
        await repo.insert(user.id, write({ type: "card_payment", amount: 80 }));
        const debt = await repo.insert(
            user.id,
            write({ type: "gf_fronted", amount: 300, note: "she covered" }),
        );

        const rows = await repo.getForMonth(user.id, "2026-07");
        expect(rows).toHaveLength(2);
        expect(rows.map((r) => r.type).sort()).toEqual([
            "card_payment",
            "gf_paid",
        ]);
        // Filtered from the feed, NOT deleted: the settlement page still reads
        // it through its own repository.
        expect(await repo.getById(user.id, debt.id)).toMatchObject({
            type: "gf_fronted",
            amount: 300,
        });
    });

    it("getForMonth still scopes to the owner and the month", async () => {
        // Uses `gf_paid`, since `gf_fronted` is filtered out entirely now and
        // would make this pass for the wrong reason.
        const owner = await seedUser("owner@example.com");
        const other = await seedUser("other@example.com");
        await repo.insert(owner.id, write({ type: "gf_paid", amount: 300 }));
        await repo.insert(
            owner.id,
            write({
                type: "gf_paid",
                amount: 400,
                date: new Date("2026-08-02T06:00:00Z"),
            }),
        );
        await repo.insert(other.id, write({ type: "gf_paid", amount: 900 }));

        const rows = await repo.getForMonth(owner.id, "2026-07");
        expect(rows.map((r) => r.amount)).toEqual([300]);
    });

    it("getById returns the owner's movement and null for another user (IDOR)", async () => {
        const owner = await seedUser("owner@example.com");
        const other = await seedUser("other@example.com");
        const { id } = await repo.insert(
            owner.id,
            write({ type: "gf_fronted", amount: 300, note: "n" }),
        );

        const mine = await repo.getById(owner.id, id);
        expect(mine).toMatchObject({ id, type: "gf_fronted", amount: 300 });
        expect(await repo.getById(other.id, id)).toBeNull();
    });

    it("updateForUser mutates the owner's row but not another user's (IDOR)", async () => {
        const owner = await seedUser("owner@example.com");
        const other = await seedUser("other@example.com");
        const { id } = await repo.insert(
            owner.id,
            write({ type: "gf_fronted", amount: 300 }),
        );

        expect(
            await repo.updateForUser(
                id,
                other.id,
                write({ type: "gf_fronted", amount: 999 }),
            ),
        ).toBe(0);
        expect(
            await repo.updateForUser(
                id,
                owner.id,
                write({ type: "gf_fronted", amount: 680, note: "fixed" }),
            ),
        ).toBe(1);

        const updated = await repo.getById(owner.id, id);
        expect(updated).toMatchObject({ amount: 680, note: "fixed" });
    });
});
