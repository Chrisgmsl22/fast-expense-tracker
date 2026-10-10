// @vitest-environment node
import { describe, it, expect } from "vitest";

import * as starterKit from "@/lib/domain/starter-kit";
import {
    STARTER_CARDS,
    STARTER_CATEGORIES,
    STARTER_SETTINGS,
} from "@/lib/domain/starter-kit";
import {
    PARTNER_PAYMENT_CATEGORY_SLUG,
    PARTNER_PAYMENT_SUBCATEGORY_NAME,
} from "@/lib/domain/expense";
import { CASH_COLOR } from "@/lib/palette";

const HEX = /^#[0-9a-f]{6}$/i;
const OWNER_CARD_NAMES = ["Amex Platinum", "Amex Gold", "NU", "BBVA"];

describe("STARTER_CATEGORIES", () => {
    it("Should hold the 13 reference categories with unique slugs", () => {
        expect(STARTER_CATEGORIES).toHaveLength(13);
        expect(new Set(STARTER_CATEGORIES.map((c) => c.slug)).size).toBe(13);
    });

    it("Should encode the 50/25/25 relevance flags from the domain reference", () => {
        const irrelevant = STARTER_CATEGORIES.filter((c) => !c.isRelevant)
            .map((c) => c.slug)
            .sort();
        expect(irrelevant).toEqual([
            "disposable-income",
            "personal",
            "unassigned",
        ]);
    });

    it("Should give every category a hex color, gray only for the unassigned sentinel", () => {
        for (const c of STARTER_CATEGORIES) {
            expect(c.color).toMatch(HEX);
            expect(c.color === "#6b7280").toBe(c.slug === "unassigned");
        }
    });

    it("Should give the unassigned sentinel no subcategories", () => {
        const unassigned = STARTER_CATEGORIES.find(
            (c) => c.slug === "unassigned",
        );
        expect(unassigned?.subcategories).toEqual([]);
    });

    it("Should carry no duplicate subcategory names within a category", () => {
        for (const c of STARTER_CATEGORIES) {
            expect(new Set(c.subcategories).size).toBe(c.subcategories.length);
        }
    });

    it("Should hold the partner-payment subcategory exactly once, under the name the code looks up", () => {
        const combined = STARTER_CATEGORIES.find(
            (c) => c.slug === PARTNER_PAYMENT_CATEGORY_SLUG,
        );
        expect(
            combined?.subcategories.filter(
                (n) => n === PARTNER_PAYMENT_SUBCATEGORY_NAME,
            ),
        ).toHaveLength(1);
        expect(combined?.subcategories).not.toContain(
            "Purchases made by girlfriend",
        );
    });
});

describe("STARTER_CARDS", () => {
    it("Should be exactly one Cash card in the locked cash color", () => {
        expect(STARTER_CARDS).toEqual([
            { name: "Cash", color: CASH_COLOR, type: "cash" },
        ]);
    });

    it("Should hold none of the owner's cards", () => {
        const names = STARTER_CARDS.map((c) => c.name);
        for (const owner of OWNER_CARD_NAMES) {
            expect(names).not.toContain(owner);
        }
    });
});

describe("STARTER_SETTINGS", () => {
    it("Should start in Solo mode with an explicit 50% split", () => {
        expect(STARTER_SETTINGS).toEqual({
            sharesExpenses: false,
            defaultSharePercentage: 0.5,
        });
    });
});

describe("the starter kit module", () => {
    it("Should export no owner identity and no income", () => {
        expect(Object.keys(starterKit).sort()).toEqual([
            "STARTER_CARDS",
            "STARTER_CATEGORIES",
            "STARTER_SETTINGS",
        ]);
        const text = JSON.stringify(starterKit);
        expect(text).not.toMatch(/christian/i);
        for (const owner of OWNER_CARD_NAMES) {
            expect(text).not.toContain(`"${owner}"`);
        }
    });
});
