import { describe, expect, it } from "vitest";
import {
    buildSidebarModel,
    getSidebarDate,
    isSidebarLinkActive,
} from "@/components/nav/sidebar-model";
import {
    sidebarSummary,
    sidebarBalance,
    sidebarNow,
} from "@/tests/support/sidebar-fixture";

describe("sidebar model", () => {
    it("maps the existing current-month figures and excludes the savings goal from alerts", () => {
        const model = buildSidebarModel(
            sidebarSummary,
            sidebarBalance,
            true,
            "Taylor",
            sidebarNow,
        );
        expect(model.totals).toEqual({ spent: 1300, saved: 400, net: 2300 });
        expect(model.period).toMatchObject({
            month: "2026-09",
            day: 18,
            daysInMonth: 30,
        });
        expect(model.alerts).toEqual([
            {
                key: "essentials",
                kind: "bucket",
                bucket: "essentials",
                amount: 100,
                href: "/dashboard?month=2026-09",
            },
            {
                key: "food",
                kind: "category",
                name: "Food",
                amount: 150,
                href: "/category/food?month=2026-09",
            },
        ]);
    });
    it("uses effective category limits and excludes zero, absent, and at-limit budgets", () => {
        const category = sidebarSummary.categoryBudgets[0]!;
        const model = buildSidebarModel(
            {
                ...sidebarSummary,
                buckets: [],
                categoryBudgets: [
                    { ...category, slug: "zero", monthlyBudget: 0 },
                    { ...category, slug: "none", monthlyBudget: null },
                    { ...category, slug: "at-limit", monthlyBudget: 450 },
                    { ...category, slug: "override", monthlyBudget: 200 },
                ],
            },
            sidebarBalance,
            true,
            "Taylor",
            sidebarNow,
        );
        expect(model.alerts).toEqual([
            {
                key: "override",
                kind: "category",
                name: "Food",
                amount: 250,
                href: "/category/override?month=2026-09",
            },
        ]);
    });
    it("alerts on positive spend against a zero-income target, but not zero spend", () => {
        const model = buildSidebarModel(
            {
                ...sidebarSummary,
                categoryBudgets: [],
                buckets: [
                    { key: "essentials", spent: 20, target: 0, percent: 50 },
                    { key: "discretionary", spent: 0, target: 0, percent: 25 },
                    { key: "savings", spent: 50, target: 0, percent: 25 },
                ],
            },
            sidebarBalance,
            true,
            "Taylor",
            sidebarNow,
        );
        expect(model.alerts).toHaveLength(1);
        expect(model.alerts[0]).toMatchObject({
            key: "essentials",
            amount: 20,
        });
    });
    it.each([
        ["she_owes", 75, true],
        ["you_owe", -75, true],
        ["settled", 0, true],
        ["she_owes", 75, false],
        ["you_owe", -75, false],
    ] as const)(
        "shows %s with shared mode %s",
        (direction, balance, sharesExpenses) => {
            expect(
                buildSidebarModel(
                    sidebarSummary,
                    {
                        ...sidebarBalance,
                        direction,
                        balance,
                        amount: Math.abs(balance),
                    },
                    sharesExpenses,
                    "Taylor",
                    sidebarNow,
                ).settlement,
            ).toMatchObject({
                direction,
                amount: Math.abs(balance),
                partnerName: "Taylor",
            });
        },
    );
    it("hides all partner information for a settled solo account", () => {
        expect(
            buildSidebarModel(
                sidebarSummary,
                {
                    ...sidebarBalance,
                    balance: 0,
                    amount: 0,
                    direction: "settled",
                },
                false,
                "Taylor",
                sidebarNow,
            ).settlement,
        ).toBeNull();
    });
    it("uses the CDMX date across midnight and the month boundary", () => {
        expect(getSidebarDate(new Date("2026-10-01T05:59:59Z"))).toMatchObject({
            month: "2026-09",
            day: 30,
            daysInMonth: 30,
            dayKey: "2026-09-30",
            nextDayAt: Date.parse("2026-10-01T06:00:00Z"),
        });
        expect(getSidebarDate(new Date("2026-10-01T06:00:00Z"))).toMatchObject({
            month: "2026-10",
            day: 1,
            daysInMonth: 31,
            dayKey: "2026-10-01",
        });
    });
    it("maps category pages to the correct navigation item", () => {
        expect(isSidebarLinkActive("/category/food", "/expenses")).toBe(true);
        expect(isSidebarLinkActive("/category/savings", "/expenses")).toBe(
            false,
        );
        expect(
            isSidebarLinkActive("/category/savings", "/category/savings"),
        ).toBe(true);
        expect(isSidebarLinkActive("/income", "/dashboard")).toBe(false);
    });
});
