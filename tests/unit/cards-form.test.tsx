import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/_actions/card/add", () => ({ addCard: vi.fn() }));
vi.mock("@/app/_actions/card/update", () => ({ updateCard: vi.fn() }));
vi.mock("@/app/_actions/card/archive", () => ({ archiveCard: vi.fn() }));
vi.mock("@/app/_actions/card/delete", () => ({ deleteCard: vi.fn() }));

import { CardsForm } from "@/components/settings/CardsForm";
import { MAX_ACTIVE_CARDS } from "@/lib/domain/card";
import type { CardSettingsItem } from "@/lib/repositories/card.repository";
import { addCard } from "@/app/_actions/card/add";
import { updateCard } from "@/app/_actions/card/update";
import { archiveCard } from "@/app/_actions/card/archive";
import { deleteCard } from "@/app/_actions/card/delete";

const addMock = addCard as unknown as Mock;
const updateMock = updateCard as unknown as Mock;
const archiveMock = archiveCard as unknown as Mock;
const deleteMock = deleteCard as unknown as Mock;

function card(over: Partial<CardSettingsItem> = {}): CardSettingsItem {
    return {
        id: over.id ?? "c1",
        name: over.name ?? "NU",
        color: over.color ?? "#9333ea",
        type: over.type ?? "credit",
        archivedAt: over.archivedAt ?? null,
        inUse: over.inUse ?? false,
    };
}

beforeEach(() => {
    addMock.mockReset();
    updateMock.mockReset();
    archiveMock.mockReset();
    deleteMock.mockReset();
    addMock.mockResolvedValue({ ok: true, data: { name: "NU" } });
    updateMock.mockResolvedValue({ ok: true, data: { id: "c1" } });
    archiveMock.mockResolvedValue({ ok: true, data: { id: "c1" } });
    deleteMock.mockResolvedValue({ ok: true, data: { id: "c1" } });
});

describe("CardsForm", () => {
    it("renders each card as a row", () => {
        render(
            <CardsForm
                cards={[
                    card({ id: "c1", name: "NU" }),
                    card({ id: "c2", name: "BBVA", type: "debit" }),
                ]}
            />,
        );
        expect(screen.getByText("NU")).toBeDefined();
        expect(screen.getByText("BBVA")).toBeDefined();
    });

    it("reveals the add form and submits a new card", async () => {
        render(<CardsForm cards={[]} />);
        fireEvent.click(screen.getByRole("button", { name: "Add card" }));

        const form = screen.getByRole("form", { name: "Add card" });
        fireEvent.change(within(form).getByLabelText("Card name"), {
            target: { value: "Amex Gold" },
        });
        fireEvent.click(within(form).getByRole("button", { name: "Add card" }));

        await waitFor(() =>
            expect(addMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: "Amex Gold",
                    type: "credit",
                }),
            ),
        );
    });

    it("surfaces a server field error on add", async () => {
        addMock.mockResolvedValue({
            ok: false,
            code: "duplicate_name",
            message: "You already have an active card with that name.",
            fieldErrors: { name: ["A card with that name already exists"] },
        });
        render(<CardsForm cards={[]} />);
        fireEvent.click(screen.getByRole("button", { name: "Add card" }));
        const form = screen.getByRole("form", { name: "Add card" });
        fireEvent.change(within(form).getByLabelText("Card name"), {
            target: { value: "NU" },
        });
        fireEvent.click(within(form).getByRole("button", { name: "Add card" }));

        await waitFor(() =>
            expect(
                screen.getByText("A card with that name already exists"),
            ).toBeDefined(),
        );
    });

    it("picks a palette swatch as the colour", async () => {
        render(<CardsForm cards={[]} />);
        fireEvent.click(screen.getByRole("button", { name: "Add card" }));
        const form = screen.getByRole("form", { name: "Add card" });
        fireEvent.change(within(form).getByLabelText("Card name"), {
            target: { value: "Teal Card" },
        });
        fireEvent.click(within(form).getByRole("button", { name: "Teal" }));
        fireEvent.click(within(form).getByRole("button", { name: "Add card" }));

        await waitFor(() =>
            expect(addMock).toHaveBeenCalledWith(
                expect.objectContaining({ color: "#0d9488" }),
            ),
        );
    });

    it("locks the cash card — no edit control, shows a lock note", () => {
        render(
            <CardsForm
                cards={[card({ id: "cash", name: "Cash", type: "cash" })]}
            />,
        );
        expect(screen.queryByRole("button", { name: "Edit Cash" })).toBeNull();
        expect(screen.getByText("locked")).toBeDefined();
    });

    it("marks an archived card and gives it no edit control", () => {
        render(
            <CardsForm
                cards={[
                    card({ id: "c1", name: "Old", archivedAt: new Date() }),
                ]}
            />,
        );
        expect(screen.getByText("Archived")).toBeDefined();
        expect(screen.queryByRole("button", { name: "Edit Old" })).toBeNull();
    });

    it("disables Add at the active-card cap with a hint", () => {
        const cards = Array.from({ length: MAX_ACTIVE_CARDS }, (_, i) =>
            card({ id: `c${i}`, name: `Card ${i}` }),
        );
        render(<CardsForm cards={cards} />);
        const addButton = screen.getByRole("button", {
            name: "Add card",
        }) as HTMLButtonElement;
        expect(addButton.disabled).toBe(true);
        expect(screen.getByText(/reached the .* limit/i)).toBeDefined();
    });

    it("edit → Archive when the card is in use", async () => {
        render(
            <CardsForm cards={[card({ id: "c1", name: "NU", inUse: true })]} />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit NU" }));
        fireEvent.click(screen.getByRole("button", { name: "Archive" }));

        await waitFor(() =>
            expect(archiveMock).toHaveBeenCalledWith({ id: "c1" }),
        );
        expect(deleteMock).not.toHaveBeenCalled();
    });

    it("edit → Delete when the card is unused", async () => {
        render(
            <CardsForm
                cards={[card({ id: "c1", name: "NU", inUse: false })]}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit NU" }));
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() =>
            expect(deleteMock).toHaveBeenCalledWith({ id: "c1" }),
        );
        expect(archiveMock).not.toHaveBeenCalled();
    });

    it("edit → Save changes calls updateCard", async () => {
        render(<CardsForm cards={[card({ id: "c1", name: "NU" })]} />);
        fireEvent.click(screen.getByRole("button", { name: "Edit NU" }));
        fireEvent.change(screen.getByLabelText("Card name"), {
            target: { value: "Nubank" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        await waitFor(() =>
            expect(updateMock).toHaveBeenCalledWith(
                expect.objectContaining({ id: "c1", name: "Nubank" }),
            ),
        );
    });
});
