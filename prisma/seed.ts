// Idempotent seed, run locally and by hand against prod (`pnpm db:seed:prod`): the
// owner, given the starter kit every new account gets, plus his own cards and a fixed
// income. Runs under Node's type stripping: relative `.ts` imports, own PrismaClient.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import type { StarterCard } from "../lib/domain/starter-kit.ts";
import { normalizeEmail } from "../lib/domain/user.ts";
import { CARD_PALETTE } from "../lib/palette.ts";
import {
    PrismaUserProvisioningRepository,
    type ProvisionSummary,
    type UserProvisioningRepository,
} from "../lib/repositories/user-provisioning.repository.ts";

const BCRYPT_ROUNDS = 10;

function paletteHex(name: string): string {
    const swatch = CARD_PALETTE.find((s) => s.name === name);
    if (!swatch) throw new Error(`Unknown palette colour: ${name}`);
    return swatch.hex;
}

/** The owner's own cards. Cash comes from the starter kit. */
export const OWNER_CARDS: readonly StarterCard[] = [
    { name: "Amex Platinum", color: paletteHex("Slate"), type: "credit" },
    { name: "Amex Gold", color: paletteHex("Gold"), type: "credit" },
    { name: "NU", color: paletteHex("Purple"), type: "credit" },
    { name: "BBVA", color: paletteHex("Blue"), type: "debit" },
];

// Illustrative, not his real income: the repo is public.
const FIXED_INCOME_SEED = 40000;

export type SeedOptions = {
    adminEmail: string;
    adminPassword: string;
};

export type SeedSummary = {
    provisioned: ProvisionSummary;
    ownerCardsCreated: number;
    fixedIncomeCreated: boolean;
};

export async function runSeed(
    db: PrismaClient,
    { adminEmail, adminPassword }: SeedOptions,
    provisioning: UserProvisioningRepository = new PrismaUserProvisioningRepository(
        db,
    ),
): Promise<SeedSummary> {
    const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);
    const email = normalizeEmail(adminEmail);
    const admin = await db.user.upsert({
        where: { email },
        create: { email, name: "Christian", password: passwordHash },
        // Don't reset the password on re-seed; keep any rotated value.
        update: {},
    });

    const provisioned = await provisioning.provisionNewUser(admin.id);

    let ownerCardsCreated = 0;
    for (const card of OWNER_CARDS) {
        const existing = await db.card.findFirst({
            where: { userId: admin.id, name: card.name },
            select: { id: true },
        });
        if (existing) {
            // Refresh so a palette change reaches cards seeded before it.
            await db.card.update({
                where: { id: existing.id },
                data: { color: card.color, type: card.type },
            });
        } else {
            await db.card.create({ data: { userId: admin.id, ...card } });
            ownerCardsCreated += 1;
        }
    }

    // Only when absent, so a re-seed never overwrites a value edited on the Income screen.
    const existingFixed = await db.income.findFirst({
        where: { userId: admin.id, type: "FIXED" },
        select: { id: true },
    });
    if (!existingFixed) {
        await db.income.create({
            data: {
                userId: admin.id,
                type: "FIXED",
                amount: FIXED_INCOME_SEED,
            },
        });
    }

    return {
        provisioned,
        ownerCardsCreated,
        fixedIncomeCreated: !existingFixed,
    };
}

async function main(): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
        // No fallback admin credentials (ADR-0003) — fail loudly.
        throw new Error(
            "ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the admin user.",
        );
    }

    const db = new PrismaClient();
    try {
        const { provisioned, ownerCardsCreated, fixedIncomeCreated } =
            await runSeed(db, { adminEmail, adminPassword });
        console.log(
            `Seed complete: ${provisioned.categoriesCreated} new categories, ` +
                `${provisioned.subcategoriesCreated} new subcategories, ` +
                `${provisioned.cardsCreated + ownerCardsCreated} new cards, ` +
                `${provisioned.settingsCreated ? "1 new" : "no new"} settings row, ` +
                `${fixedIncomeCreated ? "1 new" : "no new"} fixed-income row.`,
        );
    } finally {
        await db.$disconnect();
    }
}

// Only when executed directly, not when imported by tests (Node >= 24.2).
if (import.meta.main) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
