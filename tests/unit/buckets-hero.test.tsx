import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { BucketsHero } from "@/components/dashboard/BucketsHero";
import type { Bucket } from "@/lib/domain/dashboard";

const buckets: Bucket[] = [
    { key: "essentials", spent: 18400, target: 24000, percent: 50 },
    { key: "discretionary", spent: 11900, target: 12000, percent: 25 },
    { key: "savings", spent: 12000, target: 12000, percent: 25 },
];

function barValue(label: string): string | null {
    return screen
        .getByRole("progressbar", { name: `${label} spend` })
        .getAttribute("aria-valuenow");
}

describe("BucketsHero", () => {
    it("renders the three buckets with spend and target", () => {
        render(<BucketsHero buckets={buckets} />);
        expect(screen.getByText("Essentials")).toBeDefined();
        expect(screen.getByText("Discretionary")).toBeDefined();
        expect(screen.getByText("Savings/Inv")).toBeDefined();
        expect(screen.getByText("$18,400.00")).toBeDefined();
    });

    it("shows money left for an under-budget essentials bucket", () => {
        render(<BucketsHero buckets={buckets} />);
        expect(screen.getByText(/\$5,600\.00 left/)).toBeDefined();
    });

    it("shows 'goal met' when savings reaches its target", () => {
        render(<BucketsHero buckets={buckets} />);
        expect(screen.getByText("goal met")).toBeDefined();
    });

    it("shows an 'over' amount (danger) when essentials exceeds target", () => {
        render(
            <BucketsHero
                buckets={[
                    {
                        key: "essentials",
                        spent: 26000,
                        target: 24000,
                        percent: 50,
                    },
                    {
                        key: "discretionary",
                        spent: 0,
                        target: 12000,
                        percent: 25,
                    },
                    { key: "savings", spent: 0, target: 12000, percent: 25 },
                ]}
            />,
        );
        expect(screen.getByText(/\$2,000\.00 over/)).toBeDefined();
    });

    it("shows 'to go' for savings below target", () => {
        render(
            <BucketsHero
                buckets={[
                    { key: "essentials", spent: 0, target: 24000, percent: 50 },
                    {
                        key: "discretionary",
                        spent: 0,
                        target: 12000,
                        percent: 25,
                    },
                    { key: "savings", spent: 5000, target: 12000, percent: 25 },
                ]}
            />,
        );
        expect(screen.getByText(/\$7,000\.00 to go/)).toBeDefined();
    });

    // Guard: fails pre-fix, where the labels were the literals 50% / 25% / 25%.
    it("Should label each bucket with the percent from its data", () => {
        render(
            <BucketsHero
                buckets={[
                    { key: "essentials", spent: 0, target: 28800, percent: 60 },
                    {
                        key: "discretionary",
                        spent: 0,
                        target: 14400,
                        percent: 30,
                    },
                    { key: "savings", spent: 0, target: 4800, percent: 10 },
                ]}
            />,
        );
        expect(screen.getByText("60%")).toBeDefined();
        expect(screen.getByText("30%")).toBeDefined();
        expect(screen.getByText("10%")).toBeDefined();
        expect(screen.queryByText("50%")).toBeNull();
        expect(screen.queryByText("25%")).toBeNull();
    });

    // Guard: fails pre-fix, where a 0-target bucket with spend drew an empty bar.
    it("Should fill a 0% bucket's bar and flag its spend as over", () => {
        render(
            <BucketsHero
                buckets={[
                    {
                        key: "essentials",
                        spent: 1000,
                        target: 33600,
                        percent: 70,
                    },
                    {
                        key: "discretionary",
                        spent: 1400,
                        target: 0,
                        percent: 0,
                    },
                    { key: "savings", spent: 0, target: 14400, percent: 30 },
                ]}
            />,
        );
        expect(screen.getByText("0%")).toBeDefined();
        expect(screen.getByText(/\$1,400\.00 over/)).toBeDefined();
        expect(barValue("Discretionary")).toBe("100");
        expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
    });

    // Guard: fails pre-fix, where savings spend over a 0 target read "-$500 to go".
    it("Should read 'goal met' for spend into a 0% savings bucket", () => {
        render(
            <BucketsHero
                buckets={[
                    {
                        key: "essentials",
                        spent: 0,
                        target: 48000,
                        percent: 100,
                    },
                    { key: "discretionary", spent: 0, target: 0, percent: 0 },
                    { key: "savings", spent: 500, target: 0, percent: 0 },
                ]}
            />,
        );
        expect(screen.getByText("goal met")).toBeDefined();
        expect(screen.queryByText(/to go/)).toBeNull();
    });

    // Pin: an empty 0% bucket already drew an empty bar before the change.
    it("Should draw an empty bar for a 0% bucket with no spend", () => {
        render(
            <BucketsHero
                buckets={[
                    {
                        key: "essentials",
                        spent: 0,
                        target: 48000,
                        percent: 100,
                    },
                    { key: "discretionary", spent: 0, target: 0, percent: 0 },
                    { key: "savings", spent: 0, target: 0, percent: 0 },
                ]}
            />,
        );
        expect(barValue("Discretionary")).toBe("0");
        expect(barValue("Savings/Inv")).toBe("0");
        expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
    });
});
