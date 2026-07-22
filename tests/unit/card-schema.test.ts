import { describe, it, expect } from "vitest";

import {
    addCardInputSchema,
    updateCardInputSchema,
    cardTypeSchema,
} from "@/lib/schemas/card";

const VALID_ID = "card-abc-123";

describe("cardTypeSchema", () => {
    it("accepts the three card types", () => {
        for (const type of ["credit", "debit", "cash"]) {
            expect(cardTypeSchema.safeParse(type).success).toBe(true);
        }
    });

    it("rejects an unknown type", () => {
        expect(cardTypeSchema.safeParse("amex").success).toBe(false);
    });
});

describe("addCardInputSchema", () => {
    it("parses a valid card, trimming the name and lowercasing the colour", () => {
        const parsed = addCardInputSchema.safeParse({
            name: "  My Card  ",
            type: "credit",
            color: "#AB12CD",
        });
        expect(parsed.success).toBe(true);
        if (!parsed.success) return;
        expect(parsed.data.name).toBe("My Card");
        expect(parsed.data.color).toBe("#ab12cd");
    });

    it("rejects an empty name", () => {
        const parsed = addCardInputSchema.safeParse({
            name: "   ",
            type: "credit",
            color: "#6b7280",
        });
        expect(parsed.success).toBe(false);
    });

    it("rejects a name longer than 40 characters", () => {
        const parsed = addCardInputSchema.safeParse({
            name: "x".repeat(41),
            type: "credit",
            color: "#6b7280",
        });
        expect(parsed.success).toBe(false);
    });

    it("rejects a non-hex colour", () => {
        const parsed = addCardInputSchema.safeParse({
            name: "Card",
            type: "credit",
            color: "red",
        });
        expect(parsed.success).toBe(false);
    });

    it("rejects an unknown card type", () => {
        const parsed = addCardInputSchema.safeParse({
            name: "Card",
            type: "amex",
            color: "#6b7280",
        });
        expect(parsed.success).toBe(false);
    });
});

describe("updateCardInputSchema", () => {
    it("parses a valid update (id + name + type + colour)", () => {
        const parsed = updateCardInputSchema.safeParse({
            id: VALID_ID,
            name: "Renamed",
            type: "debit",
            color: "#2563eb",
        });
        expect(parsed.success).toBe(true);
    });

    it("rejects changing a card to cash", () => {
        const parsed = updateCardInputSchema.safeParse({
            id: VALID_ID,
            name: "Renamed",
            type: "cash",
            color: "#2563eb",
        });
        expect(parsed.success).toBe(false);
    });

    it("rejects a missing id", () => {
        const parsed = updateCardInputSchema.safeParse({
            id: "",
            name: "Renamed",
            type: "credit",
            color: "#2563eb",
        });
        expect(parsed.success).toBe(false);
    });

    it("rejects an empty name", () => {
        const parsed = updateCardInputSchema.safeParse({
            id: VALID_ID,
            name: "",
            type: "credit",
            color: "#2563eb",
        });
        expect(parsed.success).toBe(false);
    });
});
