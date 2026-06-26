// Dev-only demo data: a few months of expenses across categories + cards so the
// dashboards/lists have something to render. NOT for production.
//
// Re-runnable: it wipes the admin user's expenses + movements and reinserts a
// deterministic demo set (so repeated runs don't pile up duplicates). Run AFTER
// the system seed (`pnpm db:seed`), which creates the categories, cards, and
// admin user this script looks up.
//
// Runnable via `pnpm db:seed:dev` (loads .env.local). Like prisma/seed.ts it
// imports only published packages (no `@/` aliases) and uses a local
// PrismaClient — Node runs it directly with TypeScript stripping.

import { PrismaClient } from "@prisma/client";

// CDMX is UTC-6 (no DST). Capture stores a calendar day as that day's local
// midnight in UTC (06:00Z), so month-boundary queries land in the right month —
// match that here.
const CDMX_UTC_OFFSET_HOURS = 6;
function cdmxDay(year: number, monthIndex: number, day: number): Date {
    return new Date(Date.UTC(year, monthIndex, day, CDMX_UTC_OFFSET_HOURS));
}

// One demo expense template. `day` is the day-of-month; `shared` expenses use the
// default split. Card + category/subcategory are matched by name/slug.
type Template = {
    day: number;
    categorySlug: string;
    subcategory?: string;
    cardName: string;
    description: string;
    amount: number;
    shared?: boolean;
};

// A month's worth of varied spend: essentials + discretionary + savings, across
// all five cards, a mix of shared/solo. Applied to each of the last few months.
const MONTHLY_TEMPLATES: readonly Template[] = [
    {
        day: 1,
        categorySlug: "housing",
        subcategory: "Rent",
        cardName: "BBVA",
        description: "Monthly rent",
        amount: 12000,
        shared: true,
    },
    {
        day: 2,
        categorySlug: "services",
        subcategory: "Electricity",
        cardName: "BBVA",
        description: "CFE electricity",
        amount: 850,
        shared: true,
    },
    {
        day: 3,
        categorySlug: "services",
        subcategory: "Internet",
        cardName: "BBVA",
        description: "Internet",
        amount: 650,
        shared: true,
    },
    {
        day: 5,
        categorySlug: "groceries",
        subcategory: "Groceries",
        cardName: "Amex Gold",
        description: "Weekly groceries",
        amount: 1900,
        shared: true,
    },
    {
        day: 7,
        categorySlug: "transport",
        subcategory: "Gasoline",
        cardName: "Amex Platinum",
        description: "Gas",
        amount: 950,
    },
    {
        day: 9,
        categorySlug: "disposable-income",
        subcategory: "Dining out",
        cardName: "Amex Gold",
        description: "Dinner out",
        amount: 1250,
        shared: true,
    },
    {
        day: 12,
        categorySlug: "groceries",
        subcategory: "Restaurants/other",
        cardName: "NU",
        description: "Tacos",
        amount: 420,
        shared: true,
    },
    {
        day: 14,
        categorySlug: "health",
        subcategory: "Doctors appt",
        cardName: "Cash",
        description: "Doctor visit",
        amount: 800,
    },
    {
        day: 16,
        categorySlug: "personal",
        subcategory: "Subscriptions",
        cardName: "NU",
        description: "Streaming subscriptions",
        amount: 320,
    },
    {
        day: 18,
        categorySlug: "transport",
        subcategory: "Ubers",
        cardName: "Amex Platinum",
        description: "Ubers",
        amount: 540,
    },
    {
        day: 20,
        categorySlug: "combined-expenses",
        subcategory: "Cats",
        cardName: "Cash",
        description: "Cat food + litter",
        amount: 480,
        shared: true,
    },
    {
        day: 22,
        categorySlug: "disposable-income",
        subcategory: "Entertainment",
        cardName: "Amex Gold",
        description: "Movies",
        amount: 360,
        shared: true,
    },
    {
        day: 25,
        categorySlug: "savings",
        subcategory: "Emergency fund",
        cardName: "BBVA",
        description: "Monthly savings transfer",
        amount: 5000,
    },
    {
        day: 27,
        categorySlug: "groceries",
        subcategory: "Groceries",
        cardName: "Amex Gold",
        description: "Groceries",
        amount: 1650,
        shared: true,
    },
];

