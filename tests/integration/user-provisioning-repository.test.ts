import { describe, it, expect, beforeEach } from "vitest";

import { db } from "@/lib/db";
import { CASH_COLOR } from "@/lib/palette";
import {
    CASH_CARD_NAME,
    STARTER_CATEGORIES,
    type StarterCard,
} from "@/lib/domain/starter-kit";
import { PrismaUserProvisioningRepository } from "@/lib/repositories/user-provisioning.repository";

// The starter kit against a real Postgres (ADR-0004): what a fresh account
// receives, that it stays isolated from other accounts, and that re-provisioning
// is idempotent. The pure default set is asserted in tests/unit/starter-kit.test.ts.

const repository = new PrismaUserProvisioningRepository(db);

const STARTER_SUBCATEGORY_COUNT = STARTER_CATEGORIES.reduce(
    (total, category) => total + category.subcategories.length,
    0,
);

let seq = 0;
async function createUser() {
    seq += 1;
    return db.user.create({
        data: { email: `p${seq}@example.com`, password: "x", name: "Test" },
    });
}

describe("provisionNewUser — a freshly provisioned account", () => {
    let userId: string;

    beforeEach(async () => {
        const user = await createUser();
        userId = user.id;
        await repository.provisionNewUser(userId);
    });

    it("gets all 13 starter categories with their reference values", async () => {
        const categories = await db.category.findMany({ where: { userId } });

        expect(categories).toHaveLength(STARTER_CATEGORIES.length);
        const bySlug = new Map(categories.map((c) => [c.slug, c]));
        for (const starter of STARTER_CATEGORIES) {
            expect(bySlug.get(starter.slug)).toMatchObject({
                userId,
                name: starter.name,
                color: starter.color,
                isRelevant: starter.isRelevant,
                isSystemCategory: true,
            });
        }
    });

    it("gets every starter subcategory, linked to its own category", async () => {
        const subcategories = await db.subcategory.findMany({
            where: { userId },
            include: { category: { select: { slug: true, userId: true } } },
        });

        expect(subcategories).toHaveLength(STARTER_SUBCATEGORY_COUNT);
        for (const starter of STARTER_CATEGORIES) {
            const names = subcategories
                .filter((s) => s.category.slug === starter.slug)
                .map((s) => s.name)
                .sort();
            expect(names).toEqual([...starter.subcategories].sort());
        }
        // Every subcategory hangs off a category owned by the same user.
        expect(subcategories.every((s) => s.category.userId === userId)).toBe(
            true,
        );
    });

    it("gets the required Cash card (the UI cannot add one — CHORE-6.c)", async () => {
        const cards = await db.card.findMany({ where: { userId } });

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({
            name: CASH_CARD_NAME,
            color: CASH_COLOR,
            type: "cash",
            archivedAt: null,
        });
    });

    it("gets a Solo settings row", async () => {
        const settings = await db.settings.findUnique({ where: { userId } });

        expect(settings).toMatchObject({
            sharesExpenses: false,
            partnerName: null,
        });
    });

    it("reports what it wrote", async () => {
        const other = await createUser();
        const summary = await repository.provisionNewUser(other.id);

        expect(summary).toEqual({
            categoriesUpserted: STARTER_CATEGORIES.length,
            subcategoriesCreated: STARTER_SUBCATEGORY_COUNT,
            cardsCreated: 1,
            settingsCreated: true,
        });
    });
});

