import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PARTNER_PAYMENT_SUBCATEGORY_NAME } from "@/lib/domain/expense";
import { runSeed } from "@/prisma/seed";
import { replayMigration } from "@/tests/support/replay-migration";

/**
 * Spec 0007 §6a — "Purchases made by girlfriend" → "Covered for me", and the trap
 * that comes with it.
 *
 * The seed matches subcategories BY NAME. So renaming the starter kit without
 * migrating the existing row does not rename anything: the next provision finds no
 * "Covered for me", creates one, and leaves the old row — with every expense still
 * attached — sitting beside the new one. That is a duplicate, not a rename, and it
 * is why PR #74 reverted the stored name until this migration could carry both.
 *
 * Every test replays the real migration file, and each seeds an OLD-named row
 * first, so the `UPDATE` under test actually has work to do.
 */
const MIGRATION = "20260916230000_convert_partner_payments";
const OLD_NAME = "Purchases made by girlfriend";
const NEW_NAME = PARTNER_PAYMENT_SUBCATEGORY_NAME;

const seedOptions = {
    adminEmail: "rename@example.com",
    adminPassword: "test-secret",
};

async function combinedSubcategories(userId: string) {
    return db.subcategory.findMany({
        where: { userId, category: { slug: "combined-expenses" } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });
}

/** A user with a `combined-expenses` category holding the pre-rename row. */
async function seedLegacyUser(email: string) {
    const user = await db.user.create({
        data: { email, password: "x", name: "T" },
    });
    const category = await db.category.create({
        data: {
            userId: user.id,
            slug: "combined-expenses",
            name: "Combined Expenses",
        },
    });
    const subcategory = await db.subcategory.create({
        data: { userId: user.id, categoryId: category.id, name: OLD_NAME },
    });
    return { user, category, subcategory };
}

describe("the partner-payment subcategory rename (spec 0007 §6a)", () => {
    it("is the name the code looks up", () => {
        // The three-part flip: rows, constant, seed. If this drifts, the other
        // tests here pass while the app files payments with a null subcategory.
        expect(NEW_NAME).toBe("Covered for me");
    });

    it("renames the existing row in place, keeping its expenses attached", async () => {
        const { user, category, subcategory } =
            await seedLegacyUser("legacy@example.com");
        const expense = await db.expense.create({
            data: {
                userId: user.id,
                categoryId: category.id,
                subcategoryId: subcategory.id,
                date: new Date("2026-09-10T12:00:00Z"),
                description: "Sushi",
                amount: 680,
                actualExpenditure: 680,
            },
        });

        await replayMigration(MIGRATION);

        const after = await db.subcategory.findUniqueOrThrow({
            where: { id: subcategory.id },
        });
        // The same row, renamed — not a new one beside the old.
        expect(after.name).toBe(NEW_NAME);
        expect(await combinedSubcategories(user.id)).toHaveLength(1);
        const kept = await db.expense.findUniqueOrThrow({
            where: { id: expense.id },
        });
        expect(kept.subcategoryId).toBe(subcategory.id);
    });

    it("leaves a same-named row under any other category alone", async () => {
        // The statement matches by name — it has no id to match on — so the
        // `combined-expenses` scope is the only thing between it and a row the
        // user filed elsewhere, or named that himself.
        const { user, subcategory } =
            await seedLegacyUser("scoped@example.com");
        const other = await db.category.create({
            data: { userId: user.id, slug: "food", name: "Food" },
        });
        const elsewhere = await db.subcategory.create({
            data: { userId: user.id, categoryId: other.id, name: OLD_NAME },
        });

        await replayMigration(MIGRATION);

        expect(
            (
                await db.subcategory.findUniqueOrThrow({
                    where: { id: subcategory.id },
                })
            ).name,
        ).toBe(NEW_NAME);
        expect(
            (
                await db.subcategory.findUniqueOrThrow({
                    where: { id: elsewhere.id },
                })
            ).name,
        ).toBe(OLD_NAME);
    });

    it("is a no-op on a replay", async () => {
        const { user, subcategory } = await seedLegacyUser("twice@example.com");

        await replayMigration(MIGRATION);
        await replayMigration(MIGRATION);

        expect(await combinedSubcategories(user.id)).toEqual([
            { id: subcategory.id, name: NEW_NAME },
        ]);
    });

    it("never renames into a row that already carries the new name", async () => {
        const { user, category, subcategory } = await seedLegacyUser(
            "collide@example.com",
        );
        const existing = await db.subcategory.create({
            data: { userId: user.id, categoryId: category.id, name: NEW_NAME },
        });

        await replayMigration(MIGRATION);

        const rows = await combinedSubcategories(user.id);
        // The guard left the old row alone rather than producing two rows with
        // the same name — the duplicate this whole exercise exists to avoid.
        expect(rows.map((r) => r.name)).toEqual([NEW_NAME, OLD_NAME]);
        expect(rows.find((r) => r.name === NEW_NAME)!.id).toBe(existing.id);
        expect(rows.find((r) => r.name === OLD_NAME)!.id).toBe(subcategory.id);
    });

    it("re-provisioning after the rename adds no duplicate", async () => {
        // The live sequence: an account provisioned before the rename, then
        // migrated, then provisioned again by a later deploy.
        await runSeed(db, seedOptions);
        const user = await db.user.findUniqueOrThrow({
            where: { email: seedOptions.adminEmail },
        });
        const combined = await db.category.findFirstOrThrow({
            where: { userId: user.id, slug: "combined-expenses" },
        });
        // Put the pre-rename name back, as a real legacy database has it.
        const covered = await db.subcategory.findFirstOrThrow({
            where: { userId: user.id, categoryId: combined.id, name: NEW_NAME },
        });
        await db.subcategory.update({
            where: { id: covered.id },
            data: { name: OLD_NAME },
        });

        await replayMigration(MIGRATION);
        await runSeed(db, seedOptions);

        const names = (await combinedSubcategories(user.id)).map((s) => s.name);
        expect(names.filter((n) => n === NEW_NAME)).toHaveLength(1);
        expect(names).not.toContain(OLD_NAME);
        // The same row throughout — the seed created no second one.
        const after = await db.subcategory.findUniqueOrThrow({
            where: { id: covered.id },
        });
        expect(after.name).toBe(NEW_NAME);
    });

    it("provisions a fresh account with the new name and no legacy row", async () => {
        await runSeed(db, seedOptions);
        await runSeed(db, seedOptions);

        const user = await db.user.findUniqueOrThrow({
            where: { email: seedOptions.adminEmail },
        });
        const names = (await combinedSubcategories(user.id)).map((s) => s.name);

        expect(names.filter((n) => n === NEW_NAME)).toHaveLength(1);
        expect(names).not.toContain(OLD_NAME);
    });
});
