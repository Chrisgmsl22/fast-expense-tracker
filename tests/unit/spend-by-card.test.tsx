import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { SpendByCard } from "@/components/dashboard/SpendByCard";

const cards = [
    { id: "c1", name: "Platinum", color: "#6b7280", spent: 14400 },
    { id: "cash", name: "Cash", color: "#16a34a", spent: 4200 },
];

describe("SpendByCard", () => {
    it("renders a legend of per-card totals", () => {
        render(<SpendByCard cards={cards} />);
        expect(screen.getByText("Platinum")).toBeDefined();
        expect(screen.getByText("$14,400.00")).toBeDefined();
        expect(screen.getByText("Cash")).toBeDefined();
        expect(screen.getByText("$4,200.00")).toBeDefined();
    });

    it("renders a bar segment per card sized to its share", () => {
        render(<SpendByCard cards={cards} />);
        const segments = Array.from(
            screen.getByTestId("card-bar").children,
        ) as HTMLElement[];
        expect(segments).toHaveLength(2);
        // 14400 / 18600 ≈ 77.4%
        expect(segments[0]!.style.width).toMatch(/^77\.4/);
    });

    it("shows an empty state with no card spend", () => {
        render(<SpendByCard cards={[]} />);
        expect(screen.getByText(/no card spend this month/i)).toBeDefined();
    });
});
