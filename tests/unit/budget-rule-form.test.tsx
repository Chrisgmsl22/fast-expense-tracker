import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock,
} from "vitest";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/_actions/settings/save-budget-rule", () => ({
    saveBudgetRule: vi.fn(),
}));

import { BudgetRuleForm } from "@/components/settings/BudgetRuleForm";
import { saveBudgetRule } from "@/app/_actions/settings/save-budget-rule";

const saveMock = saveBudgetRule as unknown as Mock;

const rule = { essentials: 60, discretionary: 30, savings: 10 };

function renderForm() {
    render(<BudgetRuleForm rule={rule} monthLabel="September 2026" />);
}

function field(label: string): HTMLInputElement {
    return screen.getByLabelText(`${label} (%)`) as HTMLInputElement;
}

function type(label: string, value: string) {
    fireEvent.change(field(label), { target: { value } });
}

const save = () =>
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

beforeEach(() => {
    saveMock.mockReset();
    saveMock.mockResolvedValue({
        ok: true,
        data: { effectiveMonth: "2026-09", rule },
    });
});

// A test without a Guard label is a pin.
describe("BudgetRuleForm", () => {
    it("Should prefill the rule in force for the current month", () => {
        renderForm();
        expect(field("Essentials").value).toBe("60");
        expect(field("Discretionary").value).toBe("30");
        expect(field("Savings/Inv").value).toBe("10");
        expect(screen.getByText(/In force for September 2026/)).toBeDefined();
    });

    it("Should say the change applies from this month and past months keep theirs", () => {
        renderForm();
        expect(
            screen.getByText(
                /applies from September 2026 onward; past months keep the split they had/,
            ),
        ).toBeDefined();
    });

    // Guard: a valid total shows the total only.
    it("Should show the live total and remainder", () => {
        renderForm();
        expect(screen.getByText("Total 100%")).toBeDefined();

        type("Savings/Inv", "5");
        expect(screen.getByText("Total 95% · 5% left to assign")).toBeDefined();

        type("Savings/Inv", "15");
        expect(screen.getByText("Total 105% · 5% over 100%")).toBeDefined();
    });

    it("Should save a valid split through the action", async () => {
        renderForm();
        type("Essentials", "50");
        type("Discretionary", "20");
        type("Savings/Inv", "30");
        save();

        await waitFor(() =>
            expect(saveMock).toHaveBeenCalledWith({
                essentials: "50",
                discretionary: "20",
                savings: "30",
            }),
        );
        expect(
            await screen.findByRole("button", { name: "Saved" }),
        ).toBeDefined();
    });

    // Guard: the server, not the form, refuses a wrong total.
    it("Should send a wrong total to the server and render its refusal", async () => {
        saveMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "The three buckets must add up to 100%",
            fieldErrors: {},
        });
        renderForm();
        type("Essentials", "59");
        save();

        expect(
            await screen.findByText("The three buckets must add up to 100%"),
        ).toBeDefined();
        expect(saveMock).toHaveBeenCalledWith({
            essentials: "59",
            discretionary: "30",
            savings: "10",
        });
        expect(screen.getByText("Total 99% · 1% left to assign")).toBeDefined();
        expect(screen.queryByRole("button", { name: "Saved" })).toBeNull();
    });

    // Guard: an edit clears that field's error and aria-invalid only.
    it("Should clear only the edited field's error and aria-invalid", async () => {
        saveMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Please fix the highlighted fields.",
            fieldErrors: {
                essentials: ["Enter a whole number"],
                savings: ["Must be at least 0%"],
            },
        });
        renderForm();
        save();
        expect(await screen.findByText("Enter a whole number")).toBeDefined();

        type("Essentials", "61");

        expect(screen.queryByText("Enter a whole number")).toBeNull();
        expect(field("Essentials").getAttribute("aria-invalid")).toBe("false");
        expect(screen.getByText("Must be at least 0%")).toBeDefined();
        expect(field("Savings/Inv").getAttribute("aria-invalid")).toBe("true");
    });

    // Guard: the caption follows the month the action wrote.
    it("Should show the month and rule the action saved, not the page's", async () => {
        saveMock.mockResolvedValue({
            ok: true,
            data: {
                effectiveMonth: "2026-10",
                rule: { essentials: 50, discretionary: 20, savings: 30 },
            },
        });
        renderForm();
        type("Essentials", "50");
        type("Discretionary", "20");
        type("Savings/Inv", "30");
        save();

        expect(
            await screen.findByText("In force for October 2026: 50 / 20 / 30"),
        ).toBeDefined();
        expect(
            screen.getByText(/applies from October 2026 onward/),
        ).toBeDefined();
        expect(screen.queryByText(/September 2026/)).toBeNull();
    });

    describe("saved feedback (same as the Expense split rule form)", () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it("Should show a disabled '✓ Saved' button for 1600 ms, then revert", async () => {
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            renderForm();
            await act(async () => {
                save();
            });

            const savedButton = screen.getByRole("button", { name: "Saved" });
            expect((savedButton as HTMLButtonElement).disabled).toBe(true);
            expect(savedButton.className).toContain("bg-positive");

            act(() => {
                vi.advanceTimersByTime(1599);
            });
            expect(screen.getByRole("button", { name: "Saved" })).toBeDefined();

            act(() => {
                vi.advanceTimersByTime(1);
            });
            expect(
                screen.getByRole("button", { name: "Save changes" }),
            ).toBeDefined();
        });

        it("Should drop the saved state as soon as a field changes", async () => {
            renderForm();
            save();
            await screen.findByRole("button", { name: "Saved" });

            type("Savings/Inv", "11");

            expect(
                screen.getByRole("button", { name: "Save changes" }),
            ).toBeDefined();
        });
    });

    it("Should reset the inputs to 50/25/25", () => {
        renderForm();
        fireEvent.click(
            screen.getByRole("button", { name: "Reset to 50/25/25" }),
        );
        expect(field("Essentials").value).toBe("50");
        expect(field("Discretionary").value).toBe("25");
        expect(field("Savings/Inv").value).toBe("25");
        expect(saveMock).not.toHaveBeenCalled();
    });

    it("Should show a server field error on its input", async () => {
        saveMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Please fix the highlighted fields.",
            fieldErrors: { essentials: ["Enter a whole number"] },
        });
        renderForm();
        save();

        expect(await screen.findByText("Enter a whole number")).toBeDefined();
        expect(field("Essentials").getAttribute("aria-invalid")).toBe("true");
        expect(
            screen.getByText("Please fix the highlighted fields."),
        ).toBeDefined();
    });

    it("Should show a message when the action throws", async () => {
        saveMock.mockRejectedValue(new Error("network"));
        renderForm();
        save();

        expect(
            await screen.findByText(
                "Something went wrong saving your budget rule.",
            ),
        ).toBeDefined();
    });
});
