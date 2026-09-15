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
    it("getForMonth includes gf_fronted, with its note, so a debt shows in the feed", async () => {
        const user = await seedUser();
        await repo.insert(user.id, write({ type: "gf_paid", amount: 50 }));
        await repo.insert(user.id, write({ type: "card_payment", amount: 80 }));
        await repo.insert(
            user.id,
            write({ type: "gf_fronted", amount: 300, note: "she covered" }),
        );

        const rows = await repo.getForMonth(user.id, "2026-07");
        expect(rows).toHaveLength(3);
        expect(rows.map((r) => r.type).sort()).toEqual([
            "card_payment",
            "gf_fronted",
            "gf_paid",
        ]);
        // The note carries through — the feed row uses it as the description.
        expect(rows.find((r) => r.type === "gf_fronted")).toMatchObject({
            amount: 300,
            note: "she covered",
        });
    });

    it("getForMonth still scopes to the owner and the month", async () => {
        const owner = await seedUser("owner@example.com");
        const other = await seedUser("other@example.com");
        await repo.insert(owner.id, write({ type: "gf_fronted", amount: 300 }));
        await repo.insert(
            owner.id,
            write({
                type: "gf_fronted",
                amount: 400,
                date: new Date("2026-08-02T06:00:00Z"),
            }),
        );
        await repo.insert(other.id, write({ type: "gf_fronted", amount: 900 }));

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

    describe("fundedFrom (spec 0007 §3.1)", () => {
        it("defaults to income when the write omits it — every pre-existing row's behaviour", async () => {
            const user = await seedUser();
            const { id } = await repo.insert(user.id, write());

            expect(await repo.getById(user.id, id)).toMatchObject({
                fundedFrom: "income",
            });
            const [row] = await repo.getForMonth(user.id, "2026-07");
            expect(row!.fundedFrom).toBe("income");
        });

        it("round-trips savings on a transfer", async () => {
            const user = await seedUser();
            const { id } = await repo.insert(
                user.id,
                write({ amount: 8000, fundedFrom: "savings" }),
            );

            expect(await repo.getById(user.id, id)).toMatchObject({
                fundedFrom: "savings",
            });
        });

        it("reads an unrecognised stored value as income, so no money vanishes", async () => {
            // The column is plain TEXT. A value no read knows must fall back to
            // the COUNTED default rather than silently leaving the figures.
            const user = await seedUser();
            const { id } = await repo.insert(user.id, write());
            await db.movement.update({
                where: { id },
                data: { fundedFrom: "reimbursed" },
            });

            expect(await repo.getById(user.id, id)).toMatchObject({
                fundedFrom: "income",
            });
        });
    });
});
