// Idempotent database seed: the single admin user (bcrypt-hashed password from
// env), provisioned with the shared new-user starter kit, plus the owner-only
// extras — four branded cards and an illustrative fixed income.
//
// The starter kit (13 categories + subcategories, the Cash card, Solo settings)
// lives in lib/domain/starter-kit.ts and is written by
// lib/repositories/user-provisioning.repository.ts, so this seed and signup
// (CHORE-8.d) provision identically and cannot drift. Source of truth for the
// data: docs/reference/domain-reference.md §1 + §4.
//
// Runnable via `pnpm db:seed` (or `prisma db seed`), which loads .env.local and
// runs this file under Node's native TypeScript stripping. To keep that path
// dependency-free this file imports only published packages and relative `.ts`
// paths (no `@/` aliases, which Node can't resolve) — hence the local
// `new PrismaClient()` instead of the `lib/db.ts` singleton. The singleton
// exists to avoid pool exhaustion under Next.js hot-reload; a one-shot CLI
// script has no such concern.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Card colours come from the shared palette (spec 0006 §6) so the seed, the
// login-page dots, and the in-app picker can never drift apart again.
import { CARD_PALETTE } from "../lib/palette.ts";
import type { StarterCard } from "../lib/domain/starter-kit.ts";
import {
    PrismaUserProvisioningRepository,
    type UserProvisioningRepository,
} from "../lib/repositories/user-provisioning.repository.ts";

const BCRYPT_ROUNDS = 10;

/** The seeded card colours, by palette swatch name. */
function paletteHex(name: string): string {
    const swatch = CARD_PALETTE.find((s) => s.name === name);
    if (!swatch) throw new Error(`Unknown palette colour: ${name}`);
    return swatch.hex;
}

// The owner's four branded cards — real accounts of Christian's, so they belong
// to this seed and NOT to the starter kit every new user gets. Cash is the one
// card everyone gets; the starter kit provisions it (see STARTER_CARDS).
// Card-color coding: Platinum gray, Gold gold, NU purple, BBVA blue
// (domain-reference.md §4).
export const OWNER_CARDS: readonly StarterCard[] = [
    { name: "Amex Platinum", color: paletteHex("Slate"), type: "credit" },
    { name: "Amex Gold", color: paletteHex("Gold"), type: "credit" },
    { name: "NU", color: paletteHex("Purple"), type: "credit" },
    { name: "BBVA", color: paletteHex("Blue"), type: "debit" },
];

export type SeedOptions = {
    adminEmail: string;
    adminPassword: string;
};

// Illustrative FIXED monthly income for local dev so the Income screen + the
// dashboard have data. NOT real personal financial data — the repo is public.
const FIXED_INCOME_SEED = 40000;

export type SeedSummary = {
    categories: number;
    subcategories: number;
    cards: number;
    settingsCreated: boolean;
    fixedIncomeCreated: boolean;
};

/**
 * Seeds the admin user, provisions them the shared starter kit, then adds the
 * owner-only extras (branded cards + a fixed income row).
 *
 * Idempotent: the user upserts on the unique email, the starter kit is
 * idempotent by construction (see `provisionNewUser`), and the fixed-income row
 * is created only when absent so a re-seed never overwrites a value edited via
 * the Income screen.
 *
 * The provisioning repository is injected (default param) so tests can drive
 * the seed's own logic without a database.
 */
export async function runSeed(
    db: PrismaClient,
    { adminEmail, adminPassword }: SeedOptions,
    provisioning: UserProvisioningRepository = new PrismaUserProvisioningRepository(
        db,
    ),
): Promise<SeedSummary> {
    // The owner is created first: the starter kit is per-user (ADR-0022), so it
    // needs the owner's id to stamp on every row.
    const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);
    const admin = await db.user.upsert({
        where: { email: adminEmail },
        create: {
            email: adminEmail,
            name: "Christian",
            password: passwordHash,
        },
        // Don't reset the password on re-seed; keep any rotated value.
        update: {},
    });

    const provisioned = await provisioning.provisionNewUser(admin.id);
    const ownerCardsCreated = await provisioning.ensureCards(
        admin.id,
        OWNER_CARDS,
    );

    // One FIXED income row per user (the recurring monthly amount). Find-then-
    // create — no unique constraint on (userId, type) — so a re-seed never
    // overwrites a value the user has since edited via the Income screen.
    const existingFixed = await db.income.findFirst({
        where: { userId: admin.id, type: "FIXED" },
        select: { id: true },
    });
    let fixedIncomeCreated = false;
    if (!existingFixed) {
        await db.income.create({
            data: {
                userId: admin.id,
                type: "FIXED",
                amount: FIXED_INCOME_SEED,
            },
        });
        fixedIncomeCreated = true;
    }

    return {
        categories: provisioned.categoriesUpserted,
        subcategories: provisioned.subcategoriesCreated,
        cards: provisioned.cardsCreated + ownerCardsCreated,
        settingsCreated: provisioned.settingsCreated,
        fixedIncomeCreated,
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
        const summary = await runSeed(db, { adminEmail, adminPassword });
        console.log(
            `Seed complete: ${summary.categories} categories, ` +
                `${summary.subcategories} new subcategories, ` +
                `${summary.cards} new cards, ` +
                `${summary.settingsCreated ? "1 new" : "no new"} settings row, ` +
                `${summary.fixedIncomeCreated ? "1 new" : "no new"} fixed-income row.`,
        );
    } finally {
        await db.$disconnect();
    }
}

// Only run when executed directly (e.g. `node prisma/seed.ts`), not when
// imported by tests. `import.meta.main` is available on Node >= 24.2.
if (import.meta.main) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
