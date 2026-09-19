import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { pushMock, pathname } = vi.hoisted(() => ({
    pushMock: vi.fn(),
    pathname: { current: "/expenses" },
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: pushMock }),
    // The picker stays on the current route; assert it preserves the pathname.
    usePathname: () => pathname.current,
}));

import { MonthPicker } from "@/components/expense/MonthPicker";

beforeEach(() => {
    pushMock.mockReset();
    pathname.current = "/expenses";
});

describe("MonthPicker", () => {
    it("navigates to the previous and next month", () => {
        render(<MonthPicker month="2026-05" />);

        fireEvent.click(
            screen.getByRole("button", { name: /previous month/i }),
        );
        expect(pushMock).toHaveBeenCalledWith("/expenses?month=2026-04");

        fireEvent.click(screen.getByRole("button", { name: /next month/i }));
        expect(pushMock).toHaveBeenCalledWith("/expenses?month=2026-06");
    });

    it("navigates to a month chosen in the picker", () => {
        render(<MonthPicker month="2026-05" />);
        fireEvent.change(screen.getByLabelText(/filter by month/i), {
            target: { value: "2026-09" },
        });
        expect(pushMock).toHaveBeenCalledWith("/expenses?month=2026-09");
    });

    it("stays on the current route when used outside /expenses", () => {
        pathname.current = "/income";
        render(<MonthPicker month="2026-05" />);
        fireEvent.click(screen.getByRole("button", { name: /next month/i }));
        expect(pushMock).toHaveBeenCalledWith("/income?month=2026-06");
    });

    it("remembers the month in a cookie when asked, alongside the URL", () => {
        // Both are written by the same click, so the store and the URL cannot
        // drift apart.
        render(<MonthPicker month="2026-09" remember />);
        fireEvent.click(
            screen.getByRole("button", { name: /previous month/i }),
        );
        expect(pushMock).toHaveBeenCalledWith("/expenses?month=2026-08");
        expect(document.cookie).toContain("fet_scoped_month=2026-08");
    });

    it("writes no cookie unless the screen opted in", () => {
        document.cookie = "fet_scoped_month=; path=/; max-age=0";
        render(<MonthPicker month="2026-09" />);
        fireEvent.click(
            screen.getByRole("button", { name: /previous month/i }),
        );
        expect(document.cookie).not.toContain("fet_scoped_month=2026-08");
    });

    it("offers the back-to-current button only while looking at another month", () => {
        const { rerender } = render(
            <MonthPicker month="2026-08" currentMonth="2026-09" />,
        );
        const back = screen.getByRole("button", {
            name: "Take me back to the current month",
        });
        fireEvent.click(back);
        expect(pushMock).toHaveBeenCalledWith("/expenses?month=2026-09");

        rerender(<MonthPicker month="2026-09" currentMonth="2026-09" />);
        expect(
            screen.queryByRole("button", {
                name: "Take me back to the current month",
            }),
        ).toBeNull();
    });

    it("offers no back-to-current button when the page supplies no clock", () => {
        render(<MonthPicker month="2026-08" />);
        expect(
            screen.queryByRole("button", { name: /take me back/i }),
        ).toBeNull();
    });

    it("gives the back-to-current button a filled background, not text styling", () => {
        // The owner reported it read as a label; ghost has no background.
        render(<MonthPicker month="2026-08" currentMonth="2026-09" />);
        const back = screen.getByRole("button", { name: /take me back/i });
        expect(back.className).toContain("bg-secondary");
    });

    it("remembers the month when the back-to-current button is used", () => {
        render(<MonthPicker month="2026-08" remember currentMonth="2026-09" />);
        fireEvent.click(screen.getByRole("button", { name: /take me back/i }));
        expect(document.cookie).toContain("fet_scoped_month=2026-09");
    });
});
