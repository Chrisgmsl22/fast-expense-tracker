// What every new account starts with (ADR-0022 §3), shared by the owner seed and
// signup so they cannot drift. Holds no owner data. Imports stay relative `.ts`
// with no `@/` alias: `prisma/seed.ts` loads this module under plain Node.

import { CASH_COLOR } from "../palette.ts";

export type StarterCategory = {
    slug: string;
    name: string;
    color: string;
    isRelevant: boolean;
    subcategories: readonly string[];
};

export type StarterCardType = "credit" | "debit" | "cash";

export type StarterCard = {
    name: string;
    color: string;
    type: StarterCardType;
};

/** The 13 categories in reference order (docs/reference/domain-reference.md §1). */
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
        // Matched BY NAME against `PARTNER_PAYMENT_SUBCATEGORY_NAME` and the rename
        // in `20260916230000_convert_partner_payments`; change all three together.
        subcategories: [
            "Covered for me",
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
        // The sentinel for orphaned expenses: gray on purpose, no subcategories.
        slug: "unassigned",
        name: "Unassigned",
        color: "#6b7280",
        isRelevant: false,
        subcategories: [],
    },
];

/** Cash only: the UI cannot add a `type: "cash"` card, so an account without one could never log cash. */
export const STARTER_CARDS: readonly StarterCard[] = [
    { name: "Cash", color: CASH_COLOR, type: "cash" },
];

/** Solo mode. The split is written explicitly so a new account never inherits the schema's 0.68. */
export const STARTER_SETTINGS = {
    sharesExpenses: false,
    defaultSharePercentage: 0.5,
} as const;
