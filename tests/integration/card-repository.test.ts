import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PrismaCardRepository } from "@/lib/repositories/card.repository";

const repo = new PrismaCardRepository(db);

let userSeq = 0;
async function seedUser() {
    userSeq += 1;
    return db.user.create({
        data: {
            email: `card-user-${userSeq}@example.com`,
            password: "x",
            name: "Test",
        },
    });
}

async function seedCategory(slug = `cat-${Math.random()}`) {
    return db.category.create({ data: { slug, name: slug } });
}

async function seedCard(
    userId: string,
    over: Partial<{
        name: string;
        color: string;
        type: string;
        archivedAt: Date | null;
    }> = {},
) {
    return db.card.create({
        data: {
            userId,
            name: over.name ?? "Card",
            color: over.color ?? "#6b7280",
            type: over.type ?? "credit",
            archivedAt: over.archivedAt ?? null,
        },
    });
}

describe("PrismaCardRepository (integration)", () => {
    it("create → listForSettings returns the active card, not in use", async () => {
        const user = await seedUser();
        await repo.create(user.id, {
            name: "NU",
            type: "credit",
            color: "#9333ea",
        });

        const rows = await repo.listForSettings(user.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            name: "NU",
            type: "credit",
            color: "#9333ea",
            archivedAt: null,
            inUse: false,
        });
    });

    it("orders active cards first, then archived, each alphabetically", async () => {
        const user = await seedUser();
        await seedCard(user.id, { name: "Zed" });
        await seedCard(user.id, { name: "Alpha" });
        await seedCard(user.id, { name: "Old", archivedAt: new Date() });

        const names = (await repo.listForSettings(user.id)).map((c) => c.name);
        expect(names).toEqual(["Alpha", "Zed", "Old"]);
    });

    it("countActive ignores archived cards", async () => {
        const user = await seedUser();
        await seedCard(user.id, { name: "A" });
        await seedCard(user.id, { name: "B", archivedAt: new Date() });

        expect(await repo.countActive(user.id)).toBe(1);
    });

    it("archiveForUser hides the card from countActive but keeps the row", async () => {
        const user = await seedUser();
        const card = await seedCard(user.id, { name: "A" });

        expect(await repo.archiveForUser(user.id, card.id)).toBe(1);
        expect(await repo.countActive(user.id)).toBe(0);
        const rows = await repo.listForSettings(user.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.archivedAt).not.toBeNull();
    });

    it("archiveForUser is a no-op on an already-archived card", async () => {
        const user = await seedUser();
        const card = await seedCard(user.id, { archivedAt: new Date() });
        expect(await repo.archiveForUser(user.id, card.id)).toBe(0);
    });

    it("findActiveByName matches case-insensitively, excluding archived", async () => {
        const user = await seedUser();
        const active = await seedCard(user.id, { name: "BBVA" });
        await seedCard(user.id, { name: "Old BBVA", archivedAt: new Date() });

        expect(await repo.findActiveByName(user.id, "bbva")).toEqual({
            id: active.id,
        });
        expect(await repo.findActiveByName(user.id, "nope")).toBeNull();
    });

    it("updateForUser is scoped to the owner (IDOR guard)", async () => {
        const owner = await seedUser();
        const other = await seedUser();
        const card = await seedCard(owner.id, { name: "Mine" });

        // Another user can't touch it — count 0, no mutation.
        expect(
            await repo.updateForUser(other.id, card.id, {
                name: "Hacked",
                color: "#000000",
            }),
        ).toBe(0);
        // The owner can.
        expect(
            await repo.updateForUser(owner.id, card.id, {
                name: "Renamed",
                color: "#111111",
            }),
        ).toBe(1);
        const rows = await repo.listForSettings(owner.id);
        expect(rows[0]?.name).toBe("Renamed");
    });

    it("referenceCount and inUse reflect attached expenses and movements", async () => {
        const user = await seedUser();
        const category = await seedCategory();
        const card = await seedCard(user.id, { name: "Used" });

        expect(await repo.referenceCount(user.id, card.id)).toBe(0);

        await db.expense.create({
            data: {
                userId: user.id,
                categoryId: category.id,
                cardId: card.id,
                date: new Date("2026-06-01T12:00:00Z"),
                description: "x",
                amount: 100,
                actualExpenditure: 100,
            },
        });
        await db.movement.create({
            data: {
                userId: user.id,
                cardId: card.id,
                date: new Date("2026-06-02T12:00:00Z"),
                amount: 50,
                type: "card_payment",
            },
        });

        expect(await repo.referenceCount(user.id, card.id)).toBe(2);
        const rows = await repo.listForSettings(user.id);
        expect(rows[0]?.inUse).toBe(true);
    });

    it("deleteForUser is refused at the DB (FK RESTRICT) when an expense references the card", async () => {
        const user = await seedUser();
        const category = await seedCategory();
        const card = await seedCard(user.id, { name: "Referenced" });
        await db.expense.create({
            data: {
                userId: user.id,
                categoryId: category.id,
                cardId: card.id,
                date: new Date("2026-06-01T12:00:00Z"),
                description: "x",
                amount: 100,
                actualExpenditure: 100,
            },
        });

        // The Card→Expense FK has no cascade/set-null, so Postgres RESTRICTs the
        // delete. This is the DB-level backstop behind the action's ref re-check.
        await expect(repo.deleteForUser(user.id, card.id)).rejects.toThrow();
        // The card row survives the refused delete.
        const rows = await repo.listForSettings(user.id);
        expect(rows.map((c) => c.id)).toContain(card.id);
    });

    it("deleteForUser removes a zero-ref card, scoped to the owner", async () => {
        const owner = await seedUser();
        const other = await seedUser();
        const card = await seedCard(owner.id, { name: "Temp" });

        expect(await repo.deleteForUser(other.id, card.id)).toBe(0);
        expect(await repo.deleteForUser(owner.id, card.id)).toBe(1);
        expect(await repo.listForSettings(owner.id)).toHaveLength(0);
    });

    it("isCash is true only for the owner's cash card", async () => {
        const owner = await seedUser();
        const other = await seedUser();
        const cash = await seedCard(owner.id, { name: "Cash", type: "cash" });
        const credit = await seedCard(owner.id, { name: "CC", type: "credit" });

        expect(await repo.isCash(owner.id, cash.id)).toBe(true);
        expect(await repo.isCash(owner.id, credit.id)).toBe(false);
        expect(await repo.isCash(other.id, cash.id)).toBe(false);
    });
});
