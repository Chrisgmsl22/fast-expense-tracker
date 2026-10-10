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

const clearMonthCookie = () => {
    document.cookie = "fet_scoped_month=; path=/; max-age=0";
};

beforeEach(() => {
    pushMock.mockReset();
    pathname.current = "/expenses";
    clearMonthCookie();
});

const nextButton = () =>
    screen.getByRole("button", { name: /next month/i }) as HTMLButtonElement;

describe("MonthPicker", () => {
    it("navigates to the previous and next month", () => {
        render(<MonthPicker month="2026-05" currentMonth="2026-09" />);

        fireEvent.click(
            screen.getByRole("button", { name: /previous month/i }),
        );
        expect(pushMock).toHaveBeenCalledWith("/expenses?month=2026-04");

        fireEvent.click(nextButton());
        expect(pushMock).toHaveBeenCalledWith("/expenses?month=2026-06");
    });

    it("navigates to a month chosen in the picker", () => {
        render(<MonthPicker month="2026-05" currentMonth="2026-09" />);
        fireEvent.change(screen.getByLabelText(/filter by month/i), {
            target: { value: "2026-09" },
        });
        expect(pushMock).toHaveBeenCalledWith("/expenses?month=2026-09");
    });

    it("stays on the current route when used outside /expenses", () => {
        pathname.current = "/income";
        render(<MonthPicker month="2026-05" currentMonth="2026-09" />);
        fireEvent.click(nextButton());
        expect(pushMock).toHaveBeenCalledWith("/income?month=2026-06");
    });

    it("remembers the month in a cookie when asked, alongside the URL", () => {
        // Both are written by the same click, so the store and the URL cannot
        // drift apart.
        render(<MonthPicker month="2026-09" remember currentMonth="2026-09" />);
        fireEvent.click(
            screen.getByRole("button", { name: /previous month/i }),
        );
        expect(pushMock).toHaveBeenCalledWith("/expenses?month=2026-08");
        expect(document.cookie).toContain("fet_scoped_month=2026-08");
    });

    it("writes no cookie unless the screen opted in", () => {
        render(<MonthPicker month="2026-09" currentMonth="2026-09" />);
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

describe("MonthPicker stops at the current month", () => {
    it("disables Next on the current month", () => {
        render(<MonthPicker month="2026-09" remember currentMonth="2026-09" />);

        expect(nextButton().disabled).toBe(true);
        fireEvent.click(nextButton());
        expect(pushMock).not.toHaveBeenCalled();
        expect(document.cookie).not.toContain("fet_scoped_month=2026-10");
    });

    it("keeps Next enabled on every past month, up to the current one", () => {
        render(<MonthPicker month="2026-08" currentMonth="2026-09" />);

        expect(nextButton().disabled).toBe(false);
        fireEvent.click(nextButton());
        expect(pushMock).toHaveBeenCalledWith("/expenses?month=2026-09");
    });

    it("caps the native month input at the current month", () => {
        render(<MonthPicker month="2026-05" currentMonth="2026-09" />);

        expect(
            screen.getByLabelText(/filter by month/i).getAttribute("max"),
        ).toBe("2026-09");
    });

    it("refuses a future month typed past the cap, writing neither URL nor cookie", () => {
        // Some browsers render `type="month"` as a plain text box and ignore `max`.
        render(<MonthPicker month="2026-09" remember currentMonth="2026-09" />);
        fireEvent.change(screen.getByLabelText(/filter by month/i), {
            target: { value: "2026-11" },
        });

        expect(pushMock).not.toHaveBeenCalled();
        expect(document.cookie).not.toContain("fet_scoped_month=2026-11");
    });
});
