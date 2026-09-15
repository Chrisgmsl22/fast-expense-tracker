import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/_actions/expense/add-partner-payment", () => ({
    addPartnerPayment: vi.fn(),
}));
vi.mock("@/app/_actions/expense/update-partner-payment", () => ({
    updatePartnerPayment: vi.fn(),
}));
vi.mock("@/app/_actions/movement/add-transfer", () => ({
    addTransfer: vi.fn(),
}));
vi.mock("@/app/_actions/movement/update-transfer", () => ({
    updateTransfer: vi.fn(),
}));

import { TransferForm } from "@/components/movement/TransferForm";
import { addTransfer } from "@/app/_actions/movement/add-transfer";
import { updateTransfer } from "@/app/_actions/movement/update-transfer";
import { addPartnerPayment } from "@/app/_actions/expense/add-partner-payment";
import { updatePartnerPayment } from "@/app/_actions/expense/update-partner-payment";

const addTransferMock = addTransfer as unknown as Mock;
const updateTransferMock = updateTransfer as unknown as Mock;
// Money you SEND her is an expense now (spec 0007 §6b); money she sends you
// stays a movement. The two halves write to different tables.
const addPaymentMock = addPartnerPayment as unknown as Mock;
const updatePaymentMock = updatePartnerPayment as unknown as Mock;

beforeEach(() => {
    addTransferMock.mockReset();
    addTransferMock.mockResolvedValue({ ok: true, data: { id: "m1" } });
    updateTransferMock.mockReset();
    updateTransferMock.mockResolvedValue({ ok: true, data: { id: "m1" } });
    addPaymentMock.mockReset();
    addPaymentMock.mockResolvedValue({ ok: true, data: { id: "e1" } });
    updatePaymentMock.mockReset();
    updatePaymentMock.mockResolvedValue({ ok: true, data: { id: "e1" } });
});

describe("TransferForm", () => {
    it("saves money you SENT her as an expense, not a movement", async () => {
        // Spec 0007 §6b: paying her is the moment the money is really spent, so
        // the outbound half writes an Expense{isPartnerPayment} and reaches the
        // budget. Nothing should touch the movement action.
        const onSuccess = vi.fn();
        render(<TransferForm partnerName="Brenda" onSuccess={onSuccess} />);
        expect(
            screen.getByRole("button", { name: /Log payment to Brenda/ }),
        ).toBeDefined();

        fireEvent.change(screen.getByLabelText("Date"), {
            target: { value: "2026-07-10" },
        });
        fireEvent.change(screen.getByLabelText(/Amount/), {
            target: { value: "300" },
        });
        fireEvent.click(
            screen.getByRole("button", { name: /Log payment to Brenda/ }),
        );

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(addPaymentMock).toHaveBeenCalledWith(
            expect.objectContaining({ amount: "300", date: "2026-07-10" }),
        );
        expect(addTransferMock).not.toHaveBeenCalled();
    });

    it("submits a gf_received transfer when direction is gf_received", async () => {
        const onSuccess = vi.fn();
        render(
            <TransferForm
                direction="gf_received"
                partnerName="Brenda"
                onSuccess={onSuccess}
            />,
        );
        // Inbound label + copy differ.
        expect(
            screen.getByRole("button", { name: /Log Brenda's payment/ }),
        ).toBeDefined();

        fireEvent.change(screen.getByLabelText("Date"), {
            target: { value: "2026-07-10" },
        });
        fireEvent.change(screen.getByLabelText(/Amount/), {
            target: { value: "700" },
        });
        fireEvent.click(
            screen.getByRole("button", { name: /Log Brenda's payment/ }),
        );

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(addTransferMock).toHaveBeenCalledWith(
            expect.objectContaining({
                direction: "gf_received",
                amount: "700",
            }),
        );
    });

    it("prefills the amount for quick-settle", () => {
        render(
            <TransferForm
                direction="gf_received"
                initialAmount="512.5"
                partnerName="Brenda"
            />,
        );
        const amount = screen.getByLabelText(/Amount/) as HTMLInputElement;
        expect(amount.value).toBe("512.5");
    });

    it("edits an outbound payment via updatePartnerPayment, prefilled", async () => {
        const onSuccess = vi.fn();
        render(
            <TransferForm
                direction="gf_paid"
                transfer={{
                    id: "m9",
                    date: "2026-07-01",
                    amount: "350",
                    note: "dinner",
                }}
                partnerName="Brenda"
                onSuccess={onSuccess}
            />,
        );
        // Prefilled from the transfer, and the submit label flips to Save changes.
        expect(
            (screen.getByLabelText(/Amount/) as HTMLInputElement).value,
        ).toBe("350");
        expect((screen.getByLabelText(/Note/) as HTMLInputElement).value).toBe(
            "dinner",
        );

        fireEvent.change(screen.getByLabelText(/Amount/), {
            target: { value: "400" },
        });
        fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(updatePaymentMock).toHaveBeenCalledWith(
            expect.objectContaining({ id: "m9", amount: "400" }),
        );
        expect(updateTransferMock).not.toHaveBeenCalled();
        expect(addPaymentMock).not.toHaveBeenCalled();
    });

    it("shows the field error and does not call onSuccess on a validation failure", async () => {
        addPaymentMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Invalid payment",
            fieldErrors: { amount: ["Amount must be greater than 0"] },
        });
        const onSuccess = vi.fn();
        render(<TransferForm partnerName="Brenda" onSuccess={onSuccess} />);

        fireEvent.change(screen.getByLabelText("Date"), {
            target: { value: "2026-07-10" },
        });
        fireEvent.change(screen.getByLabelText(/Amount/), {
            target: { value: "0" },
        });
        fireEvent.click(
            screen.getByRole("button", { name: /Log payment to Brenda/ }),
        );

        await waitFor(() =>
            expect(
                screen.getByText("Amount must be greater than 0"),
            ).toBeDefined(),
        );
        expect(onSuccess).not.toHaveBeenCalled();
    });
});
