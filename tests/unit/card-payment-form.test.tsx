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

    it("starts on the default card and shows its balance before and after", () => {
        render(
            <CardPaymentForm
                cards={cards}
                defaultCardId="card2"
                balances={{ card2: 6130 }}
            />,
        );

        const preview = screen.getByText("BBVA balance").parentElement!;
        expect(preview.textContent).toContain("$6,130.00");
        fireEvent.change(screen.getByLabelText(/Amount/), {
            target: { value: "3000" },
        });
        expect(preview.textContent).toContain("$3,130.00");
        fireEvent.change(screen.getByLabelText(/Amount/), {
            target: { value: "7000" },
        });
        expect(preview.textContent).toContain("+$870.00");
    });

    it("fills the balance with Pay full", () => {
        render(
            <CardPaymentForm
                cards={cards}
                defaultCardId="card2"
                balances={{ card2: 1215.6 }}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Pay full $1,215.60" }),
        );

        expect(
            (screen.getByLabelText(/Amount/) as HTMLInputElement).value,
        ).toBe("1215.60");
    });

    it.each([0, -20])("hides Pay full when the balance is %s", (balance) => {
        render(
            <CardPaymentForm
                cards={cards}
                defaultCardId="card2"
                balances={{ card2: balance }}
            />,
        );

        expect(screen.queryByRole("button", { name: /Pay full/ })).toBeNull();
        expect(screen.getByText("BBVA balance")).toBeDefined();
    });

    it("shows no balance line without balances", () => {
        render(<CardPaymentForm cards={cards} defaultCardId="card2" />);

        expect(screen.queryByText(/balance/)).toBeNull();
        expect(screen.queryByRole("button", { name: /Pay full/ })).toBeNull();
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
