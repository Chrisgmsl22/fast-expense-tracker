// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";

import { OWNER_CARDS, runSeed } from "@/prisma/seed";
import { FakeUserProvisioningRepository } from "@/tests/support/fake-user-provisioning-repository";

const ADMIN = { adminEmail: "admin@example.com", adminPassword: "s3cret-pw" };

/**
 * Only the delegates the seed itself may touch: a direct category, subcategory
 * or settings write throws here. Writes land in `events` to assert step order.
 */
function makeDb(opts: { cardExists?: boolean; incomeExists?: boolean } = {}) {
    const events: string[] = [];
    const user = {
        upsert: vi.fn<
            (args: {
                where: { email: string };
                create: { email: string; name: string; password: string };
                update: Record<string, never>;
            }) => Promise<{ id: string }>
        >(async () => {
            events.push("user.upsert");
            return { id: "user-1" };
        }),
    };
    const card = {
        findFirst: vi.fn<
            (args: {
                where: { userId: string; name: string };
            }) => Promise<{ id: string } | null>
        >(async () => (opts.cardExists ? { id: "card-existing" } : null)),
        create: vi.fn<
            (args: {
                data: {
                    userId: string;
                    name: string;
                    color: string;
                    type: string;
                };
            }) => Promise<{ id: string }>
        >(async () => {
            events.push("card.create");
            return { id: "card-new" };
        }),
        update: vi.fn<
            (args: {
                where: { id: string };
                data: { color: string; type: string };
            }) => Promise<{ id: string }>
        >(async (args) => {
            events.push("card.update");
            return { id: args.where.id };
        }),
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
        >(async () => {
            events.push("income.create");
            return { id: "income-new" };
        }),
    };
    // A partial mock: only the delegates runSeed itself may use.
    const db = { user, card, income } as unknown as Parameters<
        typeof runSeed
    >[0];
    return { db, user, card, income, events };
}

function makeProvisioning(events: string[]) {
    const provisioning = new FakeUserProvisioningRepository();
    const provision = provisioning.provisionNewUser.bind(provisioning);
    vi.spyOn(provisioning, "provisionNewUser").mockImplementation(
        async (userId) => {
            events.push("provision");
            return provision(userId);
        },
    );
    return provisioning;
}

describe("OWNER_CARDS", () => {
    it("Should be the owner's four branded cards and not Cash", () => {
        expect(OWNER_CARDS).toEqual([
            { name: "Amex Platinum", color: "#6b7280", type: "credit" },
            { name: "Amex Gold", color: "#ca8a04", type: "credit" },
            { name: "NU", color: "#9333ea", type: "credit" },
            { name: "BBVA", color: "#2563eb", type: "debit" },
        ]);
    });
});

describe("runSeed", () => {
    it("Should provision the owner first, then add the owner-only extras", async () => {
        const { db, events } = makeDb();
        const provisioning = makeProvisioning(events);

        await runSeed(db, ADMIN, provisioning);

        expect(provisioning.calls).toEqual(["user-1"]);
        expect(events).toEqual([
            "user.upsert",
            "provision",
            "card.create",
            "card.create",
            "card.create",
            "card.create",
            "income.create",
        ]);
    });

    it("Should report what provisioning and the owner extras created", async () => {
        const { db, events } = makeDb();
        const summary = await runSeed(db, ADMIN, makeProvisioning(events));

        expect(summary).toMatchObject({
            provisioned: { categoriesCreated: 13, settingsCreated: true },
            ownerCardsCreated: 4,
            fixedIncomeCreated: true,
        });
    });

    it("Should create the four owner cards for the owner on a fresh database", async () => {
        const { db, card, events } = makeDb({ cardExists: false });
        await runSeed(db, ADMIN, makeProvisioning(events));

        expect(card.create.mock.calls.map((c) => c[0].data)).toEqual(
            OWNER_CARDS.map((c) => ({ userId: "user-1", ...c })),
        );
        expect(card.update).not.toHaveBeenCalled();
    });

    it("Should refresh the owner cards' color and type on a re-seed instead of creating", async () => {
        const { db, card, events } = makeDb({ cardExists: true });
        const summary = await runSeed(db, ADMIN, makeProvisioning(events));

        expect(card.create).not.toHaveBeenCalled();
        expect(card.update.mock.calls.map((c) => c[0].data)).toEqual(
            OWNER_CARDS.map(({ color, type }) => ({ color, type })),
        );
        expect(summary.ownerCardsCreated).toBe(0);
    });

    it("Should create the FIXED income row only when the owner has none", async () => {
        const fresh = makeDb({ incomeExists: false });
        await runSeed(fresh.db, ADMIN, makeProvisioning(fresh.events));
        expect(fresh.income.create).toHaveBeenCalledTimes(1);
        expect(fresh.income.create.mock.calls[0]![0].data).toMatchObject({
            userId: "user-1",
            type: "FIXED",
        });

        const reseed = makeDb({ incomeExists: true });
        const summary = await runSeed(
            reseed.db,
            ADMIN,
            makeProvisioning(reseed.events),
        );
        expect(reseed.income.create).not.toHaveBeenCalled();
        expect(summary.fixedIncomeCreated).toBe(false);
    });

    it("Should stop before the owner extras when provisioning fails", async () => {
        const { db, card, income, events } = makeDb();
        const provisioning = makeProvisioning(events);
        provisioning.failOnWrite = true;

        await expect(runSeed(db, ADMIN, provisioning)).rejects.toThrow();
        expect(card.create).not.toHaveBeenCalled();
        expect(income.create).not.toHaveBeenCalled();
    });

    it("Should upsert the owner by email with a bcrypt hash and never reset the password", async () => {
        const { db, user, events } = makeDb();
        await runSeed(db, ADMIN, makeProvisioning(events));

        const args = user.upsert.mock.calls[0]![0];
        expect(args.where.email).toBe(ADMIN.adminEmail);
        expect(args.create.name).toBe("Christian");
        expect(args.create.password).not.toBe(ADMIN.adminPassword);
        expect(
            bcrypt.compareSync(ADMIN.adminPassword, args.create.password),
        ).toBe(true);
        expect(args.update).toEqual({});
    });

    it("Should key and store the owner email in lowercase, trimmed form", async () => {
        const { db, user, events } = makeDb();
        await runSeed(
            db,
            { ...ADMIN, adminEmail: "  Admin@Example.COM " },
            makeProvisioning(events),
        );

        const args = user.upsert.mock.calls[0]![0];
        expect(args.where.email).toBe("admin@example.com");
        expect(args.create.email).toBe("admin@example.com");
    });
});
