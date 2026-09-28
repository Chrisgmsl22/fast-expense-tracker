// @vitest-environment node
import { describe, it, expect } from "vitest";

import { resolveEffective } from "@/lib/domain/effective-month";

const legacy = { effectiveMonth: null, amount: 40000 };
const july = { effectiveMonth: "2026-07", amount: 44000 };
const october = { effectiveMonth: "2026-10", amount: 50000 };

// Guards: the resolver is new, so every case fails pre-fix (no module).
describe("resolveEffective", () => {
    it("Should return undefined when no entry exists", () => {
        expect(resolveEffective([], "2026-09")).toBeUndefined();
    });

    it("Should apply a null-month entry to every month", () => {
        expect(resolveEffective([legacy], "1999-01")).toBe(legacy);
        expect(resolveEffective([legacy], "2026-09")).toBe(legacy);
        expect(resolveEffective([legacy], "2099-12")).toBe(legacy);
    });

    it("Should apply a dated entry to its own month and every later month", () => {
        expect(resolveEffective([july], "2026-07")).toBe(july);
        expect(resolveEffective([july], "2027-01")).toBe(july);
    });

    it("Should return undefined for a month before the only dated entry", () => {
        expect(resolveEffective([july], "2026-06")).toBeUndefined();
    });

    it("Should keep the older amount for a past month after a newer entry", () => {
        const entries = [july, october];
        expect(resolveEffective(entries, "2026-09")).toBe(july);
        expect(resolveEffective(entries, "2026-10")).toBe(october);
    });

    it("Should sort a null month before every dated month", () => {
        const entries = [july, legacy, october];
        expect(resolveEffective(entries, "2026-06")).toBe(legacy);
        expect(resolveEffective(entries, "2026-07")).toBe(july);
        expect(resolveEffective(entries, "2026-09")).toBe(july);
        expect(resolveEffective(entries, "2026-12")).toBe(october);
    });

    it("Should pick the latest applicable entry whatever the input order", () => {
        expect(resolveEffective([october, legacy, july], "2026-11")).toBe(
            october,
        );
        expect(resolveEffective([october, july, legacy], "2026-08")).toBe(july);
    });

    // Pin: strict comparison already kept the first of two equal months.
    it("Should keep the first entry in input order on a tie", () => {
        const first = { effectiveMonth: "2026-09", amount: 1 };
        const second = { effectiveMonth: "2026-09", amount: 2 };
        expect(resolveEffective([first, second], "2026-09")).toBe(first);
        expect(resolveEffective([second, first], "2026-09")).toBe(second);

        const legacyA = { effectiveMonth: null, amount: 3 };
        const legacyB = { effectiveMonth: null, amount: 4 };
        expect(resolveEffective([legacyA, legacyB], "2026-09")).toBe(legacyA);
    });

    it("Should compare across a year boundary", () => {
        const december = { effectiveMonth: "2026-12", amount: 1 };
        expect(resolveEffective([legacy, december], "2027-01")).toBe(december);
        expect(resolveEffective([legacy, december], "2026-11")).toBe(legacy);
    });
});
