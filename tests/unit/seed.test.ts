// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";

import { CATEGORY_SEED, CARD_SEED, runSeed } from "@/prisma/seed";

const ADMIN = { adminEmail: "admin@example.com", adminPassword: "s3cret-pw" };

/**
 * Builds a Prisma-shaped mock exposing only the delegates `runSeed` touches.
 * Idempotency branch control:
 * @param opts.subExists / cardExists  — blanket: every row already exists.
 * @param opts.existingSubNames        — only these subcategory names exist
 *                                        (simulates a partial re-seed).
 */
function makeDb(
    opts: {
        subExists?: boolean;
        cardExists?: boolean;
        existingSubNames?: Set<string>;
    } = {},
) {
    const subExists = (name: string) =>
        opts.subExists || (opts.existingSubNames?.has(name) ?? false);
    const category = {
        upsert: vi.fn<
            (args: {
                where: { slug: string };
                create: unknown;
                update: unknown;
            }) => Promise<{ id: string }>
        >(async (args) => ({ id: `cat-${args.where.slug}` })),
    };
    const subcategory = {
        findFirst: vi.fn<
            (args: {
                where: { categoryId: string; name: string };
            }) => Promise<{ id: string } | null>
        >(async (args) =>
            subExists(args.where.name) ? { id: "sub-existing" } : null,
        ),
        create: vi.fn<
            (args: {
                data: { categoryId: string; name: string };
            }) => Promise<{ id: string }>
        >(async () => ({ id: "sub-new" })),
    };
    const user = {
        upsert: vi.fn<
            (args: {
                where: { email: string };
                create: { email: string; name: string; password: string };
                update: unknown;
            }) => Promise<{ id: string }>
        >(async (args) => ({ id: "user-1", ...args.create })),
    };
    const card = {
        findFirst: vi.fn<
            (args: {
                where: { userId: string; name: string };
            }) => Promise<{ id: string } | null>
        >(async () => (opts.cardExists ? { id: "card-existing" } : null)),
        create: vi.fn<
            (args: {
                data: {
                    userId: string;
                    name: string;
                    color: string;
                    type: string;
                };
            }) => Promise<{ id: string }>
        >(async () => ({ id: "card-new" })),
    };
    // Test mock: only the delegates runSeed uses are implemented.
    const db = { category, subcategory, user, card } as unknown as Parameters<
        typeof runSeed
    >[0];
    return { db, category, subcategory, user, card };
}

describe("CATEGORY_SEED data", () => {
    it("defines all 13 system categories", () => {
        expect(CATEGORY_SEED).toHaveLength(13);
    });

    it("encodes the 50/25/25 isRelevant flags from the domain reference", () => {
        const bySlug = Object.fromEntries(
            CATEGORY_SEED.map((c) => [c.slug, c]),
        );
        expect(bySlug["housing"]?.isRelevant).toBe(true);
        expect(bySlug["savings"]?.isRelevant).toBe(true);
        expect(bySlug["personal"]?.isRelevant).toBe(false);
        expect(bySlug["disposable-income"]?.isRelevant).toBe(false);
        expect(bySlug["unassigned"]?.isRelevant).toBe(false);
    });

    it("gives the unassigned sentinel no subcategories", () => {
        const unassigned = CATEGORY_SEED.find((c) => c.slug === "unassigned");
        expect(unassigned?.subcategories).toEqual([]);
    });
});

describe("CARD_SEED data", () => {
    it("defines the 5 cards with the domain-reference color mapping (semantic, no hex)", () => {
        expect(CARD_SEED).toHaveLength(5);
        const byName = Object.fromEntries(CARD_SEED.map((c) => [c.name, c]));
        // domain-reference.md §4
        expect(byName["Amex Platinum"]).toMatchObject({
            color: "gray",
            type: "credit",
        });
        expect(byName["Amex Gold"]).toMatchObject({
            color: "yellow",
            type: "credit",
        });
        expect(byName["NU"]).toMatchObject({ color: "purple", type: "credit" });
        expect(byName["BBVA"]).toMatchObject({ color: "blue", type: "debit" });
        expect(byName["Cash"]).toMatchObject({ color: "green", type: "cash" });
        for (const c of CARD_SEED) {
            expect(c.color).toMatch(/^[a-z]+$/);
        }
    });
});

describe("runSeed", () => {
    it("upserts all 13 categories keyed by slug", async () => {
        const { db, category } = makeDb();
        await runSeed(db, ADMIN);
        expect(category.upsert).toHaveBeenCalledTimes(13);
        const slugs = category.upsert.mock.calls.map((c) => c[0].where.slug);
        expect(new Set(slugs)).toEqual(
            new Set(CATEGORY_SEED.map((c) => c.slug)),
        );
    });

    it("creates every subcategory on a fresh DB, linked to its category", async () => {
        const { db, subcategory } = makeDb({ subExists: false });
        await runSeed(db, ADMIN);
        const total = CATEGORY_SEED.reduce(
            (n, c) => n + c.subcategories.length,
            0,
        );
        expect(subcategory.create).toHaveBeenCalledTimes(total);
        for (const call of subcategory.create.mock.calls) {
            expect(call[0].data.categoryId).toMatch(/^cat-/);
        }
    });

    it("creates no subcategories when they already exist (idempotent)", async () => {
        const { db, subcategory } = makeDb({ subExists: true });
        await runSeed(db, ADMIN);
        expect(subcategory.create).not.toHaveBeenCalled();
    });

    it("creates only the missing subcategories on a partial re-seed", async () => {
        // "Rent" and "Gasoline" already exist; every other subcategory is new.
        const existingSubNames = new Set(["Rent", "Gasoline"]);
        const { db, subcategory } = makeDb({ existingSubNames });
        await runSeed(db, ADMIN);
        const total = CATEGORY_SEED.reduce(
            (n, c) => n + c.subcategories.length,
            0,
        );
        expect(subcategory.create).toHaveBeenCalledTimes(
            total - existingSubNames.size,
        );
        const createdNames = subcategory.create.mock.calls.map(
            (c) => c[0].data.name,
        );
        expect(createdNames).not.toContain("Rent");
        expect(createdNames).not.toContain("Gasoline");
    });

    it("creates the 5 cards for the admin user on a fresh DB", async () => {
        const { db, card } = makeDb({ cardExists: false });
        await runSeed(db, ADMIN);
        expect(card.create).toHaveBeenCalledTimes(5);
        for (const call of card.create.mock.calls) {
            expect(call[0].data.userId).toBe("user-1");
        }
    });

    it("creates no cards when they already exist (idempotent)", async () => {
        const { db, card } = makeDb({ cardExists: true });
        await runSeed(db, ADMIN);
        expect(card.create).not.toHaveBeenCalled();
    });

    it("upserts the admin user keyed by email with a bcrypt hash, never plaintext", async () => {
        const { db, user } = makeDb();
        await runSeed(db, ADMIN);
        expect(user.upsert).toHaveBeenCalledTimes(1);
        const args = user.upsert.mock.calls[0]![0];
        expect(args.where.email).toBe(ADMIN.adminEmail);
        const stored = args.create.password;
        expect(stored).not.toBe(ADMIN.adminPassword);
        expect(stored.startsWith("$2")).toBe(true);
        expect(bcrypt.compareSync(ADMIN.adminPassword, stored)).toBe(true);
    });
});