describe("provisionNewUser — isolation between accounts (ADR-0022)", () => {
    it("gives each user their own copy of every category", async () => {
        const alice = await createUser();
        const bob = await createUser();
        await repository.provisionNewUser(alice.id);
        await repository.provisionNewUser(bob.id);

        const aliceHousing = await db.category.findUnique({
            where: { userId_slug: { userId: alice.id, slug: "housing" } },
        });
        const bobHousing = await db.category.findUnique({
            where: { userId_slug: { userId: bob.id, slug: "housing" } },
        });

        expect(aliceHousing?.id).toBeDefined();
        expect(bobHousing?.id).toBeDefined();
        expect(aliceHousing?.id).not.toBe(bobHousing?.id);
    });

    it("keeps one user's edits invisible to the other", async () => {
        const alice = await createUser();
        const bob = await createUser();
        await repository.provisionNewUser(alice.id);
        await repository.provisionNewUser(bob.id);

        await db.category.update({
            where: { userId_slug: { userId: alice.id, slug: "groceries" } },
            data: { name: "Food", color: "#111111", monthlyBudget: 4200 },
        });

        const bobGroceries = await db.category.findUnique({
            where: { userId_slug: { userId: bob.id, slug: "groceries" } },
        });
        expect(bobGroceries).toMatchObject({
            name: "Groceries",
            monthlyBudget: null,
        });
        expect(bobGroceries?.color).not.toBe("#111111");
    });

    it("scopes subcategories and cards to their owner", async () => {
        const alice = await createUser();
        const bob = await createUser();
        await repository.provisionNewUser(alice.id);
        await repository.provisionNewUser(bob.id);

        const [aliceSubs, bobSubs] = await Promise.all([
            db.subcategory.count({ where: { userId: alice.id } }),
            db.subcategory.count({ where: { userId: bob.id } }),
        ]);
        expect(aliceSubs).toBe(STARTER_SUBCATEGORY_COUNT);
        expect(bobSubs).toBe(STARTER_SUBCATEGORY_COUNT);

        const bobCards = await db.card.findMany({
            where: { userId: bob.id },
            select: { userId: true },
        });
        expect(bobCards).toHaveLength(1);
        expect(bobCards.every((c) => c.userId === bob.id)).toBe(true);
    });

    it("provisioning a second user adds nothing to the first", async () => {
        const alice = await createUser();
        await repository.provisionNewUser(alice.id);
        const before = await db.category.count({ where: { userId: alice.id } });

        const bob = await createUser();
        await repository.provisionNewUser(bob.id);

        expect(await db.category.count({ where: { userId: alice.id } })).toBe(
            before,
        );
    });
});

describe("provisionNewUser — re-provisioning the same account", () => {
    it("creates no duplicates and reports nothing new", async () => {
        const user = await createUser();
        await repository.provisionNewUser(user.id);

        const summary = await repository.provisionNewUser(user.id);

        expect(summary).toEqual({
            categoriesUpserted: STARTER_CATEGORIES.length,
            subcategoriesCreated: 0,
            cardsCreated: 0,
            settingsCreated: false,
        });
        expect(await db.category.count({ where: { userId: user.id } })).toBe(
            STARTER_CATEGORIES.length,
        );
        expect(await db.subcategory.count({ where: { userId: user.id } })).toBe(
            STARTER_SUBCATEGORY_COUNT,
        );
        expect(await db.card.count({ where: { userId: user.id } })).toBe(1);
        expect(await db.settings.count({ where: { userId: user.id } })).toBe(1);
    });

    it("restores only the starter subcategory that went missing", async () => {
        // The middle of the batched set-diff: neither all-missing (a fresh
        // account) nor none-missing (the test above). A bug in the seen/missing
        // partition would pass both extremes but fail here.
        const user = await createUser();
        await repository.provisionNewUser(user.id);
        const housing = await db.category.findUniqueOrThrow({
            where: { userId_slug: { userId: user.id, slug: "housing" } },
        });
        await db.subcategory.deleteMany({
            where: { userId: user.id, categoryId: housing.id, name: "Rent" },
        });
        expect(await db.subcategory.count({ where: { userId: user.id } })).toBe(
            STARTER_SUBCATEGORY_COUNT - 1,
        );

        const summary = await repository.provisionNewUser(user.id);

        expect(summary.subcategoriesCreated).toBe(1);
        // The restored row is specifically Rent-under-Housing, and nothing else
        // was duplicated along the way.
        const rent = await db.subcategory.findMany({
            where: { userId: user.id, categoryId: housing.id, name: "Rent" },
        });
        expect(rent).toHaveLength(1);
        expect(await db.subcategory.count({ where: { userId: user.id } })).toBe(
            STARTER_SUBCATEGORY_COUNT,
        );
    });

    it("keeps the user's own subcategories and cards", async () => {
        const user = await createUser();
        await repository.provisionNewUser(user.id);
        const housing = await db.category.findUniqueOrThrow({
            where: { userId_slug: { userId: user.id, slug: "housing" } },
        });
        await db.subcategory.create({
            data: { userId: user.id, categoryId: housing.id, name: "Cleaning" },
        });
        await db.card.create({
            data: {
                userId: user.id,
                name: "My Bank",
                color: "#123456",
                type: "debit",
            },
        });

        await repository.provisionNewUser(user.id);

        const names = await db.subcategory.findMany({
            where: { userId: user.id, categoryId: housing.id },
            select: { name: true },
        });
        expect(names.map((n) => n.name)).toContain("Cleaning");
        const myBank = await db.card.findFirst({
            where: { userId: user.id, name: "My Bank" },
        });
        expect(myBank).toMatchObject({ color: "#123456", type: "debit" });
    });

    it("restores the starter defaults on the system categories", async () => {
        // Documents the deliberate refresh-on-re-run behavior inherited from the
        // seed: re-provisioning propagates reference corrections. Revisit when
        // CHORE-8.c lets users rename/recolor their own categories.
        const user = await createUser();
        await repository.provisionNewUser(user.id);
        await db.category.update({
            where: { userId_slug: { userId: user.id, slug: "savings" } },
            data: { name: "Stash", color: "#000000", isRelevant: false },
        });

        await repository.provisionNewUser(user.id);

        const savings = await db.category.findUniqueOrThrow({
            where: { userId_slug: { userId: user.id, slug: "savings" } },
        });
        expect(savings).toMatchObject({
            name: "Savings",
            color: "#0d9488",
            isRelevant: true,
        });
    });

    it("never overwrites settings the user has changed", async () => {
        const user = await createUser();
        await repository.provisionNewUser(user.id);
        await db.settings.update({
            where: { userId: user.id },
            data: { sharesExpenses: true, partnerName: "Sam" },
        });

        await repository.provisionNewUser(user.id);

        expect(
            await db.settings.findUnique({ where: { userId: user.id } }),
        ).toMatchObject({ sharesExpenses: true, partnerName: "Sam" });
    });
});

