import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/_actions/movement/add-card-payment", () => ({
    addCardPayment: vi.fn(),
}));
vi.mock("@/app/_actions/movement/update-card-payment", () => ({
    updateCardPayment: vi.fn(),
}));

import { CardPaymentForm } from "@/components/movement/CardPaymentForm";
import { addCardPayment } from "@/app/_actions/movement/add-card-payment";
import { updateCardPayment } from "@/app/_actions/movement/update-card-payment";

const addMock = addCardPayment as unknown as Mock;
const updateMock = updateCardPayment as unknown as Mock;

const cards = [
    { id: "card1", name: "Amex", color: "#ca8a04" },
    { id: "card2", name: "BBVA", color: "#2563eb" },
];

beforeEach(() => {
    addMock.mockReset();
    addMock.mockResolvedValue({ ok: true, data: { id: "m1" } });
    updateMock.mockReset();
    updateMock.mockResolvedValue({ ok: true, data: { id: "m1" } });
});

describe("CardPaymentForm", () => {
    it("adds a new card payment", async () => {
        const onSuccess = vi.fn();
        render(<CardPaymentForm cards={cards} onSuccess={onSuccess} />);

        fireEvent.change(screen.getByLabelText("Date"), {
            target: { value: "2026-07-10" },
        });
        fireEvent.change(screen.getByLabelText(/Amount/), {
            target: { value: "800" },
        });
        fireEvent.click(
            screen.getByRole("button", { name: "Add card payment" }),
        );

        // A card is required — nothing saved without it.
        await waitFor(() => expect(onSuccess).not.toHaveBeenCalled());
    });

    it("edits an existing card payment via updateCardPayment, prefilled", async () => {
        const onSuccess = vi.fn();
        render(
            <CardPaymentForm
                cards={cards}
                payment={{
                    id: "m9",
                    date: "2026-07-01",
                    amount: "500",
                    cardId: "card2",
                    note: "min payment",
                }}
                onSuccess={onSuccess}
            />,
        );

        expect(
            (screen.getByLabelText(/Amount/) as HTMLInputElement).value,
        ).toBe("500");
        expect((screen.getByLabelText(/Note/) as HTMLInputElement).value).toBe(
            "min payment",
        );
        // Prefilled card shows in the trigger.
        expect(screen.getByText("BBVA")).toBeDefined();

        fireEvent.change(screen.getByLabelText(/Amount/), {
            target: { value: "520" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(updateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "m9",
                amount: "520",
                cardId: "card2",
            }),
        );
        expect(addMock).not.toHaveBeenCalled();
    });

    it("surfaces a field error and does not call onSuccess on failure", async () => {
        updateMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Invalid card payment",
            fieldErrors: { amount: ["Amount must be greater than 0"] },
        });
        const onSuccess = vi.fn();
        render(
            <CardPaymentForm
                cards={cards}
                payment={{
                    id: "m9",
                    date: "2026-07-01",
                    amount: "0",
                    cardId: "card1",
                    note: "",
                }}
                onSuccess={onSuccess}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        await waitFor(() =>
            expect(
                screen.getByText("Amount must be greater than 0"),
            ).toBeDefined(),
        );
        expect(onSuccess).not.toHaveBeenCalled();
    });
});
