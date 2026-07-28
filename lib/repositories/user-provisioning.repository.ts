import type { PrismaClient } from "@prisma/client";

// Relative `.ts` import, not the `@/` alias — see the note at the top of
// `lib/domain/starter-kit.ts`. Guarded by CI's "Seed loads under Node's
// TypeScript stripper" step.
import {
    STARTER_CARDS,
    STARTER_CATEGORIES,
    STARTER_SETTINGS,
    type StarterCard,
    type StarterCategory,
} from "../domain/starter-kit.ts";

/** What a provisioning run actually wrote — everything else already existed. */
export type ProvisionSummary = {
    /** Starter categories upserted (always the full default set). */
    categoriesUpserted: number;
    subcategoriesCreated: number;
    cardsCreated: number;
    settingsCreated: boolean;
};

/**
 * Writes the new-user starter kit (ADR-0022 §3) — the "port" both the owner
 * seed and signup depend on, so a fresh account and a re-seeded one can never
 * drift apart. Data lives in `lib/domain/starter-kit.ts`; only the persistence
 * lives here.
 */
export interface UserProvisioningRepository {
    /**
     * Give `userId` the full default set: the 13 starter categories + their
     * subcategories, the required Cash card, and a Solo settings row.
     *
     * **Idempotent.** Categories upsert on the per-user `(userId, slug)` key
     * (ADR-0022); subcategories, the card, and the settings row have no such
     * key, so each is created only when absent (scoped by `userId`). Re-running
     * therefore adds nothing and, for the system categories, restores the
     * starter name/color/`isRelevant` — see `ensureCategories`.
     *
     * **Not transactional**, and that is only safe for today's single caller:
     * the seed CLI, which the repo owner re-runs by hand, so a run that fails
     * partway is repaired manually. There is no automatic repair path.
     *
     * CHORE-8.d (signup) must not inherit that assumption — nobody re-runs
     * provisioning for a new user, and a half-provisioned account is usable but
     * broken (no Cash card ⇒ cash spend can't be recorded at all). Signup must
     * either wrap this call in `db.$transaction` or complete provisioning
     * before issuing the session.
     */
    provisionNewUser(userId: string): Promise<ProvisionSummary>;

    /**
     * Ensure each of `cards` exists for `userId`, matched by name; refresh the
     * color/type of any that already exist. Returns how many were created.
     * Used by `provisionNewUser` for the Cash card and by the owner seed for its
     * five branded cards, so the create-or-refresh rule lives in one place.
     */
    ensureCards(userId: string, cards: readonly StarterCard[]): Promise<number>;
}

/** A starter category paired with the id of the row it resolved to. */
type ResolvedCategory = { starter: StarterCategory; id: string };

/**
 * Composite key for "this user already has this subcategory name here".
 * Unambiguous despite the plain separator: `categoryId` is a uuid, so the split
 * point is fixed even when a subcategory name contains a `|`.
 */
function subcategoryKey(categoryId: string, name: string): string {
    return `${categoryId}|${name}`;
}

/**
 * Prisma-backed implementation — the only place provisioning queries live. The
 * `PrismaClient` is injected via the constructor (never imported), so the class
 * is testable against a real test database and carries no knowledge of the app
 * singleton.
 *
 * The find-then-create paths are check-then-act: two concurrent provisions of
 * the SAME user could race and double-insert. Provisioning runs once per user
 * (signup, or a one-shot seed CLI), so that race isn't reachable today — and
 * it's the reason there's no `@@unique([categoryId, name])` to lean on.
 */
export class PrismaUserProvisioningRepository implements UserProvisioningRepository {
    // Written out longhand instead of the `constructor(private readonly db)`
    // parameter-property shorthand the other adapters use: `prisma/seed.ts`
    // loads this module under Node's strip-only TypeScript mode, which rejects
    // parameter properties outright (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX).
    // Vitest/esbuild accept the shorthand, so no test would catch a "tidy-up"
    // back to it — CI's "Seed loads under Node's TypeScript stripper" step is
    // what guards this.
    private readonly db: PrismaClient;

