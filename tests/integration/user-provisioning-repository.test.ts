import type { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PARTNER_PAYMENT_SUBCATEGORY_NAME } from "@/lib/domain/expense";
import { STARTER_CATEGORIES } from "@/lib/domain/starter-kit";
import { CASH_COLOR } from "@/lib/palette";
import {
    EmailTakenError,
    PrismaUserProvisioningRepository,
} from "@/lib/repositories/user-provisioning.repository";
import { STARTER_SUBCATEGORY_COUNT } from "@/tests/support/fake-user-provisioning-repository";

const repo = new PrismaUserProvisioningRepository(db);

let userSeq = 0;
async function createUser() {
    userSeq += 1;
    return db.user.create({
        data: {
            email: `provision-${userSeq}@example.com`,
            password: "x",
            name: "Test",
        },
    });
}

/** Every row provisioning can write for `userId`, in a stable order. */
async function snapshot(userId: string) {
    return {
        categories: await db.category.findMany({
            where: { userId },
            orderBy: { slug: "asc" },
        }),
        subcategories: await db.subcategory.findMany({
            where: { userId },
            orderBy: [{ categoryId: "asc" }, { name: "asc" }],
        }),
        cards: await db.card.findMany({
            where: { userId },
            orderBy: { name: "asc" },
        }),
        settings: await db.settings.findMany({ where: { userId } }),
    };
}

