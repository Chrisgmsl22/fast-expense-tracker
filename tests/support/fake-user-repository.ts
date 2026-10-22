import type {
    OnboardingState,
    UserRepository,
} from "@/lib/repositories/user.repository";

/** In-memory `UserRepository` with the same per-user scoping as the Prisma adapter. */
export class FakeUserRepository implements UserRepository {
    private readonly users = new Map<string, OnboardingState>();

    failOnRead = false;
    failOnWrite = false;

    seed(userId: string, over: Partial<OnboardingState> = {}): void {
        this.users.set(userId, {
            name: "Invented User",
            onboardedAt: null,
            ...over,
        });
    }

    stateOf(userId: string): OnboardingState | undefined {
        return this.users.get(userId);
    }

    async getOnboardingState(userId: string): Promise<OnboardingState | null> {
        if (this.failOnRead) throw new Error("fake: read failed");
        return this.users.get(userId) ?? null;
    }

    async updateName(userId: string, name: string): Promise<number> {
        if (this.failOnWrite) throw new Error("fake: write failed");
        const user = this.users.get(userId);
        if (!user) return 0;
        this.users.set(userId, { ...user, name });
        return 1;
    }

    async markOnboarded(userId: string, at: Date): Promise<number> {
        if (this.failOnWrite) throw new Error("fake: write failed");
        const user = this.users.get(userId);
        if (!user || user.onboardedAt !== null) return 0;
        this.users.set(userId, { ...user, onboardedAt: at });
        return 1;
    }
}
