import {
    STARTER_CARDS,
    STARTER_CATEGORIES,
    type StarterCard,
} from "@/lib/domain/starter-kit";
import type {
    ProvisionSummary,
    UserProvisioningRepository,
} from "@/lib/repositories/user-provisioning.repository";

/** Total subcategories a freshly provisioned account receives. */
export const STARTER_SUBCATEGORY_COUNT = STARTER_CATEGORIES.reduce(
    (total, category) => total + category.subcategories.length,
    0,
);

/**
 * In-memory `UserProvisioningRepository` for unit tests. Models the real
 * contract — including idempotency, so a second `provisionNewUser` for the same
 * user reports nothing new — without touching a database. The Prisma adapter
 * itself is covered by `tests/integration/user-provisioning-repository.test.ts`.
 * Mirrors `FakeCardRepository`.
 */
export class FakeUserProvisioningRepository implements UserProvisioningRepository {
    private readonly provisionedUsers = new Set<string>();
    private readonly cardNamesByUser = new Map<string, Set<string>>();

    /** Flip on to make the next write throw, simulating a DB failure. */
    failOnWrite = false;

    /** User ids passed to `provisionNewUser`, in order. */
    readonly provisioned: string[] = [];

    /** Every `ensureCards` call, in order (including the starter-kit one). */
    readonly cardCalls: Array<{
        userId: string;
        cards: readonly StarterCard[];
    }> = [];

    async provisionNewUser(userId: string): Promise<ProvisionSummary> {
        if (this.failOnWrite) throw new Error("fake: provision failed");
        this.provisioned.push(userId);

        const isFirstRun = !this.provisionedUsers.has(userId);
        this.provisionedUsers.add(userId);
        const cardsCreated = await this.ensureCards(userId, STARTER_CARDS);

        return {
            categoriesUpserted: STARTER_CATEGORIES.length,
            subcategoriesCreated: isFirstRun ? STARTER_SUBCATEGORY_COUNT : 0,
            cardsCreated,
            settingsCreated: isFirstRun,
        };
    }

    async ensureCards(
        userId: string,
        cards: readonly StarterCard[],
    ): Promise<number> {
        if (this.failOnWrite) throw new Error("fake: ensureCards failed");
        this.cardCalls.push({ userId, cards });

        let owned = this.cardNamesByUser.get(userId);
        if (!owned) {
            owned = new Set<string>();
            this.cardNamesByUser.set(userId, owned);
        }

        let created = 0;
        for (const card of cards) {
            if (owned.has(card.name)) continue;
            owned.add(card.name);
            created += 1;
        }
        return created;
    }

    /** Assert helper: the card names the fake believes `userId` owns. */
    cardNames(userId: string): string[] {
        return [...(this.cardNamesByUser.get(userId) ?? [])];
    }
}