// A handful of per-category monthly budgets so the dashboard's category bars show
// under/over states. Keyed by slug.
const CATEGORY_BUDGETS: Record<string, number> = {
    groceries: 6500,
    transport: 3000,
    "disposable-income": 4000,
    services: 2500,
    health: 1500,
};

const DEMO_MONTHLY_INCOME = 60000;

function lastNMonths(n: number): { year: number; monthIndex: number }[] {
    const now = new Date();
    const out: { year: number; monthIndex: number }[] = [];
    for (let i = 0; i < n; i += 1) {
        const d = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
        );
        out.push({ year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() });
    }
    return out;
}

async function main(): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
        throw new Error("ADMIN_EMAIL must be set (run `pnpm db:seed` first).");
    }

    const sharePercent = Number(
        process.env.NEXT_PUBLIC_DEFAULT_SHARE_PERCENT ?? "0.68",
    );

    const db = new PrismaClient();
    try {
        const admin = await db.user.findUnique({
            where: { email: adminEmail },
        });
        if (!admin) {
            throw new Error(
                `No user ${adminEmail}. Run \`pnpm db:seed\` before \`pnpm db:seed:dev\`.`,
            );
        }

        const categories = await db.category.findMany({
            include: { subcategories: true },
        });
        const cards = await db.card.findMany({ where: { userId: admin.id } });
        if (categories.length === 0 || cards.length === 0) {
            throw new Error(
                "No categories/cards found. Run `pnpm db:seed` first.",
            );
        }
        const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
        const cardByName = new Map(cards.map((c) => [c.name, c]));

        // Re-runnable: clear the admin's existing expenses/movements first.
        await db.expense.deleteMany({ where: { userId: admin.id } });
        await db.movement.deleteMany({ where: { userId: admin.id } });

        let created = 0;
        for (const { year, monthIndex } of lastNMonths(3)) {
            for (const t of MONTHLY_TEMPLATES) {
                const category = categoryBySlug.get(t.categorySlug);
                const card = cardByName.get(t.cardName);
                if (!category || !card) continue; // skip if a slug/card is missing
                const subcategory = t.subcategory
                    ? category.subcategories.find(
                          (s) => s.name === t.subcategory,
                      )
                    : undefined;
                const shared = t.shared ?? false;
                const actualExpenditure = shared
                    ? Math.round(t.amount * sharePercent * 100) / 100
                    : t.amount;

                await db.expense.create({
                    data: {
                        userId: admin.id,
                        categoryId: category.id,
                        subcategoryId: subcategory?.id ?? null,
                        cardId: card.id,
                        date: cdmxDay(year, monthIndex, t.day),
                        description: t.description,
                        amount: t.amount,
                        isShared: shared,
                        yourPercentage: shared ? sharePercent : 1,
                        actualExpenditure,
                        paidBy: "you",
                    },
                });
                created += 1;
            }
        }

        // Per-category budgets so dashboard bars have limits to compare against.
        for (const [slug, monthlyBudget] of Object.entries(CATEGORY_BUDGETS)) {
            const category = categoryBySlug.get(slug);
            if (category) {
                await db.category.update({
                    where: { id: category.id },
                    data: { monthlyBudget },
                });
            }
        }

        // A monthly income so the 50/25/25 targets are non-zero.
        await db.settings.upsert({
            where: { userId: admin.id },
            create: { userId: admin.id, monthlyIncome: DEMO_MONTHLY_INCOME },
            update: { monthlyIncome: DEMO_MONTHLY_INCOME },
        });

        console.log(
            `Dev seed complete: ${created} expenses across 3 months, ` +
                `${Object.keys(CATEGORY_BUDGETS).length} category budgets, ` +
                `monthlyIncome=${DEMO_MONTHLY_INCOME}.`,
        );
    } finally {
        await db.$disconnect();
    }
}

if (import.meta.main) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
