import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { replayMigration } from "@/tests/support/replay-migration";

const MIGRATION = "20261009000000_normalize_user_email";

async function seedUser(email: string) {
    return db.user.create({ data: { email, password: "x", name: "T" } });
}

async function emailsById() {
    const users = await db.user.findMany({ select: { id: true, email: true } });
    return Object.fromEntries(users.map((u) => [u.id, u.email]));
}

describe("normalize User.email migration (CHORE-31)", () => {
    it("lowercases and trims a mixed-case row and leaves a normalised row alone", async () => {
        const owner = await seedUser("owner@example.com");
        const friend = await seedUser("  Friend@Example.COM ");
        const tabbed = await seedUser("\tTabbed@Example.com\n");

        await replayMigration(MIGRATION);

        expect(await emailsById()).toEqual({
            [owner.id]: "owner@example.com",
            [friend.id]: "friend@example.com",
            [tabbed.id]: "tabbed@example.com",
        });
    });

    it("stamps updatedAt on a changed row only", async () => {
        const longAgo = new Date("2026-01-01T00:00:00Z");
        const seedAt = (email: string) =>
            db.user.create({
                data: { email, password: "x", name: "T", updatedAt: longAgo },
            });
        const owner = await seedAt("owner@example.com");
        const friend = await seedAt("Friend@Example.com");

        await replayMigration(MIGRATION);

        const after = await db.user.findMany();
        const byId = Object.fromEntries(after.map((u) => [u.id, u.updatedAt]));
        expect(byId[owner.id]).toEqual(longAgo);
        expect(byId[friend.id]!.getTime()).toBeGreaterThan(longAgo.getTime());
    });

    it("changes nothing on a second run", async () => {
        await seedUser("owner@example.com");
        await seedUser("Friend@Example.COM");
        await replayMigration(MIGRATION);
        const afterFirst = await db.user.findMany({ orderBy: { id: "asc" } });

        await replayMigration(MIGRATION);

        expect(await db.user.findMany({ orderBy: { id: "asc" } })).toEqual(
            afterFirst,
        );
    });

    it("aborts and writes nothing when two rows differ only by case", async () => {
        await seedUser("Foo@Example.com");
        await seedUser("foo@example.com");
        await seedUser("Bar@Example.com");
        const before = await emailsById();

        await expect(replayMigration(MIGRATION)).rejects.toThrow(
            /email normalisation aborted: 1 email address/,
        );
        expect(await emailsById()).toEqual(before);
    });

    it("aborts when two rows differ only by surrounding whitespace", async () => {
        await seedUser("foo@example.com ");
        await seedUser("foo@example.com");
        const before = await emailsById();

        await expect(replayMigration(MIGRATION)).rejects.toThrow(
            /email normalisation aborted/,
        );
        expect(await emailsById()).toEqual(before);
    });
});
