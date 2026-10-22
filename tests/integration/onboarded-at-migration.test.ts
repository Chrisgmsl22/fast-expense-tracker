import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { replayMigration } from "@/tests/support/replay-migration";

const MIGRATION = "20261016000000_add_user_onboarded_at";

// The suite's database already has the column, so each test drops it to stand
// where production stands before the deploy, then replays the real file.
async function dropColumn() {
    await db.$executeRawUnsafe(`ALTER TABLE "User" DROP COLUMN "onboardedAt"`);
}

// Raw insert: the generated client would select the dropped column back.
async function insertUser(id: string) {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" (id, email, password, name, "updatedAt")
         VALUES ($1, $2, 'x', 'Invented', NOW())`,
        id,
        `${id}@example.com`,
    );
}

afterEach(async () => {
    await db.$executeRawUnsafe(
        `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardedAt" TIMESTAMP(3)`,
    );
});

describe("add User.onboardedAt migration (CHORE-8.e)", () => {
    it("stamps every existing user so none of them sees the wizard", async () => {
        await dropColumn();
        await insertUser("owner");
        await insertUser("friend");
        const before = Date.now();

        await replayMigration(MIGRATION);

        const users = await db.user.findMany({
            select: { id: true, onboardedAt: true },
        });
        expect(users).toHaveLength(2);
        for (const user of users) {
            expect(user.onboardedAt).toBeInstanceOf(Date);
            expect(user.onboardedAt!.getTime()).toBeGreaterThanOrEqual(
                before - 60_000,
            );
        }
    });

    it("leaves a user created after the migration with a null onboardedAt", async () => {
        await dropColumn();
        await insertUser("owner");
        await replayMigration(MIGRATION);

        const fresh = await db.user.create({
            data: { email: "fresh@example.com", password: "x", name: "New" },
        });

        expect(fresh.onboardedAt).toBeNull();
        const owner = await db.user.findUnique({ where: { id: "owner" } });
        expect(owner?.onboardedAt).toBeInstanceOf(Date);
    });
});
