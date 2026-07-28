/**
 * The new-user starter kit — the data every fresh account begins with
 * (ADR-0022 §3). Pure data: no DB, no env, no framework. The write side lives
 * in `lib/repositories/user-provisioning.repository.ts`.
 *
 * This is the SINGLE source shared by the owner seed (`prisma/seed.ts`) and, as
 * of CHORE-8.d, public signup — so the two can never drift.
 *
 * Category slugs, names, `isRelevant` flags and subcategories are the FROZEN
 * reference in docs/reference/domain-reference.md §1. Don't change them here
 * without changing that document.
 *
 * `../palette.ts` is imported by relative path WITH the `.ts` extension rather
 * than the `@/` alias because `prisma/seed.ts` runs under plain Node (which
 * can't resolve tsconfig path aliases) and reaches this module. Same reason the
 * seed itself imports the palette that way.
 */

import { CASH_COLOR } from "../palette.ts";

/** One default category, with the subcategories a fresh account gets under it. */
export type StarterCategory = {
    slug: string;
    name: string;
    /** Per-category display hex, stored on the row and user-editable. */
    color: string;
    /** 50/25/25 essentials-vs-discretionary flag (domain-reference.md §1). */
    isRelevant: boolean;
    subcategories: readonly string[];
};

/**
 * The 13 default categories + subcategories, in reference order. Colors are the
 * authoritative per-slug values (the design system's category colors in
 * docs/designs-screens/README.md are illustrative); every account starts with
 * these and may recolor its own copy afterwards.
 */
export const STARTER_CATEGORIES: readonly StarterCategory[] = [
    {
        slug: "housing",
        name: "Housing",
        color: "#4f46e5",
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
        color: "#65a30d",
        isRelevant: true,
        subcategories: ["Groceries", "Restaurants/other"],
    },
    {
        slug: "charity",
        name: "Charity",
        color: "#db2777",
        isRelevant: true,
        subcategories: ["Taxes", "Donations"],
    },
    {
        slug: "transport",
        name: "Transport",
        color: "#7c3aed",
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
        color: "#0891b2",
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
        color: "#0d9488",
        isRelevant: true,
        subcategories: ["Emergency fund", "Open savings", "Future purchases"],
    },
    {
        slug: "services",
        name: "Services",
        color: "#2563eb",
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
        color: "#e11d48",
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
        color: "#d97706",
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
        color: "#0ea5e9",
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
        color: "#b91c1c",
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
        color: "#c026d3",
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
        // Sentinel for orphaned expenses — no subcategories (domain-reference §1).
        slug: "unassigned",
        name: "Unassigned",
        color: "#6b7280",
        isRelevant: false,
        subcategories: [],
    },
];

/** Persisted `Card.type` values (domain-reference.md §4). */
export type StarterCardType = "credit" | "debit" | "cash";

/** One card to ensure on an account, matched by name. */
export type StarterCard = {
    name: string;
    color: string;
    type: StarterCardType;
};

export const CASH_CARD_NAME = "Cash";

/**
 * The cards a fresh account starts with: **Cash only, and it is required.**
 *
 * Since CHORE-6.c the UI cannot add a `type:"cash"` card — cash is a per-user
 * singleton the app treats as the sentinel for cash spend — so an account
 * provisioned without one would be permanently unable to record a cash expense
 * against a card.
 *
 * No generic "Credit card"/"Debit card" placeholders: real cards are added in
 * Settings → Cards with the user's own names and colors, and placeholder rows
 * would only be noise to rename or archive. (The owner's five branded cards are
 * seed-specific and live in `prisma/seed.ts`.)
 */
export const STARTER_CARDS: readonly StarterCard[] = [
    { name: CASH_CARD_NAME, color: CASH_COLOR, type: "cash" },
];

/**
 * The settings a fresh account starts with: Solo mode (spec 0006 / ADR-0021).
 * Every other column keeps its schema default. Shared-expense mode, the partner
 * name, and the split percentage are opt-in from Settings.
 */
export const STARTER_SETTINGS = { sharesExpenses: false } as const;
