import { STARTER_CARDS, STARTER_CATEGORIES } from "@/lib/domain/starter-kit";
import type {
    ProvisionSummary,
    UserProvisioningRepository,
} from "@/lib/repositories/user-provisioning.repository";

export const STARTER_SUBCATEGORY_COUNT = STARTER_CATEGORIES.reduce(
    (total, c) => total + c.subcategories.length,
    0,
);

/**
 * In-memory `UserProvisioningRepository`. Models the contract's idempotency per
 * user: the first run reports the full kit, every later run reports nothing.
 * The Prisma adapter is covered by `tests/integration/user-provisioning-repository.test.ts`.
 */
export class FakeUserProvisioningRepository implements UserProvisioningRepository {
    private readonly provisionedUsers = new Set<string>();

    /** User ids passed to `provisionNewUser`, in call order. */
    readonly calls: string[] = [];

    /** Flip on to make the next call throw, simulating a rolled-back transaction. */
    failOnWrite = false;

    async provisionNewUser(userId: string): Promise<ProvisionSummary> {
        this.calls.push(userId);
        if (this.failOnWrite) throw new Error("fake: provisioning failed");

        const firstRun = !this.provisionedUsers.has(userId);
        this.provisionedUsers.add(userId);
        return {
            categoriesCreated: firstRun ? STARTER_CATEGORIES.length : 0,
            subcategoriesCreated: firstRun ? STARTER_SUBCATEGORY_COUNT : 0,
            cardsCreated: firstRun ? STARTER_CARDS.length : 0,
            settingsCreated: firstRun,
        };
    }
}
