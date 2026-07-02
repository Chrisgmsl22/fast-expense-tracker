import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Isolate the component from the server action (and its auth/db imports) + router.
vi.mock("@/app/_actions/category/set-budget", () => ({
    setCategoryBudget: vi.fn(),
}));
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: refreshMock }),
}));

import { setCategoryBudget } from "@/app/_actions/category/set-budget";
import { CategoryLimitEditor } from "@/components/category/CategoryLimitEditor";

const props = {
    slug: "health",
    month: "2026-06",
    monthLabel: "June 2026",
    categoryName: "Health",
    defaultBudget: 1500,
    thisMonthOverride: 1800,
};

function openEditor() {
    render(<CategoryLimitEditor {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /edit limit/i }));
    return screen.findByText("Monthly limit · Health");
}

describe("CategoryLimitEditor", () => {
    beforeEach(() => {
        (setCategoryBudget as unknown as Mock).mockReset();
        refreshMock.mockReset();
    });

    it("prefills this month's override and the default", async () => {
        await openEditor();
        expect(
            (screen.getByLabelText(/this month/i) as HTMLInputElement).value,
        ).toBe("1800");
        expect(
            (screen.getByLabelText(/default/i) as HTMLInputElement).value,
        ).toBe("1500");
    });

    it("saves the edited values through the action, then refreshes", async () => {
        (setCategoryBudget as unknown as Mock).mockResolvedValue({
            ok: true,
            data: { slug: "health" },
        });
        await openEditor();
        fireEvent.change(screen.getByLabelText(/this month/i), {
            target: { value: "2000" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

        await waitFor(() =>
            expect(setCategoryBudget).toHaveBeenCalledWith({
                slug: "health",
                month: "2026-06",
                thisMonthAmount: "2000",
                defaultAmount: "1500",
            }),
        );
        await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    });

    it("'Reset to default' clears this month's field", async () => {
        await openEditor();
        fireEvent.click(
            screen.getByRole("button", { name: /reset to default/i }),
        );
        expect(
            (screen.getByLabelText(/this month/i) as HTMLInputElement).value,
        ).toBe("");
    });

    it("surfaces per-field validation errors under the field", async () => {
        (setCategoryBudget as unknown as Mock).mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Invalid budget",
            fieldErrors: {
                thisMonthAmount: ["Amount must be greater than 0"],
            },
        });
        await openEditor();
        fireEvent.change(screen.getByLabelText(/this month/i), {
            target: { value: "0" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

        const fieldError = await screen.findByText(
            /amount must be greater than 0/i,
        );
        expect(fieldError).toBeDefined();
        // The this-month input is marked invalid and linked to its error.
        const input = screen.getByLabelText(/this month/i);
        expect(input.getAttribute("aria-invalid")).toBe("true");
        expect(input.getAttribute("aria-describedby")).toBe(
            fieldError.getAttribute("id"),
        );
        // The generic message is not shown when a field pinpoints the cause.
        expect(screen.queryByText("Invalid budget")).toBeNull();
        expect(refreshMock).not.toHaveBeenCalled();
    });

    it("surfaces the action's general message on a non-field failure", async () => {
        (setCategoryBudget as unknown as Mock).mockResolvedValue({
            ok: false,
            code: "db_error",
            message: "Could not save the limit. Please try again.",
        });
        await openEditor();
        fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
        expect(
            await screen.findByText(/could not save the limit/i),
        ).toBeDefined();
        expect(refreshMock).not.toHaveBeenCalled();
    });
});
