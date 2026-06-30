// Idempotent database seed: 13 system categories + subcategories, 5 cards,
// and the single admin user (bcrypt-hashed password from env).
//
// Source of truth for the data: docs/reference/domain-reference.md §1 + §4.
//
// Runnable via `pnpm db:seed` (or `prisma db seed`), which loads .env.local and
// runs this file under Node's native TypeScript stripping. To keep that path
// dependency-free this file imports only published packages (no `@/` aliases,
// which Node can't resolve) — hence the local `new PrismaClient()` instead of
// the `lib/db.ts` singleton. The singleton exists to avoid pool exhaustion
// under Next.js hot-reload; a one-shot CLI script has no such concern.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

type CategorySeed = {
    slug: string;
    name: string;
    isRelevant: boolean;
    subcategories: string[];
};

type CardSeed = {
    name: string;
    color: string;
    type: "credit" | "debit" | "cash";
};

// 13 system categories — order and isRelevant flags per domain-reference.md §1.
export const CATEGORY_SEED: readonly CategorySeed[] = [
    {
        slug: "housing",
        name: "Housing",
        isRelevant: true,
        subcategories: [
            "Rent",
            "Mortgage",
            "House expenses",
            "Repairs/maintenance",
            "Tax/fees",
        ],
    },
    {
        slug: "groceries",
        name: "Groceries",
        isRelevant: true,
        subcategories: ["Groceries", "Restaurants/other"],
    },
    {
        slug: "charity",
        name: "Charity",
        isRelevant: true,
        subcategories: ["Taxes", "Donations"],
    },
    {
        slug: "transport",
        name: "Transport",
        isRelevant: true,
        subcategories: [
            "Gasoline",
            "Repairs/tires",
            "License/fees",
            "Parking/tolls",
            "Public transportation",
            "Ubers",
            "Car maintenance",
        ],
    },
    {
        slug: "insurance",
        name: "Insurance",
        isRelevant: true,
        subcategories: [
            "Life",
            "Medical expenses",
            "House",
            "Car",
            "Handicap",
            "Theft",
            "Long-term care",
        ],
    },
    {
        slug: "savings",
        name: "Savings",
        isRelevant: true,
        subcategories: ["Emergency fund", "Open savings", "Future purchases"],
    },
    {
        slug: "services",
        name: "Services",
        isRelevant: true,
        subcategories: [
            "Electricity",
            "Gas",
            "Water",
            "Trash",
            "Phone plan",
            "Internet",
        ],
    },
    {
        slug: "health",
        name: "Health",
        isRelevant: true,
        subcategories: [
            "Medicine",
            "Doctors appt",
            "Dentist",
            "Additional medication",
            "Therapy",
            "Other expenses",
        ],
    },
    {
        slug: "combined-expenses",
        name: "Combined Expenses",
        isRelevant: true,
        subcategories: [
            "Purchases made by girlfriend",
            "Purchases made between the two",
            "Cats",
        ],
    },
    {
        slug: "personal",
        name: "Personal",
        isRelevant: false,
        subcategories: [
            "Courses",
            "Education",
            "Books",
            "Subscriptions",
            "Cash withdrawals",
            "Technology",
            "Accountant",
            "Other",
        ],
    },
    {
        slug: "debt",
        name: "Debt",
        isRelevant: true,
        subcategories: [
            "Car loan",
            "Credit card balance",
            "Personal loans",
            "Monthly installments",
        ],
    },
    {
        slug: "disposable-income",
        name: "Disposable Income",
        isRelevant: false,
        subcategories: [
            "Entertainment",
            "Hobbies",
            "Dining out",
            "Social events",
            "Tech gadgets",
            "Ecommerce expenses",
        ],
    },
    {
        // Sentinel for orphaned expenses — no subcategories (domain-reference.md §1).
        slug: "unassigned",
        name: "Unassigned",
        isRelevant: false,
        subcategories: [],
    },
];

