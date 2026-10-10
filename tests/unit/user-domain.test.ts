// @vitest-environment node
import { describe, it, expect } from "vitest";

import { normalizeEmail } from "@/lib/domain/user";

describe("normalizeEmail", () => {
    it("lowercases every letter", () => {
        expect(normalizeEmail("Owner@Example.COM")).toBe("owner@example.com");
    });

    it("trims surrounding whitespace", () => {
        expect(normalizeEmail("  owner@example.com\t\n")).toBe(
            "owner@example.com",
        );
    });

    it("leaves an already normalised email unchanged", () => {
        expect(normalizeEmail("owner@example.com")).toBe("owner@example.com");
    });

    it("is idempotent", () => {
        const once = normalizeEmail(" Owner@Example.com ");
        expect(normalizeEmail(once)).toBe(once);
    });
});
