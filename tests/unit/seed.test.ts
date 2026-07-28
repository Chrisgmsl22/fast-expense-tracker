// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";

import { CARD_PALETTE } from "@/lib/palette";
import { STARTER_CATEGORIES } from "@/lib/domain/starter-kit";
import {
    FakeUserProvisioningRepository,
    STARTER_SUBCATEGORY_COUNT,
} from "@/tests/support/fake-user-provisioning-repository";
import { OWNER_CARDS, runSeed } from "@/prisma/seed";

const ADMIN = { adminEmail: "admin@example.com", adminPassword: "s3cret-pw" };

// The seed's own logic is: upsert the owner, hand them to the shared starter
// kit, add the owner-only branded cards, then the fixed-income row. The starter
// kit itself is exercised against a real database in
// tests/integration/user-provisioning-repository.test.ts.

/**
 * Builds a Prisma-shaped mock exposing only the delegates `runSeed` still
 * touches directly (user + income); everything else goes through the injected
 * provisioning repository.
 */
function makeDb(opts: { incomeExists?: boolean } = {}) {
    const user = {
        upsert: vi.fn<
            (args: {
                where: { email: string };
                create: { email: string; name: string; password: string };
                update: Record<string, unknown>;
            }) => Promise<{ id: string }>
        >(async (args) => ({ id: "user-1", ...args.create })),
    };
    const income = {
        findFirst: vi.fn<
            (args: {
                where: { userId: string; type: string };
            }) => Promise<{ id: string } | null>
        >(async () => (opts.incomeExists ? { id: "income-existing" } : null)),
        create: vi.fn<
            (args: {
                data: { userId: string; type: string; amount: number };
            }) => Promise<{ id: string }>
        >(async () => ({ id: "income-new" })),
    };
    // Test mock: only the delegates runSeed uses are implemented.
    const db = { user, income } as unknown as Parameters<typeof runSeed>[0];
    return { db, user, income };
}

describe("OWNER_CARDS", () => {
    it("defines the owner's four branded cards with palette hexes", () => {
        expect(OWNER_CARDS).toHaveLength(4);
        const byName = Object.fromEntries(OWNER_CARDS.map((c) => [c.name, c]));
        expect(byName["Amex Platinum"]).toMatchObject({
            color: "#6b7280",
            type: "credit",
        });
        expect(byName["Amex Gold"]).toMatchObject({
            color: "#ca8a04",
            type: "credit",
        });
        expect(byName["NU"]).toMatchObject({
            color: "#9333ea",
            type: "credit",
        });
        expect(byName["BBVA"]).toMatchObject({
            color: "#2563eb",
            type: "debit",
        });
    });

    it("uses colors that exist in the shared palette", () => {
        const hexes = new Set(CARD_PALETTE.map((s) => s.hex));
        for (const card of OWNER_CARDS) {
            expect(hexes.has(card.color)).toBe(true);
        }
    });

    it("leaves Cash to the starter kit (never duplicated here)", () => {
        expect(OWNER_CARDS.some((c) => c.type === "cash")).toBe(false);
        expect(OWNER_CARDS.some((c) => c.name === "Cash")).toBe(false);
    });
});

describe("runSeed", () => {
    it("upserts the admin user keyed by email with a bcrypt hash, never plaintext", async () => {
        const { db, user } = makeDb();
        await runSeed(db, ADMIN, new FakeUserProvisioningRepository());

        expect(user.upsert).toHaveBeenCalledTimes(1);
        const args = user.upsert.mock.calls[0]![0];
        expect(args.where.email).toBe(ADMIN.adminEmail);
        const stored = args.create.password;
        expect(stored).not.toBe(ADMIN.adminPassword);
        expect(stored.startsWith("$2")).toBe(true);
        expect(bcrypt.compareSync(ADMIN.adminPassword, stored)).toBe(true);
    });

    it("never rewrites the password on re-seed (a rotated value survives)", async () => {
        const { db, user } = makeDb();
        await runSeed(db, ADMIN, new FakeUserProvisioningRepository());

        const args = user.upsert.mock.calls[0]![0];
        expect(args.update).toEqual({});
        expect(Object.keys(args.update)).not.toContain("password");
    });

    it("provisions the owner through the shared starter kit", async () => {
        const { db } = makeDb();
        const provisioning = new FakeUserProvisioningRepository();
        await runSeed(db, ADMIN, provisioning);

        expect(provisioning.provisioned).toEqual(["user-1"]);
    });

    it("adds the owner's branded cards on top of the starter kit", async () => {
        const { db } = makeDb();
        const provisioning = new FakeUserProvisioningRepository();
        await runSeed(db, ADMIN, provisioning);

        // The starter Cash card plus the four branded ones — the owner's five.
        expect(provisioning.cardNames("user-1").sort()).toEqual([
            "Amex Gold",
            "Amex Platinum",
            "BBVA",
            "Cash",
            "NU",
        ]);
        const ownerCall = provisioning.cardCalls.at(-1);
        expect(ownerCall).toMatchObject({ userId: "user-1" });
        expect(ownerCall?.cards).toBe(OWNER_CARDS);
    });

    it("reports the starter-kit + owner-card totals on a fresh database", async () => {
        const { db } = makeDb({ incomeExists: false });
        const summary = await runSeed(
            db,
            ADMIN,
            new FakeUserProvisioningRepository(),
        );

        expect(summary).toEqual({
            categories: STARTER_CATEGORIES.length,
            subcategories: STARTER_SUBCATEGORY_COUNT,
            cards: 5, // 1 starter (Cash) + 4 branded
            settingsCreated: true,
            fixedIncomeCreated: true,
        });
    });

    it("reports nothing new on a re-seed (idempotent)", async () => {
        const provisioning = new FakeUserProvisioningRepository();
        await runSeed(makeDb().db, ADMIN, provisioning);

        const summary = await runSeed(
            makeDb({ incomeExists: true }).db,
            ADMIN,
            provisioning,
        );

        expect(summary).toEqual({
            categories: STARTER_CATEGORIES.length,
            subcategories: 0,
            cards: 0,
            settingsCreated: false,
            fixedIncomeCreated: false,
        });
    });

    it("creates a FIXED income row for the admin on a fresh database", async () => {
        const { db, income } = makeDb({ incomeExists: false });
        const summary = await runSeed(
            db,
            ADMIN,
            new FakeUserProvisioningRepository(),
        );

        expect(income.create).toHaveBeenCalledTimes(1);
        const data = income.create.mock.calls[0]![0].data;
        expect(data).toMatchObject({ userId: "user-1", type: "FIXED" });
        expect(data.amount).toBeGreaterThan(0);
        expect(summary.fixedIncomeCreated).toBe(true);
    });

    it("does not recreate the FIXED income row on re-seed (idempotent)", async () => {
        const { db, income } = makeDb({ incomeExists: true });
        const summary = await runSeed(
            db,
            ADMIN,
            new FakeUserProvisioningRepository(),
        );

        expect(income.create).not.toHaveBeenCalled();
        expect(summary.fixedIncomeCreated).toBe(false);
    });

    it("surfaces a provisioning failure instead of reporting success", async () => {
        const { db, income } = makeDb();
        const provisioning = new FakeUserProvisioningRepository();
        provisioning.failOnWrite = true;

        await expect(runSeed(db, ADMIN, provisioning)).rejects.toThrow(
            /provision failed/,
        );
        expect(income.create).not.toHaveBeenCalled();
    });
});
