import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/tests/support/intl";

import { SpendByCard } from "@/components/dashboard/SpendByCard";

const cards = [
    { id: "c1", name: "Platinum", color: "#6b7280", spent: 14400 },
    { id: "cash", name: "Cash", color: "#16a34a", spent: 4200 },
];

describe("SpendByCard", () => {
    it("renders a legend of per-card totals", () => {
        renderWithIntl(<SpendByCard cards={cards} />);
        expect(screen.getByText("Platinum")).toBeDefined();
        expect(screen.getByText("$14,400.00")).toBeDefined();
        expect(screen.getByText("Cash")).toBeDefined();
        expect(screen.getByText("$4,200.00")).toBeDefined();
    });

    it("renders a bar segment per card sized to its share", () => {
        renderWithIntl(<SpendByCard cards={cards} />);
        const segments = Array.from(
            screen.getByTestId("card-bar").children,
        ) as HTMLElement[];
        expect(segments).toHaveLength(2);
        // 14400 / 18600 ≈ 77.4%
        expect(segments[0]!.style.width).toMatch(/^77\.4/);
    });

    it("shows an empty state with no card spend", () => {
        renderWithIntl(<SpendByCard cards={[]} />);
        expect(screen.getByText(/no card spend this month/i)).toBeDefined();
    });
});

describe("SpendByCard in Spanish", () => {
    it("titles the card and its empty state in Spanish", () => {
        renderWithIntl(<SpendByCard cards={[]} />, { locale: "es" });
        expect(screen.getByText("Gasto por tarjeta")).toBeDefined();
        expect(
            screen.getByText("No hay gastos con tarjeta este mes."),
        ).toBeDefined();
    });
});