/** A client whose transaction fails at `model`'s `createMany`, after the earlier writes ran. */
function failingAt(model: "subcategory" | "settings"): PrismaClient {
    return new Proxy(db, {
        get(target, prop) {
            if (prop !== "$transaction") return Reflect.get(target, prop);
            return (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
                target.$transaction((tx) =>
                    fn(
                        new Proxy(tx, {
                            get(t, p) {
                                const delegate = Reflect.get(t, p);
                                if (p !== model) return delegate;
                                return new Proxy(delegate, {
                                    get(d, method) {
                                        if (method !== "createMany") {
                                            return Reflect.get(d, method);
                                        }
                                        return () =>
                                            Promise.reject(
                                                new Error("injected"),
                                            );
                                    },
                                });
                            },
                        }),
                    ),
                );
        },
    });
}

describe("PrismaUserProvisioningRepository.provisionNewUser", () => {
    it("Should give a new user the full starter set and report it", async () => {
        const user = await createUser();

        const summary = await repo.provisionNewUser(user.id);

        expect(summary).toEqual({
            categoriesCreated: 13,
            subcategoriesCreated: STARTER_SUBCATEGORY_COUNT,
            cardsCreated: 1,
            settingsCreated: true,
        });
        const rows = await db.category.findMany({
            where: { userId: user.id },
            include: { subcategories: { select: { name: true } } },
        });
        expect(rows).toHaveLength(13);
        for (const starter of STARTER_CATEGORIES) {
            const row = rows.find((r) => r.slug === starter.slug);
            expect(row).toMatchObject({
                name: starter.name,
                color: starter.color,
                isRelevant: starter.isRelevant,
                isSystemCategory: true,
                monthlyBudget: null,
            });
            expect(row!.subcategories.map((s) => s.name).sort()).toEqual(
                [...starter.subcategories].sort(),
            );
        }
        expect(
            rows
                .find((r) => r.slug === "combined-expenses")!
                .subcategories.map((s) => s.name),
        ).toContain(PARTNER_PAYMENT_SUBCATEGORY_NAME);
    });

    it("Should create exactly one Cash card and a Solo settings row with a 50% split", async () => {
        const user = await createUser();

        await repo.provisionNewUser(user.id);

        const cards = await db.card.findMany({ where: { userId: user.id } });
        expect(cards).toEqual([
            expect.objectContaining({
                name: "Cash",
                type: "cash",
                color: CASH_COLOR,
                archivedAt: null,
            }),
        ]);
        const settings = await db.settings.findUniqueOrThrow({
            where: { userId: user.id },
        });
        expect(settings).toMatchObject({
            sharesExpenses: false,
            partnerName: null,
            defaultSharePercentage: 0.5,
        });
    });

    it("Should write no income, expense or movement rows", async () => {
        const user = await createUser();

        await repo.provisionNewUser(user.id);

        expect(await db.income.count()).toBe(0);
        expect(await db.expense.count()).toBe(0);
        expect(await db.movement.count()).toBe(0);
        expect(await db.categoryBudget.count()).toBe(0);
    });

    it("Should leave a first user's rows untouched when a second user is provisioned", async () => {
        const first = await createUser();
        const second = await createUser();
        await repo.provisionNewUser(first.id);
        const before = await snapshot(first.id);

        await repo.provisionNewUser(second.id);

        expect(await snapshot(first.id)).toEqual(before);
        const theirs = await snapshot(second.id);
        expect(theirs.categories).toHaveLength(13);
        expect(theirs.subcategories).toHaveLength(STARTER_SUBCATEGORY_COUNT);
        // Each user's subcategories hang off their own categories only.
        const secondCategoryIds = new Set(theirs.categories.map((c) => c.id));
        expect(
            theirs.subcategories.every((s) =>
                secondCategoryIds.has(s.categoryId),
            ),
        ).toBe(true);
        expect(before.categories.some((c) => secondCategoryIds.has(c.id))).toBe(
            false,
        );
    });

    it("Should create nothing on a second run", async () => {
        const user = await createUser();
        await repo.provisionNewUser(user.id);
        const before = await snapshot(user.id);

        const summary = await repo.provisionNewUser(user.id);

        expect(summary).toEqual({
            categoriesCreated: 0,
            subcategoriesCreated: 0,
            cardsCreated: 0,
            settingsCreated: false,
        });
        expect(await snapshot(user.id)).toEqual(before);
    });

    it("Should keep the user's own edits to a category, the Cash card and settings on a second run", async () => {
        const user = await createUser();
        await repo.provisionNewUser(user.id);
        const housing = await db.category.update({
            where: { userId_slug: { userId: user.id, slug: "housing" } },
            data: { name: "Home", color: "#123456", isRelevant: false },
        });
        await db.card.updateMany({
            where: { userId: user.id, type: "cash" },
            data: { name: "Efectivo" },
        });
        await db.settings.update({
            where: { userId: user.id },
            data: {
                sharesExpenses: true,
                partnerName: "Alex",
                defaultSharePercentage: 0.6,
            },
        });

        await repo.provisionNewUser(user.id);

        expect(
            await db.category.findUniqueOrThrow({ where: { id: housing.id } }),
        ).toMatchObject({ name: "Home", color: "#123456", isRelevant: false });
        const cards = await db.card.findMany({ where: { userId: user.id } });
        expect(cards.map((c) => c.name)).toEqual(["Efectivo"]);
        expect(
            await db.settings.findUniqueOrThrow({ where: { userId: user.id } }),
        ).toMatchObject({
            sharesExpenses: true,
            partnerName: "Alex",
            defaultSharePercentage: 0.6,
        });
    });

    it("Should keep a Settings row that existed before the first run", async () => {
        const user = await createUser();
        await db.settings.create({
            data: { userId: user.id, sharesExpenses: true, partnerName: "Sam" },
        });

        const summary = await repo.provisionNewUser(user.id);

        expect(summary.settingsCreated).toBe(false);
        expect(
            await db.settings.findUniqueOrThrow({ where: { userId: user.id } }),
        ).toMatchObject({
            sharesExpenses: true,
            partnerName: "Sam",
            defaultSharePercentage: 0.68,
        });
    });

    it("Should fill in only what a partly set-up user lacks", async () => {
        const user = await createUser();
        const housing = await db.category.create({
            data: {
                userId: user.id,
                slug: "housing",
                name: "Casa",
                color: "#abcdef",
            },
        });
        await db.subcategory.create({
            data: { userId: user.id, categoryId: housing.id, name: "Rent" },
        });
        await db.subcategory.create({
            data: { userId: user.id, categoryId: housing.id, name: "Garden" },
        });

        const summary = await repo.provisionNewUser(user.id);

        expect(summary.categoriesCreated).toBe(12);
        expect(summary.subcategoriesCreated).toBe(
            STARTER_SUBCATEGORY_COUNT - 1,
        );
        expect(
            await db.category.findUniqueOrThrow({ where: { id: housing.id } }),
        ).toMatchObject({ name: "Casa", color: "#abcdef" });
        const housingSubs = await db.subcategory.findMany({
            where: { categoryId: housing.id },
            select: { name: true },
        });
        expect(housingSubs.map((s) => s.name).sort()).toEqual(
            [
                "Garden",
                "House expenses",
                "Mortgage",
                "Rent",
                "Repairs/maintenance",
                "Tax/fees",
            ].sort(),
        );
    });

    it("Should roll back every write when one step fails", async () => {
        const user = await createUser();
        const failing = new PrismaUserProvisioningRepository(
            failingAt("settings"),
        );

        await expect(failing.provisionNewUser(user.id)).rejects.toThrow(
            "injected",
        );

        expect(await snapshot(user.id)).toEqual({
            categories: [],
            subcategories: [],
            cards: [],
            settings: [],
        });
    });

    it("Should write nothing for a user that does not exist", async () => {
        await expect(
            repo.provisionNewUser("00000000-0000-0000-0000-000000000000"),
        ).rejects.toThrow();

        expect(await db.category.count()).toBe(0);
        expect(await db.card.count()).toBe(0);
        expect(await db.settings.count()).toBe(0);
    });
});

const account = {
    name: "  Ana Example ",
    email: " Ana@Example.COM ",
    password: "invented-pass-123",
};

describe("PrismaUserProvisioningRepository.createUserWithStarterKit", () => {
    it("Should store a normalised email, a trimmed name and a cost-10 bcrypt hash", async () => {
        const { userId } = await repo.createUserWithStarterKit(account);

        const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
        expect(user.email).toBe("ana@example.com");
        expect(user.name).toBe("Ana Example");
        expect(user.password).not.toContain(account.password);
        expect(bcrypt.getRounds(user.password)).toBe(10);
        await expect(
            bcrypt.compare(account.password, user.password),
        ).resolves.toBe(true);
    });

    it("Should give the new user exactly the starter kit", async () => {
        const { userId } = await repo.createUserWithStarterKit(account);

        const mine = await snapshot(userId);
        expect(mine.categories).toHaveLength(STARTER_CATEGORIES.length);
        expect(mine.subcategories).toHaveLength(STARTER_SUBCATEGORY_COUNT);
        expect(mine.cards).toEqual([
            expect.objectContaining({ name: "Cash", type: "cash" }),
        ]);
        expect(mine.settings).toEqual([
            expect.objectContaining({
                sharesExpenses: false,
                partnerName: null,
                defaultSharePercentage: 0.5,
            }),
        ]);
        expect(await db.income.count()).toBe(0);
        expect(await db.expense.count()).toBe(0);
        expect(await db.movement.count()).toBe(0);
    });

    it("Should hold nothing of another user's and leave that user's rows untouched", async () => {
        const owner = await createUser();
        await repo.provisionNewUser(owner.id);
        await db.card.create({
            data: {
                userId: owner.id,
                name: "Invented Gold",
                color: "#c79a3b",
                type: "credit",
            },
        });
        const ownerBefore = await snapshot(owner.id);

        const { userId } = await repo.createUserWithStarterKit(account);

        expect(await snapshot(owner.id)).toEqual(ownerBefore);
        const mine = await snapshot(userId);
        const ownerIds = new Set(
            [
                ...ownerBefore.categories,
                ...ownerBefore.subcategories,
                ...ownerBefore.cards,
            ].map((row) => row.id),
        );
        expect(
            [...mine.categories, ...mine.subcategories, ...mine.cards].some(
                (row) => ownerIds.has(row.id),
            ),
        ).toBe(false);
        expect(mine.cards.map((c) => c.name)).toEqual(["Cash"]);
        const myCategoryIds = new Set(mine.categories.map((c) => c.id));
        expect(
            mine.subcategories.every((s) => myCategoryIds.has(s.categoryId)),
        ).toBe(true);
    });

    it.each([
        ["the same case", "ana@example.com"],
        ["a different case", "ANA@Example.com"],
        ["surrounding spaces", "  ana@example.com  "],
    ])(
        "Should throw EmailTakenError and add nothing when the email is taken in %s",
        async (_case, email) => {
            await repo.createUserWithStarterKit(account);
            const before = {
                users: await db.user.count(),
                categories: await db.category.count(),
                cards: await db.card.count(),
            };

            await expect(
                repo.createUserWithStarterKit({ ...account, email }),
            ).rejects.toBeInstanceOf(EmailTakenError);

            expect({
                users: await db.user.count(),
                categories: await db.category.count(),
                cards: await db.card.count(),
            }).toEqual(before);
        },
    );

    it.each(["subcategory", "settings"] as const)(
        "Should leave no user and no kit rows when the %s write fails mid-kit",
        async (model) => {
            const failing = new PrismaUserProvisioningRepository(
                failingAt(model),
            );

            await expect(
                failing.createUserWithStarterKit(account),
            ).rejects.toThrow("injected");

            expect(await db.user.count()).toBe(0);
            expect(await db.category.count()).toBe(0);
            expect(await db.subcategory.count()).toBe(0);
            expect(await db.card.count()).toBe(0);
            expect(await db.settings.count()).toBe(0);
        },
    );
});

describe("PrismaUserProvisioningRepository.countUsers", () => {
    it("Should count every account", async () => {
        expect(await repo.countUsers()).toBe(0);

        await createUser();
        await repo.createUserWithStarterKit(account);

        expect(await repo.countUsers()).toBe(2);
    });
});
