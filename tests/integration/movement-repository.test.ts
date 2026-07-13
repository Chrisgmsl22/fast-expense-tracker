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
    fundedByPartner: false,
    note: null,
    ...over,
});

describe("PrismaMovementRepository (integration)", () => {
    it("getForMonth excludes gf_fronted (settlement-only, never in the feed)", async () => {
        const user = await seedUser();
        await repo.insert(user.id, write({ type: "gf_paid", amount: 50 }));
        await repo.insert(user.id, write({ type: "card_payment", amount: 80 }));
        await repo.insert(
            user.id,
            write({ type: "gf_fronted", amount: 300, note: "she covered" }),
        );

        const rows = await repo.getForMonth(user.id, "2026-07");
        expect(rows).toHaveLength(2);
        expect(rows.some((r) => r.type === "gf_fronted")).toBe(false);
        expect(rows.map((r) => r.type).sort()).toEqual([
            "card_payment",
            "gf_paid",
        ]);
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
