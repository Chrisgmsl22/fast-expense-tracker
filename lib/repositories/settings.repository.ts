import type { PrismaClient } from "@prisma/client";

import {
    toUserSettings,
    type SplitRulePersist,
    type UserSettings,
} from "@/lib/domain/settings";

export type { UserSettings } from "@/lib/domain/settings";

/**
 * Data-access contract for user settings — the "port". The single source for the
 * partner name + shared-expense mode, replacing the old `PARTNER_NAME` constant
 * (spec 0006). Actions/pages depend on this interface, never on Prisma directly.
 */
export interface SettingsRepository {
    /**
     * The signed-in user's settings, with Solo defaults when no row exists yet
     * (`toUserSettings`). Never returns null — callers always get usable values.
     */
    getSettings(userId: string): Promise<UserSettings>;
    /** Upsert the split-rule fields (mode + partner name + share fraction). */
    saveSplitRule(userId: string, data: SplitRulePersist): Promise<void>;
}

/**
 * Prisma-backed implementation — the only place settings queries live. The
 * `PrismaClient` is injected via the constructor (not imported), so the class is
 * trivially testable with a stub and carries no knowledge of the app singleton.
 */
export class PrismaSettingsRepository implements SettingsRepository {
    constructor(private readonly db: PrismaClient) {}

    async getSettings(userId: string): Promise<UserSettings> {
        const row = await this.db.settings.findUnique({
            where: { userId },
            select: {
                sharesExpenses: true,
                partnerName: true,
                defaultSharePercentage: true,
            },
        });
        return toUserSettings(row);
    }

    /**
     * Upsert the user's single settings row. `Settings.userId` is unique, so a
     * real `upsert` is safe (unlike the find-then-write income path) — it creates
     * the row on first save and updates it thereafter.
     */
    async saveSplitRule(userId: string, data: SplitRulePersist): Promise<void> {
        await this.db.settings.upsert({
            where: { userId },
            create: {
                userId,
                sharesExpenses: data.sharesExpenses,
                partnerName: data.partnerName,
                defaultSharePercentage: data.defaultSharePercentage,
            },
            update: {
                sharesExpenses: data.sharesExpenses,
                partnerName: data.partnerName,
                defaultSharePercentage: data.defaultSharePercentage,
            },
        });
    }
}
