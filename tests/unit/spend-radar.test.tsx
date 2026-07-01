import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Recharts measures the DOM (ResponsiveContainer → 0×0 in jsdom) and wouldn't
// render its SVG; stub it so the test focuses on the ranked list + states.
vi.mock("recharts", () => {
    const Stub = ({ children }: { children?: React.ReactNode }) => (
        <div data-testid="radar">{children}</div>
    );
    return {
        ResponsiveContainer: Stub,
        RadarChart: Stub,
        PolarGrid: Stub,
        PolarAngleAxis: Stub,
        Radar: Stub,
    };
});

import { SpendRadar } from "@/components/dashboard/SpendRadar";

const categories = [
    { name: "Rent", color: "#4f46e5", spent: 14000 },
    { name: "Eating out", color: "#ea580c", spent: 4900 },
    { name: "Groceries", color: "#65a30d", spent: 3200 },
];

describe("SpendRadar", () => {
    it("renders the ranked category list with amounts", () => {
        render(<SpendRadar categories={categories} />);
        expect(screen.getByText("Rent")).toBeDefined();
        expect(screen.getByText("$14,000.00")).toBeDefined();
        expect(screen.getByText("Eating out")).toBeDefined();
    });

    it("renders the radar once there are at least 3 categories", () => {
        render(<SpendRadar categories={categories} />);
        expect(screen.getAllByTestId("radar").length).toBeGreaterThan(0);
    });

    it("omits the radar with fewer than 3 categories (list only)", () => {
        render(<SpendRadar categories={categories.slice(0, 2)} />);
        expect(screen.queryByTestId("radar")).toBeNull();
        expect(screen.getByText("Rent")).toBeDefined();
    });

    it("shows an empty state with no spend", () => {
        render(<SpendRadar categories={[]} />);
        expect(screen.getByText(/no spending to chart/i)).toBeDefined();
    });
});
