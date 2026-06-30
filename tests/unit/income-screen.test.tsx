import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock("@/app/_actions/income/add-variable", () => ({
    addVariableIncome: vi.fn(),
}));
vi.mock("@/app/_actions/income/delete-variable", () => ({
    deleteVariableIncome: vi.fn(),
}));
vi.mock("@/app/_actions/income/set-fixed", () => ({
    setFixedIncome: vi.fn(),
}));

import { IncomeScreen } from "@/components/income/IncomeScreen";
import { addVariableIncome } from "@/app/_actions/income/add-variable";
import { deleteVariableIncome } from "@/app/_actions/income/delete-variable";
import { setFixedIncome } from "@/app/_actions/income/set-fixed";

beforeEach(() => {
    refreshMock.mockReset();
    (addVariableIncome as unknown as Mock).mockReset();
    (deleteVariableIncome as unknown as Mock).mockReset();
    (setFixedIncome as unknown as Mock).mockReset();
});

const variable = [
    {
        id: "inc1",
        date: new Date("2026-06-18T06:00:00Z"),
        source: "Sold sneakers",
        amount: 1200,
    },
    {
        id: "inc2",
        date: new Date("2026-06-10T06:00:00Z"),
        source: "Freelance — logo",
        amount: 3000,
    },
];

function renderScreen(over: Record<string, unknown> = {}) {
    return render(
        <IncomeScreen
            fixed={44000}
            variableTotal={4200}
            total={48200}
            month="2026-06"
            monthLabel="June"
            variable={variable}
            {...over}
        />,
    );
}

describe("IncomeScreen", () => {
    it("renders the three totals and the variable log", () => {
        renderScreen();
        // Total appears on both desktop + mobile cards.
        expect(screen.getAllByText("$48,200.00").length).toBeGreaterThan(0);
        expect(screen.getByText("Sold sneakers")).toBeDefined();
        expect(screen.getByText("+$1,200.00")).toBeDefined();
    });

    it("masks every money value when Hide is toggled, and reveals on toggle back", () => {
        renderScreen();
        // Before hiding, the fixed amount is visible.
        expect(screen.getAllByText("$44,000.00").length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole("button", { name: /hide/i }));

        expect(screen.queryByText("$44,000.00")).toBeNull();
        expect(screen.queryByText("+$1,200.00")).toBeNull();
        expect(screen.getAllByText("$ ••••••").length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole("button", { name: /show/i }));
        expect(screen.getAllByText("$44,000.00").length).toBeGreaterThan(0);
    });

    it("shows an empty state when there is no variable income", () => {
        renderScreen({ variable: [], variableTotal: 0, total: 44000 });
        expect(
            screen.getByText(/no variable income logged for june/i),
        ).toBeDefined();
    });

    it("deletes a variable row through the confirm dialog and refreshes", async () => {
        (deleteVariableIncome as unknown as Mock).mockResolvedValue({
            ok: true,
            data: { id: "inc1" },
        });
        renderScreen();

        fireEvent.click(
            screen.getByRole("button", { name: /delete sold sneakers/i }),
        );
        // Confirm dialog
        fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

        await waitFor(() =>
            expect(deleteVariableIncome).toHaveBeenCalledWith({ id: "inc1" }),
        );
        await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    });

    it("surfaces a delete failure message without refreshing", async () => {
        (deleteVariableIncome as unknown as Mock).mockResolvedValue({
            ok: false,
            code: "db_error",
            message: "Could not delete the income. Please try again.",
        });
        renderScreen();

        fireEvent.click(
            screen.getByRole("button", { name: /delete sold sneakers/i }),
        );
        fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

        await waitFor(() =>
            expect(
                screen.getByText(/could not delete the income/i),
            ).toBeDefined(),
        );
        expect(refreshMock).not.toHaveBeenCalled();
    });

    it("edits the fixed amount inline and refreshes on success", async () => {
        (setFixedIncome as unknown as Mock).mockResolvedValue({
            ok: true,
            data: { amount: 50000 },
        });
        renderScreen();

        fireEvent.click(
            screen.getByRole("button", { name: /edit fixed income/i }),
        );
        const input = screen.getByLabelText(/fixed monthly income/i);
        fireEvent.change(input, { target: { value: "50000" } });
        fireEvent.click(
            screen.getByRole("button", { name: /save fixed income/i }),
        );

        await waitFor(() =>
            expect(setFixedIncome).toHaveBeenCalledWith({ amount: "50000" }),
        );
        await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    });

    it("defaults the add-form date to the first of the viewed month", () => {
        renderScreen({ month: "2026-03" });
        fireEvent.click(screen.getByRole("button", { name: /add income/i }));
        const dateInput = screen.getByLabelText(/^date$/i) as HTMLInputElement;
        expect(dateInput.value).toBe("2026-03-01");
    });

    it("adds variable income through the dialog and refreshes", async () => {
        (addVariableIncome as unknown as Mock).mockResolvedValue({
            ok: true,
            data: { id: "inc3" },
        });
        renderScreen();

        fireEvent.click(screen.getByRole("button", { name: /add income/i }));
        fireEvent.change(screen.getByLabelText(/source/i), {
            target: { value: "Bonus" },
        });
        fireEvent.change(screen.getByLabelText(/amount/i), {
            target: { value: "500" },
        });
        fireEvent.change(screen.getByLabelText(/^date$/i), {
            target: { value: "2026-06-20" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^add income$/i }));

        await waitFor(() =>
            expect(addVariableIncome).toHaveBeenCalledWith({
                source: "Bonus",
                amount: "500",
                date: "2026-06-20",
            }),
        );
        await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    });
});