// Per-category display colors (hex). Keyed by slug; unmapped slugs fall back to
// neutral grey. Categories store hex directly (user-editable) — unlike cards,
// which store semantic color names. Palette is inspired by the design system's
// category colors (illustrative in docs/designs-screens/README.md; the per-slug
// values here are authoritative).
const CATEGORY_COLORS: Record<string, string> = {
    housing: "#4f46e5",
    groceries: "#65a30d",
    charity: "#db2777",
    transport: "#7c3aed",
    insurance: "#0891b2",
    savings: "#0d9488",
    services: "#2563eb",
    health: "#e11d48",
    "combined-expenses": "#d97706",
    personal: "#0ea5e9",
    debt: "#b91c1c",
    "disposable-income": "#c026d3",
    unassigned: "#6b7280",
};

// 5 cards — per-card brand hex, applied inline in the UI exactly like
// Category.color (see globals.css design-tokens note + domain-reference.md §4).
// Card-color coding: Platinum gray, Gold gold, NU purple, BBVA blue, Cash green.
export const CARD_SEED: readonly CardSeed[] = [
    { name: "Amex Platinum", color: "#6b7280", type: "credit" },
    { name: "Amex Gold", color: "#ca8a04", type: "credit" },
    { name: "NU", color: "#9333ea", type: "credit" },
    { name: "BBVA", color: "#2563eb", type: "debit" },
    { name: "Cash", color: "#16a34a", type: "cash" },
];

export type SeedOptions = {
    adminEmail: string;
    adminPassword: string;
};

export type SeedSummary = {
    categories: number;
    subcategories: number;
    cards: number;
};

/**
 * Seeds categories, subcategories, cards, and the admin user. Idempotent:
 * categories/user use `upsert` (unique slug/email); subcategories/cards have no
 * natural unique constraint, so they are created only when absent.
 *
 * The find-then-create for subcategories/cards is check-then-act: it assumes a
 * single-process run (the `pnpm db:seed` CLI). Two concurrent seeds could race
 * and double-insert — acceptable for a one-shot personal-tool seed, and the
 * reason there's no `@@unique([categoryId, name])` to lean on.
 */
export async function runSeed(
    db: PrismaClient,
    { adminEmail, adminPassword }: SeedOptions,
): Promise<SeedSummary> {
    let subcategoryCount = 0;

    for (const cat of CATEGORY_SEED) {
        const category = await db.category.upsert({
            where: { slug: cat.slug },
            create: {
                slug: cat.slug,
                name: cat.name,
                color: CATEGORY_COLORS[cat.slug] ?? "#6b7280",
                isRelevant: cat.isRelevant,
                isSystemCategory: true,
            },
            update: {
                name: cat.name,
                color: CATEGORY_COLORS[cat.slug] ?? "#6b7280",
                isRelevant: cat.isRelevant,
                isSystemCategory: true,
            },
        });

        for (const name of cat.subcategories) {
            const existing = await db.subcategory.findFirst({
                where: { categoryId: category.id, name },
            });
            if (!existing) {
                await db.subcategory.create({
                    data: { categoryId: category.id, name },
                });
                subcategoryCount += 1;
            }
        }
    }

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

    let cardCount = 0;
    for (const card of CARD_SEED) {
        const existing = await db.card.findFirst({
            where: { userId: admin.id, name: card.name },
        });
        if (existing) {
            // Refresh color/type so a re-seed propagates brand-hex changes to
            // cards created before this fix (find-then-create alone never would).
            await db.card.update({
                where: { id: existing.id },
                data: { color: card.color, type: card.type },
            });
        } else {
            await db.card.create({
                data: {
                    userId: admin.id,
                    name: card.name,
                    color: card.color,
                    type: card.type,
                },
            });
            cardCount += 1;
        }
    }

    return {
        categories: CATEGORY_SEED.length,
        subcategories: subcategoryCount,
        cards: cardCount,
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
                `${summary.cards} new cards.`,
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
