// @vitest-environment node
import { describe, it, expect } from "vitest";

import { CASH_COLOR } from "@/lib/palette";
import {
    CASH_CARD_NAME,
    STARTER_CARDS,
    STARTER_CATEGORIES,
    STARTER_SETTINGS,
} from "@/lib/domain/starter-kit";

// The starter kit is the frozen default set every account begins with
// (ADR-0022 §3 / domain-reference.md §1 + §4). These assertions guard the
// contract itself: drift here silently changes what new users receive.

const HEX = /^#[0-9a-f]{6}$/i;

describe("STARTER_CATEGORIES", () => {
    it("defines all 13 system categories from the frozen reference", () => {
        expect(STARTER_CATEGORIES).toHaveLength(13);
        expect(STARTER_CATEGORIES.map((c) => c.slug)).toEqual([
            "housing",
            "groceries",
            "charity",
            "transport",
            "insurance",
            "savings",
            "services",
            "health",
            "combined-expenses",
            "personal",
            "debt",
            "disposable-income",
            "unassigned",
        ]);
    });

    it("keeps every slug unique (the per-user upsert key)", () => {
        const slugs = STARTER_CATEGORIES.map((c) => c.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
    });

    it("encodes the 50/25/25 isRelevant flags", () => {
        const bySlug = Object.fromEntries(
            STARTER_CATEGORIES.map((c) => [c.slug, c]),
        );
        expect(bySlug["housing"]?.isRelevant).toBe(true);
        expect(bySlug["savings"]?.isRelevant).toBe(true);
        expect(bySlug["debt"]?.isRelevant).toBe(true);
        expect(bySlug["personal"]?.isRelevant).toBe(false);
        expect(bySlug["disposable-income"]?.isRelevant).toBe(false);
        expect(bySlug["unassigned"]?.isRelevant).toBe(false);
    });

    it("gives every category a display hex and a non-empty name", () => {
        for (const category of STARTER_CATEGORIES) {
            expect(category.color).toMatch(HEX);
            expect(category.name.trim()).not.toBe("");
        }
    });

    it("gives the unassigned sentinel no subcategories", () => {
        const unassigned = STARTER_CATEGORIES.find(
            (c) => c.slug === "unassigned",
        );
        expect(unassigned?.subcategories).toEqual([]);
    });

    it("gives every other category at least one subcategory", () => {
        for (const category of STARTER_CATEGORIES) {
            if (category.slug === "unassigned") continue;
            expect(category.subcategories.length).toBeGreaterThan(0);
        }
    });

    it("never repeats a subcategory name inside a category", () => {
        for (const category of STARTER_CATEGORIES) {
            const names = category.subcategories;
            expect(new Set(names).size).toBe(names.length);
        }
    });

    it("matches the reference subcategory lists for a spot-check of categories", () => {
        const bySlug = Object.fromEntries(
            STARTER_CATEGORIES.map((c) => [c.slug, c]),
        );
        expect(bySlug["groceries"]?.subcategories).toEqual([
            "Groceries",
            "Restaurants/other",
        ]);
        expect(bySlug["savings"]?.subcategories).toEqual([
            "Emergency fund",
            "Open savings",
            "Future purchases",
        ]);
        expect(bySlug["debt"]?.subcategories).toEqual([
            "Car loan",
            "Credit card balance",
            "Personal loans",
            "Monthly installments",
        ]);
    });
});

describe("STARTER_CARDS", () => {
    it("provisions the required Cash card and nothing else", () => {
        expect(STARTER_CARDS).toHaveLength(1);
        expect(STARTER_CARDS[0]).toEqual({
            name: CASH_CARD_NAME,
            color: CASH_COLOR,
            type: "cash",
        });
    });

    it("includes a cash card, since the UI cannot add one (CHORE-6.c)", () => {
        expect(STARTER_CARDS.some((c) => c.type === "cash")).toBe(true);
    });
});

describe("STARTER_SETTINGS", () => {
    it("starts a fresh account in Solo mode", () => {
        expect(STARTER_SETTINGS.sharesExpenses).toBe(false);
    });
});
