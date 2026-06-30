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
});