    constructor(db: PrismaClient) {
        this.db = db;
    }

    async provisionNewUser(userId: string): Promise<ProvisionSummary> {
        const categories = await this.ensureCategories(userId);
        const subcategoriesCreated = await this.ensureSubcategories(
            userId,
            categories,
        );
        const cardsCreated = await this.ensureCards(userId, STARTER_CARDS);
        const settingsCreated = await this.ensureSettings(userId);

        return {
            categoriesUpserted: categories.length,
            subcategoriesCreated,
            cardsCreated,
            settingsCreated,
        };
    }

    async ensureCards(
        userId: string,
        cards: readonly StarterCard[],
    ): Promise<number> {
        if (cards.length === 0) return 0;

        const existing = await this.db.card.findMany({
            where: { userId, name: { in: cards.map((c) => c.name) } },
            select: { id: true, name: true },
        });
        const idByName = new Map(existing.map((c) => [c.name, c.id]));

        let created = 0;
        for (const card of cards) {
            const id = idByName.get(card.name);
            if (id) {
                // Refresh so a re-run propagates palette/type corrections to
                // cards created before them (create-if-absent alone never would).
                await this.db.card.update({
                    where: { id },
                    data: { color: card.color, type: card.type },
                });
                continue;
            }
            await this.db.card.create({
                data: {
                    userId,
                    name: card.name,
                    color: card.color,
                    type: card.type,
                },
            });
            created += 1;
        }
        return created;
    }

    /**
     * Upsert the starter categories on `(userId, slug)` and return their ids.
     *
     * The `update` branch rewrites name/color/`isRelevant`/`isSystemCategory`,
     * so a re-run propagates reference changes to the account — the seed's
     * long-standing behavior, preserved. Nothing can edit a category today;
     * once CHORE-8.c ships renaming/recoloring, re-provisioning an existing
     * account would reset those edits, and this branch needs revisiting.
     */
    private async ensureCategories(
        userId: string,
    ): Promise<ResolvedCategory[]> {
        const resolved: ResolvedCategory[] = [];
        for (const starter of STARTER_CATEGORIES) {
            const defaults = {
                name: starter.name,
                color: starter.color,
                isRelevant: starter.isRelevant,
                isSystemCategory: true,
            };
            const row = await this.db.category.upsert({
                where: { userId_slug: { userId, slug: starter.slug } },
                create: { userId, slug: starter.slug, ...defaults },
                update: defaults,
                select: { id: true },
            });
            resolved.push({ starter, id: row.id });
        }
        return resolved;
    }

    /**
     * Create the starter subcategories the user is missing, in one batch. Reads
     * the user's existing rows first so a re-run never double-inserts, and never
     * touches subcategories the user added themselves.
     */
    private async ensureSubcategories(
        userId: string,
        categories: readonly ResolvedCategory[],
    ): Promise<number> {
        const existing = await this.db.subcategory.findMany({
            where: { userId },
            select: { categoryId: true, name: true },
        });
        const seen = new Set(
            existing.map((s) => subcategoryKey(s.categoryId, s.name)),
        );

        const missing: { userId: string; categoryId: string; name: string }[] =
            [];
        for (const { starter, id: categoryId } of categories) {
            for (const name of starter.subcategories) {
                const key = subcategoryKey(categoryId, name);
                if (seen.has(key)) continue;
                seen.add(key);
                missing.push({ userId, categoryId, name });
            }
        }

        if (missing.length === 0) return 0;
        const { count } = await this.db.subcategory.createMany({
            data: missing,
        });
        return count;
    }

    /**
     * Create the account's Solo settings row when it has none. Never updates an
     * existing row — the user's own settings always win over the starter values.
     */
    private async ensureSettings(userId: string): Promise<boolean> {
        const existing = await this.db.settings.findUnique({
            where: { userId },
            select: { id: true },
        });
        if (existing) return false;

        await this.db.settings.create({
            data: { userId, sharesExpenses: STARTER_SETTINGS.sharesExpenses },
        });
        return true;
    }
}
