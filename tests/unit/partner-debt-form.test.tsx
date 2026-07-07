import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/_actions/movement/add-partner-debt", () => ({
    addPartnerDebt: vi.fn(),
}));

import { PartnerDebtForm } from "@/components/movement/PartnerDebtForm";
import { addPartnerDebt } from "@/app/_actions/movement/add-partner-debt";

const addPartnerDebtMock = addPartnerDebt as unknown as Mock;

const categories = [
    { id: "c1", slug: "groceries", name: "Groceries", color: "#65a30d" },
    { id: "c2", slug: "health", name: "Health", color: "#14b8a6" },
];

beforeEach(() => {
    addPartnerDebtMock.mockReset();
    addPartnerDebtMock.mockResolvedValue({ ok: true, data: { id: "e1" } });
});

describe("PartnerDebtForm", () => {
    it("submits the debt with the preselected category", async () => {
        const onSuccess = vi.fn();
        render(
            <PartnerDebtForm
                categories={categories}
                defaultCategoryId="c1"
                onSuccess={onSuccess}
            />,
        );

        fireEvent.change(screen.getByLabelText("Date"), {
            target: { value: "2026-07-10" },
        });
        fireEvent.change(screen.getByLabelText(/Amount you owe/), {
            target: { value: "500" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Log debt" }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(addPartnerDebtMock).toHaveBeenCalledWith(
            expect.objectContaining({
                amount: "500",
                categoryId: "c1",
                date: "2026-07-10",
            }),
        );
    });

    it("surfaces a validation error without calling onSuccess", async () => {
        addPartnerDebtMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Invalid debt",
            fieldErrors: { categoryId: ["Category is required"] },
        });
        const onSuccess = vi.fn();
        render(
            <PartnerDebtForm categories={categories} onSuccess={onSuccess} />,
        );

        fireEvent.change(screen.getByLabelText("Date"), {
            target: { value: "2026-07-10" },
        });
        fireEvent.change(screen.getByLabelText(/Amount you owe/), {
            target: { value: "500" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Log debt" }));

        await waitFor(() =>
            expect(screen.getByText("Category is required")).toBeDefined(),
        );
        expect(onSuccess).not.toHaveBeenCalled();
    });
});
