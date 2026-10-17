import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { PrismaUserRepository } from "@/lib/repositories/user.repository";

const repo = new PrismaUserRepository(db);

async function seedUser(email: string, over: { onboardedAt?: Date } = {}) {
    return db.user.create({
        data: { email, password: "x", name: "Invented", ...over },
    });
}

describe("PrismaUserRepository", () => {
    it("starts a new user with a null onboardedAt", async () => {
        const user = await seedUser("new@example.com");

        expect(await repo.getOnboardingState(user.id)).toEqual({
            name: "Invented",
            onboardedAt: null,
        });
    });

    it("returns null for an unknown user", async () => {
        expect(await repo.getOnboardingState("no-such-user")).toBeNull();
    });

    it("renames only the given user", async () => {
        const a = await seedUser("a@example.com");
        const b = await seedUser("b@example.com");

        expect(await repo.updateName(a.id, "Invented Rename")).toBe(1);

        const names = await db.user.findMany({
            select: { id: true, name: true },
        });
        expect(Object.fromEntries(names.map((u) => [u.id, u.name]))).toEqual({
            [a.id]: "Invented Rename",
            [b.id]: "Invented",
        });
    });

    it("changes nothing when renaming an unknown user", async () => {
        expect(await repo.updateName("no-such-user", "X")).toBe(0);
    });

    it("stamps onboardedAt once, for the given user only", async () => {
        const a = await seedUser("a@example.com");
        const b = await seedUser("b@example.com");
        const first = new Date("2026-10-16T18:00:00Z");

        expect(await repo.markOnboarded(a.id, first)).toBe(1);
        expect(
            await repo.markOnboarded(a.id, new Date("2026-10-20T00:00:00Z")),
        ).toBe(0);

        expect((await repo.getOnboardingState(a.id))?.onboardedAt).toEqual(
            first,
        );
        expect((await repo.getOnboardingState(b.id))?.onboardedAt).toBeNull();
    });
});
