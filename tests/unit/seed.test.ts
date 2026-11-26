// @vitest-environment node
import { describe, it, expect } from "vitest";
import { OWNER_CARDS } from "@/prisma/seed";

describe("OWNER_CARDS", () => {
    it("Should be the owner's four branded cards and not Cash", () => {
        expect(OWNER_CARDS).toEqual([
            { name: "Amex Platinum", color: "#6b7280", type: "credit" },
            { name: "Amex Gold", color: "#ca8a04", type: "credit" },
            { name: "NU", color: "#9333ea", type: "credit" },
            { name: "BBVA", color: "#2563eb", type: "debit" },
        ]);
    });
});
