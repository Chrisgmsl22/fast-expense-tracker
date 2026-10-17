// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

import {
    captureDateSchema,
    FUTURE_DATE_MESSAGE,
} from "@/lib/schemas/capture-date";
import {
    expenseInputSchema,
    partnerPaymentInputSchema,
} from "@/lib/schemas/expense";
import { variableIncomeInputSchema } from "@/lib/schemas/income";
import {
    cardPaymentInputSchema,
    partnerDebtInputSchema,
    transferInputSchema,
} from "@/lib/schemas/movement";

// Midday 14 October 2026 in CDMX.
const NOW = new Date("2026-10-14T18:00:00Z");

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
});

afterEach(() => {
    vi.useRealTimers();
});

// Every schema that takes a user-entered date. Create and edit parse the same one.
const schemas: [string, z.ZodType, Record<string, unknown>][] = [
    [
        "expenseInputSchema",
        expenseInputSchema,
        { amount: "120", categoryId: "cat-1", description: "Groceries" },
    ],
    ["partnerPaymentInputSchema", partnerPaymentInputSchema, { amount: "80" }],
    [
        "cardPaymentInputSchema",
        cardPaymentInputSchema,
        { amount: "500", cardId: "card-1" },
    ],
    ["transferInputSchema", transferInputSchema, { amount: "300" }],
    ["partnerDebtInputSchema", partnerDebtInputSchema, { amount: "45" }],
    [
        "variableIncomeInputSchema",
        variableIncomeInputSchema,
        { source: "Sold a lamp", amount: "900" },
    ],
];

describe.each(schemas)("%s date cap", (_name, schema, rest) => {
    it("accepts today and the past", () => {
        expect(schema.safeParse({ ...rest, date: "2026-10-14" }).success).toBe(
            true,
        );
        expect(schema.safeParse({ ...rest, date: "2025-01-03" }).success).toBe(
            true,
        );
    });

    it("refuses tomorrow on the date field, with a plain message", () => {
        const res = schema.safeParse({ ...rest, date: "2026-10-15" });
        expect(res.success).toBe(false);
        if (res.success) return;
        const issue = res.error.issues.find((i) => i.path[0] === "date");
        expect(issue?.message).toBe(FUTURE_DATE_MESSAGE);
    });

    it("refuses a mistyped year", () => {
        expect(schema.safeParse({ ...rest, date: "2027-10-14" }).success).toBe(
            false,
        );
    });
});

describe("captureDateSchema at the CDMX day boundary", () => {
    it("refuses 1 October at 03:00Z, still 30 September in CDMX", () => {
        vi.setSystemTime(new Date("2026-10-01T03:00:00Z"));
        expect(captureDateSchema.safeParse("2026-10-01").success).toBe(false);
        expect(captureDateSchema.safeParse("2026-09-30").success).toBe(true);
    });

    it("accepts 1 October at 06:00Z, CDMX midnight", () => {
        vi.setSystemTime(new Date("2026-10-01T06:00:00Z"));
        expect(captureDateSchema.safeParse("2026-10-01").success).toBe(true);
        expect(captureDateSchema.safeParse("2026-10-02").success).toBe(false);
    });

    it("still rejects a value that is not a date", () => {
        expect(captureDateSchema.safeParse("not a date").success).toBe(false);
    });
});
