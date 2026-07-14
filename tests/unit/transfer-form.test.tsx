import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/_actions/movement/add-transfer", () => ({
    addTransfer: vi.fn(),
}));
vi.mock("@/app/_actions/movement/update-transfer", () => ({
    updateTransfer: vi.fn(),
}));

import { TransferForm } from "@/components/movement/TransferForm";
import { addTransfer } from "@/app/_actions/movement/add-transfer";
import { updateTransfer } from "@/app/_actions/movement/update-transfer";

const addTransferMock = addTransfer as unknown as Mock;
const updateTransferMock = updateTransfer as unknown as Mock;

beforeEach(() => {
    addTransferMock.mockReset();
    addTransferMock.mockResolvedValue({ ok: true, data: { id: "m1" } });
    updateTransferMock.mockReset();
    updateTransferMock.mockResolvedValue({ ok: true, data: { id: "m1" } });
});

describe("TransferForm", () => {
    it("submits a gf_paid transfer by default", async () => {
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
        expect(addTransferMock).toHaveBeenCalledWith(
            expect.objectContaining({ direction: "gf_paid", amount: "300" }),
        );
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

    it("edits an existing transfer via updateTransfer, prefilled", async () => {
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
        expect(updateTransferMock).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "m9",
                direction: "gf_paid",
                amount: "400",
            }),
        );
        expect(addTransferMock).not.toHaveBeenCalled();
    });

    it("shows the field error and does not call onSuccess on a validation failure", async () => {
        addTransferMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Invalid transfer",
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
