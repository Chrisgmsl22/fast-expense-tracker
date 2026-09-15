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
                    fundedFrom: "savings",
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
                // Re-asserted from the row, not reset: editing the amount of a
                // savings-funded transfer must not quietly move it back into
                // the budget.
                fundedFrom: "savings",
            }),
        );
        expect(addTransferMock).not.toHaveBeenCalled();
    });

    describe("the funding-source control (spec 0007 §6a decision 5)", () => {
        it("offers income and savings, and never reimbursed", async () => {
            render(<TransferForm partnerName="Brenda" />);
            const control = screen.getByLabelText("Funded from");

            expect(control.textContent).toContain("This month's income");
            fireEvent.click(control);

            await waitFor(() =>
                expect(
                    screen.getByRole("option", {
                        name: "Paid with money I already had",
                    }),
                ).toBeDefined(),
            );
            expect(
                screen.queryByRole("option", { name: "Fully reimbursed" }),
            ).toBeNull();
        });

        it("defaults to income, so ignoring the control changes nothing", async () => {
            const onSuccess = vi.fn();
            render(<TransferForm partnerName="Brenda" onSuccess={onSuccess} />);

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
                expect.objectContaining({ fundedFrom: "income" }),
            );
            expect(
                screen.queryByText(/still settles what you owe/i),
            ).toBeNull();
        });

        it("says what a savings-funded transfer leaves and what it still does", () => {
            render(
                <TransferForm
                    partnerName="Brenda"
                    transfer={{
                        id: "m9",
                        date: "2026-07-01",
                        amount: "8000",
                        note: "",
                        fundedFrom: "savings",
                    }}
                />,
            );

            expect(
                screen.getByText("Paid with money I already had"),
            ).toBeDefined();
            // Both halves of the rule, in the user's face: out of the budget,
            // still in the settlement.
            expect(
                screen.getByText(
                    /Doesn't count toward this month's budget or what you really spent\. It still settles what you owe Brenda\./,
                ),
            ).toBeDefined();
        });

        it("is hidden on money she sent you, which your money never funded", () => {
            render(
                <TransferForm direction="gf_received" partnerName="Brenda" />,
            );
            expect(screen.queryByLabelText("Funded from")).toBeNull();
        });

        it("sends income on an inbound transfer", async () => {
            const onSuccess = vi.fn();
            render(
                <TransferForm
                    direction="gf_received"
                    partnerName="Brenda"
                    onSuccess={onSuccess}
                />,
            );
            fireEvent.change(screen.getByLabelText("Date"), {
                target: { value: "2026-07-10" },
            });
            fireEvent.change(screen.getByLabelText(/Amount/), {
                target: { value: "320" },
            });
            fireEvent.click(
                screen.getByRole("button", { name: /Log Brenda's payment/ }),
            );

            await waitFor(() => expect(onSuccess).toHaveBeenCalled());
            expect(addTransferMock).toHaveBeenCalledWith(
                expect.objectContaining({ fundedFrom: "income" }),
            );
        });
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