describe("ensureCards", () => {
    const extras: readonly StarterCard[] = [
        { name: "Amex Gold", color: "#ca8a04", type: "credit" },
        { name: "BBVA", color: "#2563eb", type: "debit" },
    ];

    it("creates the missing cards and returns how many", async () => {
        const user = await createUser();

        const created = await repository.ensureCards(user.id, extras);

        expect(created).toBe(2);
        const cards = await db.card.findMany({
            where: { userId: user.id },
            orderBy: { name: "asc" },
        });
        expect(cards.map((c) => c.name)).toEqual(["Amex Gold", "BBVA"]);
        expect(cards.every((c) => c.userId === user.id)).toBe(true);
    });

    it("refreshes color and type on cards that already exist", async () => {
        const user = await createUser();
        await db.card.create({
            data: {
                userId: user.id,
                name: "Amex Gold",
                color: "#ffffff",
                type: "debit",
            },
        });

        const created = await repository.ensureCards(user.id, extras);

        expect(created).toBe(1); // only BBVA was missing
        const gold = await db.card.findFirstOrThrow({
            where: { userId: user.id, name: "Amex Gold" },
        });
        expect(gold).toMatchObject({ color: "#ca8a04", type: "credit" });
        expect(await db.card.count({ where: { userId: user.id } })).toBe(2);
    });

    it("never touches another user's card of the same name", async () => {
        const alice = await createUser();
        const bob = await createUser();
        const bobsGold = await db.card.create({
            data: {
                userId: bob.id,
                name: "Amex Gold",
                color: "#ffffff",
                type: "debit",
            },
        });

        await repository.ensureCards(alice.id, extras);

        expect(
            await db.card.findUniqueOrThrow({ where: { id: bobsGold.id } }),
        ).toMatchObject({ color: "#ffffff", type: "debit" });
        expect(await db.card.count({ where: { userId: bob.id } })).toBe(1);
    });

    it("is a no-op for an empty list", async () => {
        const user = await createUser();

        expect(await repository.ensureCards(user.id, [])).toBe(0);
        expect(await db.card.count({ where: { userId: user.id } })).toBe(0);
    });
});
