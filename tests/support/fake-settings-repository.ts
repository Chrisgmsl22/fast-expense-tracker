import { toUserSettings, type SplitRulePersist } from "@/lib/domain/settings";
import type {
    SettingsRepository,
    UserSettings,
} from "@/lib/repositories/settings.repository";

type StoredRow = {
    sharesExpenses: boolean;
    partnerName: string | null;
    defaultSharePercentage: number;
};

/**
 * In-memory `SettingsRepository` for unit tests. Satisfies the exact contract the
 * Prisma adapter does, so an action driven by this fake exercises its real
 * orchestration (validate → authz → persist → map) with zero database. Mirrors
 * `FakeIncomeRepository`.
 */
export class FakeSettingsRepository implements SettingsRepository {
    private readonly rows = new Map<string, StoredRow>();

    /** Flip on to make the next save throw, simulating a DB failure. */
    failOnWrite = false;

    /** Every `(userId, data)` passed to `saveSplitRule`, in order. */
    readonly saves: Array<{ userId: string; data: SplitRulePersist }> = [];

    /** Arrange helper: seed a stored settings row for a user. */
    seed(userId: string, over: Partial<StoredRow> = {}): void {
        this.rows.set(userId, {
            sharesExpenses: false,
            partnerName: null,
            defaultSharePercentage: 0.68,
            ...over,
        });
    }

    async getSettings(userId: string): Promise<UserSettings> {
        return toUserSettings(this.rows.get(userId) ?? null);
    }

    async saveSplitRule(userId: string, data: SplitRulePersist): Promise<void> {
        if (this.failOnWrite) throw new Error("fake: saveSplitRule failed");
        this.rows.set(userId, {
            sharesExpenses: data.sharesExpenses,
            partnerName: data.partnerName,
            defaultSharePercentage: data.defaultSharePercentage,
        });
        this.saves.push({ userId, data });
    }
}
