import type { PrismaClient } from "@prisma/client";

/** What the dashboard shell needs to decide whether to show the onboarding wizard. */
export type OnboardingState = {
    name: string;
    onboardedAt: Date | null;
};

/** Account fields a signed-in user changes about themselves. Every method is scoped to one `userId`. */
export interface UserRepository {
    /** Null when no user has this id. */
    getOnboardingState(userId: string): Promise<OnboardingState | null>;
    /** Returns the number of rows changed: 1, or 0 when no user has this id. */
    updateName(userId: string, name: string): Promise<number>;
    /**
     * Sets `onboardedAt` only while it is null, so a second call keeps the first
     * timestamp. Returns the number of rows changed.
     */
    markOnboarded(userId: string, at: Date): Promise<number>;
}

export class PrismaUserRepository implements UserRepository {
    constructor(private readonly db: PrismaClient) {}

    getOnboardingState(userId: string): Promise<OnboardingState | null> {
        return this.db.user.findUnique({
            where: { id: userId },
            select: { name: true, onboardedAt: true },
        });
    }

    async updateName(userId: string, name: string): Promise<number> {
        const { count } = await this.db.user.updateMany({
            where: { id: userId },
            data: { name },
        });
        return count;
    }

    async markOnboarded(userId: string, at: Date): Promise<number> {
        const { count } = await this.db.user.updateMany({
            where: { id: userId, onboardedAt: null },
            data: { onboardedAt: at },
        });
        return count;
    }
}
