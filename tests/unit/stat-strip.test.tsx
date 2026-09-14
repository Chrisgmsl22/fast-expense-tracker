import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { StatStrip } from "@/components/dashboard/StatStrip";

describe("StatStrip", () => {
    it("renders income, spent, net, and daily-average with days left", () => {
        render(
            <StatStrip
                income={48200}
                spent={42300}
                net={5900}
                dailyAvg={1762}
                daysLeft={7}
                nonIncomeFunded={0}
            />,
        );
        expect(screen.getByText("Income in")).toBeDefined();
        expect(screen.getByText("$48,200.00")).toBeDefined();
        expect(screen.getByText("Spent (my share)")).toBeDefined();
        expect(screen.getByText("Daily avg · 7 left")).toBeDefined();
    });

    it("shows a positive net with a + sign", () => {
        render(
            <StatStrip
                income={48200}
                spent={42300}
                net={5900}
                dailyAvg={1762}
                daysLeft={7}
                nonIncomeFunded={0}
            />,
        );
        expect(screen.getByText("+$5,900.00")).toBeDefined();
    });

    it("shows a negative net with a minus sign", () => {
        render(
            <StatStrip
                income={40000}
                spent={45000}
                net={-5000}
                dailyAvg={2000}
                daysLeft={0}
                nonIncomeFunded={0}
            />,
        );
        expect(screen.getByText("−$5,000.00")).toBeDefined();
    });
    it("adds one line for spend this month's income didn't fund (spec 0007 §3.1)", () => {
        render(
            <StatStrip
                income={48200}
                spent={42300}
                net={5900}
                dailyAvg={1762}
                daysLeft={7}
                nonIncomeFunded={3000}
            />,
        );
        expect(
            screen.getByText(
                /not from this month's income: \$3,000\.00 — savings or reimbursed/i,
            ),
        ).toBeDefined();
    });

    it("stays silent when every peso came from this month's income", () => {
        render(
            <StatStrip
                income={48200}
                spent={42300}
                net={5900}
                dailyAvg={1762}
                daysLeft={7}
                nonIncomeFunded={0}
            />,
        );
        expect(
            screen.queryByText(/not funded by this month's income/i),
        ).toBeNull();
    });
});
