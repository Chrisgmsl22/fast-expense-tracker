import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    PARTNER_PAYMENT_SUBCATEGORY_NAME,
    isPartnerPaymentAutoLabel,
    partnerPaymentDescription,
} from "@/lib/domain/expense";
import { SOLO_PARTNER_FALLBACK } from "@/lib/domain/settings";
import { CATEGORY_SEED } from "@/prisma/seed";

/**
 * The CHORE-12 conversion writes three strings that the running app matches on:
 * the subcategory it files a payment under, and the auto-label a note-less payment
 * takes. SQL cannot import a constant, so these pin the migration text to the
 * constants instead — the file is READ FROM DISK, so a re-typed copy could not
 * notice the deployed statement changing underneath it.
 */
const MIGRATION_SQL = readFileSync(
    join(
        process.cwd(),
        "prisma/migrations/20260916230000_convert_partner_payments/migration.sql",
    ),
    "utf8",
);

/** Only the executable text — a comment quoting an old name must not pass a check. */
const STATEMENTS = MIGRATION_SQL.replace(/--[^\n]*/g, "");

describe("the conversion migration's literals track the code", () => {
    it("files converted payments under the subcategory the app looks up", () => {
        // Drift here files every converted payment with `subcategoryId: null`,
        // silently — `getPartnerPaymentDefaults` matches this name.
        expect(STATEMENTS).toContain(`'${PARTNER_PAYMENT_SUBCATEGORY_NAME}'`);
    });

    it("renames from the exact name live databases still hold", () => {
        expect(STATEMENTS).toContain("'Purchases made by girlfriend'");
    });

    it("writes the app's own auto-label for a payment with no note", () => {
        // `partnerPaymentDescription` builds it from a fixed prefix, and
        // `isPartnerPaymentAutoLabel` matches that prefix to decide whether a
        // description is a user's note. Any other wording would read back as a
        // note, and the settlement journal's edit form would save it as one.
        const autoLabel = partnerPaymentDescription(
            null,
            SOLO_PARTNER_FALLBACK,
        );
        const prefix = autoLabel.slice(
            0,
            autoLabel.length - SOLO_PARTNER_FALLBACK.length,
        );

        expect(STATEMENTS).toContain(`'${prefix}'`);
        expect(STATEMENTS).toContain(`'${SOLO_PARTNER_FALLBACK}'`);
        // The concatenation the SQL performs, checked against the real matcher.
        expect(isPartnerPaymentAutoLabel(`${prefix}Brenda`)).toBe(true);
    });

    it("seeds the same name the migration renames rows to", () => {
        // The trap PR #74 reverted: the seed matches BY NAME, so a seed carrying
        // a name no row holds provisions a duplicate instead of finding the row.
        const combined = CATEGORY_SEED.find(
            (c) => c.slug === "combined-expenses",
        );

        expect(combined?.subcategories).toContain(
            PARTNER_PAYMENT_SUBCATEGORY_NAME,
        );
        expect(combined?.subcategories).not.toContain(
            "Purchases made by girlfriend",
        );
    });

    it("carries the funding source across the conversion", () => {
        // Dropping it turns a savings-funded transfer into an income-funded
        // expense, which then lands in a budget it was never part of.
        expect(STATEMENTS).toContain(`m."fundedFrom"`);
    });

    it("moves the cycle marker instead of copying it", () => {
        // Two markers sharing an id make `getCycleMarkers` render a duplicate,
        // empty cycle in History; nothing dedupes markers by id. The marker rides
        // onto the expense and the movement is deleted in the same transaction.
        expect(STATEMENTS).toContain(`m."closedAt"`);
        expect(STATEMENTS).toMatch(/DELETE FROM "Movement"/);
    });

    it("reuses the movement id rather than minting a new one", () => {
        // ADR-0024's hard requirement: `withoutConvertedTwins` and the
        // `computeFeedTotals` twin filter recognise a converted pair by nothing
        // else. A fresh id would double every transfer.
        expect(STATEMENTS).not.toMatch(/gen_random_uuid|uuid_generate/);
        expect(STATEMENTS).toContain(`ON CONFLICT ("id") DO NOTHING`);
    });
});
