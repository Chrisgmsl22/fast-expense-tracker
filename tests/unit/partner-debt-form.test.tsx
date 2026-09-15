import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/_actions/movement/add-partner-debt", () => ({
    addPartnerDebt: vi.fn(),
}));
vi.mock("@/app/_actions/movement/update-partner-debt", () => ({
    updatePartnerDebt: vi.fn(),
}));
vi.mock("@/app/_actions/expense/add-partner-payment", () => ({
    addPartnerPayment: vi.fn(),
}));
vi.mock("@/app/_actions/expense/update-partner-payment", () => ({
    updatePartnerPayment: vi.fn(),
}));

import { PartnerDebtForm } from "@/components/movement/PartnerDebtForm";
import { addPartnerDebt } from "@/app/_actions/movement/add-partner-debt";
import { updatePartnerDebt } from "@/app/_actions/movement/update-partner-debt";

// A debt is a MOVEMENT again (spec 0007 §6b) — settlement only.
const addDebtMock = addPartnerDebt as unknown as Mock;
const updateDebtMock = updatePartnerDebt as unknown as Mock;

beforeEach(() => {
    addDebtMock.mockReset();
    addDebtMock.mockResolvedValue({ ok: true, data: { id: "mv1" } });
    updateDebtMock.mockReset();
    updateDebtMock.mockResolvedValue({
        ok: true,
        data: { id: "mv1" },
    });
});

describe("PartnerDebtForm", () => {
    it("submits the debt (amount + date, no category)", async () => {
        const onSuccess = vi.fn();
        render(<PartnerDebtForm partnerName="Brenda" onSuccess={onSuccess} />);

        fireEvent.change(screen.getByLabelText("Date"), {
            target: { value: "2026-07-10" },
        });
        fireEvent.change(screen.getByLabelText(/What you owe/), {
            target: { value: "500" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Log debt" }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(addDebtMock).toHaveBeenCalledWith({
            amount: "500",
            date: "2026-07-10",
            note: undefined,
        });
        // The form takes no category: a debt files itself under the
        // `combined-expenses` default, editable from the expense row after.
        expect(screen.queryByRole("combobox", { name: "Category" })).toBeNull();
    });

    it("surfaces a validation error without calling onSuccess", async () => {
        addDebtMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Invalid debt",
            fieldErrors: { amount: ["Amount must be greater than 0"] },
        });
        const onSuccess = vi.fn();
        render(<PartnerDebtForm partnerName="Brenda" onSuccess={onSuccess} />);

        fireEvent.change(screen.getByLabelText("Date"), {
            target: { value: "2026-07-10" },
        });
        fireEvent.change(screen.getByLabelText(/What you owe/), {
            target: { value: "0" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Log debt" }));

        await waitFor(() =>
            expect(
                screen.getByText("Amount must be greater than 0"),
            ).toBeDefined(),
        );
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it("edit mode prefills the debt and saves via updatePartnerDebt", async () => {
        const onSuccess = vi.fn();
        render(
            <PartnerDebtForm
                debt={{
                    id: "mv9",
                    date: "2026-07-10",
                    amount: "680",
                    note: "gas she covered",
                }}
                partnerName="Brenda"
                onSuccess={onSuccess}
            />,
        );

        // Prefilled from the debt prop.
        expect(
            (screen.getByLabelText(/What you owe/) as HTMLInputElement).value,
        ).toBe("680");
        // Edit its amount, then save.
        fireEvent.change(screen.getByLabelText(/What you owe/), {
            target: { value: "700" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(updateDebtMock).toHaveBeenCalledWith({
            id: "mv9",
            amount: "700",
            date: "2026-07-10",
            note: "gas she covered",
        });
        expect(addDebtMock).not.toHaveBeenCalled();
    });
});
