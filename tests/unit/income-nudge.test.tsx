import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { IncomeNudge } from "@/components/dashboard/IncomeNudge";

describe("IncomeNudge", () => {
    it("Should link a month with no income to that month's Income page", () => {
        render(<IncomeNudge incomeTotal={0} month="2026-10" />);

        const link = screen.getByRole("link", {
            name: /set your monthly income/i,
        });
        expect(link.getAttribute("href")).toBe("/income?month=2026-10");
    });

    it.each([40000, 0.01])(
        "Should render nothing when the month has %s of income",
        (incomeTotal) => {
            const { container } = render(
                <IncomeNudge incomeTotal={incomeTotal} month="2026-10" />,
            );

            expect(container.innerHTML).toBe("");
        },
    );
});
