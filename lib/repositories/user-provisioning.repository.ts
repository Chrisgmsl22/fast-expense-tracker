import type { Prisma, PrismaClient } from "@prisma/client";

// Relative `.ts` import: `prisma/seed.ts` loads this module under plain Node.
import {
    STARTER_CARDS,
    STARTER_CATEGORIES,
    STARTER_SETTINGS,
} from "../domain/starter-kit.ts";

/** What one run wrote. All zero / false means the user already had everything. */
export type ProvisionSummary = {
    categoriesCreated: number;
    subcategoriesCreated: number;
    cardsCreated: number;
    settingsCreated: boolean;
};

/**
 * Gives an account its starter kit (`lib/domain/starter-kit.ts`): categories,
 * subcategories, the Cash card and a Solo settings row.
 */
export interface UserProvisioningRepository {
    /**
     * Creates only what `userId` lacks, in one transaction, and never updates an
     * existing row, so a second run writes nothing and the user's edits survive.
     */
    provisionNewUser(userId: string): Promise<ProvisionSummary>;
}

type Tx = Prisma.TransactionClient;

/**
 * Prisma-backed implementation. Create-only-when-absent, so safe to re-run. For a
 * fresh user a concurrent second run waits on the `(userId, slug)` unique index;
 * only two runs racing for a user who already has the categories can duplicate a
 * subcategory or the Cash card (neither has a natural unique key).
 */
export class PrismaUserProvisioningRepository implements UserProvisioningRepository {
    // No `constructor(private readonly db)` shorthand: Node's strip-only
    // TypeScript, which runs `prisma/seed.ts`, rejects parameter properties.
    private readonly db: PrismaClient;

    constructor(db: PrismaClient) {
        this.db = db;
    }

    async provisionNewUser(userId: string): Promise<ProvisionSummary> {
        return this.db.$transaction(async (tx) => ({
            categoriesCreated: await createMissingCategories(tx, userId),
            subcategoriesCreated: await createMissingSubcategories(tx, userId),
            cardsCreated: await createMissingCards(tx, userId),
            settingsCreated: await createSettingsIfAbsent(tx, userId),
        }));
    }
}

async function createMissingCategories(tx: Tx, userId: string) {
    // `skipDuplicates` leaves a category the user already holds (by slug) as it is.
    const { count } = await tx.category.createMany({
        data: STARTER_CATEGORIES.map((c) => ({
            userId,
            slug: c.slug,
            name: c.name,
            color: c.color,
            isRelevant: c.isRelevant,
            isSystemCategory: true,
        })),
        skipDuplicates: true,
    });
    return count;
}

async function createMissingSubcategories(tx: Tx, userId: string) {
    const categories = await tx.category.findMany({
        where: { userId, slug: { in: STARTER_CATEGORIES.map((c) => c.slug) } },
        select: { id: true, slug: true },
    });
    const existing = await tx.subcategory.findMany({
        where: { userId },
        select: { categoryId: true, name: true },
    });
    const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));
    const namesByCategory = new Map<string, Set<string>>();
    for (const s of existing) {
        const names = namesByCategory.get(s.categoryId) ?? new Set<string>();
        names.add(s.name);
        namesByCategory.set(s.categoryId, names);
    }

    const missing = STARTER_CATEGORIES.flatMap((starter) => {
        const categoryId = categoryIdBySlug.get(starter.slug);
        if (!categoryId) return [];
        const held = namesByCategory.get(categoryId);
        return starter.subcategories
            .filter((name) => !held?.has(name))
            .map((name) => ({ userId, categoryId, name }));
    });
    if (missing.length === 0) return 0;

    const { count } = await tx.subcategory.createMany({ data: missing });
    return count;
}

async function createMissingCards(tx: Tx, userId: string) {
    const existing = await tx.card.findMany({
        where: { userId },
        select: { name: true, type: true },
    });
    // Cash is a per-user singleton, so any cash card counts, whatever its name.
    const hasCash = existing.some((c) => c.type === "cash");
    const missing = STARTER_CARDS.filter(
        (card) =>
            !existing.some((c) => c.name === card.name) &&
            !(card.type === "cash" && hasCash),
    );
    if (missing.length === 0) return 0;

    const { count } = await tx.card.createMany({
        data: missing.map((card) => ({ userId, ...card })),
    });
    return count;
}

async function createSettingsIfAbsent(tx: Tx, userId: string) {
    // `Settings.userId` is unique, so `skipDuplicates` keeps an existing row intact.
    const { count } = await tx.settings.createMany({
        data: [{ userId, ...STARTER_SETTINGS }],
        skipDuplicates: true,
    });
    return count === 1;
}
