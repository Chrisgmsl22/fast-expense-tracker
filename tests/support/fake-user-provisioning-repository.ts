import { STARTER_CARDS, STARTER_CATEGORIES } from "@/lib/domain/starter-kit";
import { normalizeEmail } from "@/lib/domain/user";
import {
    EmailTakenError,
    type NewAccount,
    type ProvisionSummary,
    type UserProvisioningRepository,
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
    private readonly emails = new Set<string>();

    /** User ids passed to `provisionNewUser`, in call order. */
    readonly calls: string[] = [];

    /** Accounts `createUserWithStarterKit` stored, in call order. */
    readonly createdAccounts: NewAccount[] = [];

    /** The number `countUsers` reports; each created account adds one. */
    userCount = 0;

    /** Flip on to make the next call throw, simulating a rolled-back transaction. */
    failOnWrite = false;

    /** Seed an existing account so a signup with the same email is refused. */
    addExistingEmail(email: string): void {
        this.emails.add(normalizeEmail(email));
        this.userCount += 1;
    }

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

    async countUsers(): Promise<number> {
        return this.userCount;
    }

    async createUserWithStarterKit(
        account: NewAccount,
    ): Promise<{ userId: string }> {
        if (this.failOnWrite) throw new Error("fake: account creation failed");
        const email = normalizeEmail(account.email);
        if (this.emails.has(email)) throw new EmailTakenError();

        this.emails.add(email);
        this.createdAccounts.push(account);
        this.userCount += 1;
        const userId = `fake-user-${this.userCount}`;
        this.provisionedUsers.add(userId);
        return { userId };
    }
}
