// @vitest-environment node
import { describe, it, expect } from "vitest";

import { carryForwardRow } from "@/lib/domain/fixed-income";

const legacy = { effectiveMonth: null, amount: 40000 };
const march = { effectiveMonth: "2026-03", amount: 42000 };
const august = { effectiveMonth: "2026-08", amount: 50000 };

// Guards: the rule is new, so every case fails pre-fix (no module).
describe("carryForwardRow", () => {
    it("Should hold the next month at 0 when no row applies yet", () => {
        expect(carryForwardRow([], "2026-05")).toEqual({
            effectiveMonth: "2026-06",
            amount: 0,
        });
    });

    it("Should hold the next month at the legacy amount", () => {
        expect(carryForwardRow([legacy], "2026-05")).toEqual({
            effectiveMonth: "2026-06",
            amount: 40000,
        });
    });

    it("Should hold the next month at the dated amount in force for it", () => {
        expect(carryForwardRow([legacy, march, august], "2026-05")).toEqual({
            effectiveMonth: "2026-06",
            amount: 42000,
        });
        expect(carryForwardRow([legacy, march, august], "2026-08")).toEqual({
            effectiveMonth: "2026-09",
            amount: 50000,
        });
    });

    it("Should read the next month's amount even when the edited month has its own row", () => {
        const may = { effectiveMonth: "2026-05", amount: 45000 };
        expect(carryForwardRow([legacy, may], "2026-05")).toEqual({
            effectiveMonth: "2026-06",
            amount: 45000,
        });
    });

    it("Should return null when the next month already has its own row", () => {
        const june = { effectiveMonth: "2026-06", amount: 1 };
        expect(carryForwardRow([legacy, june], "2026-05")).toBeNull();
    });

    it("Should roll over a year boundary", () => {
        expect(carryForwardRow([legacy], "2026-12")).toEqual({
            effectiveMonth: "2027-01",
            amount: 40000,
        });
    });
});
