import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { BucketsHero } from "@/components/dashboard/BucketsHero";
import type { Bucket } from "@/lib/domain/dashboard";

const buckets: Bucket[] = [
    { key: "essentials", spent: 18400, target: 24000 },
    { key: "discretionary", spent: 11900, target: 12000 },
    { key: "savings", spent: 12000, target: 12000 },
];

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
                    { key: "essentials", spent: 26000, target: 24000 },
                    { key: "discretionary", spent: 0, target: 12000 },
                    { key: "savings", spent: 0, target: 12000 },
                ]}
            />,
        );
        expect(screen.getByText(/\$2,000\.00 over/)).toBeDefined();
    });

    it("shows 'to go' for savings below target", () => {
        render(
            <BucketsHero
                buckets={[
                    { key: "essentials", spent: 0, target: 24000 },
                    { key: "discretionary", spent: 0, target: 12000 },
                    { key: "savings", spent: 5000, target: 12000 },
                ]}
            />,
        );
        expect(screen.getByText(/\$7,000\.00 to go/)).toBeDefined();
    });
});
