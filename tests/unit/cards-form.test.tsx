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
vi.mock("@/app/_actions/card/restore", () => ({ restoreCard: vi.fn() }));

import { CardsForm } from "@/components/settings/CardsForm";
import { MAX_ACTIVE_CARDS } from "@/lib/domain/card";
import type { CardSettingsItem } from "@/lib/repositories/card.repository";
import { addCard } from "@/app/_actions/card/add";
import { updateCard } from "@/app/_actions/card/update";
import { archiveCard } from "@/app/_actions/card/archive";
import { deleteCard } from "@/app/_actions/card/delete";
import { restoreCard } from "@/app/_actions/card/restore";

const addMock = addCard as unknown as Mock;
const updateMock = updateCard as unknown as Mock;
const archiveMock = archiveCard as unknown as Mock;
const deleteMock = deleteCard as unknown as Mock;
const restoreMock = restoreCard as unknown as Mock;

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
    restoreMock.mockReset();
    restoreMock.mockResolvedValue({ ok: true, data: { id: "c1", name: "NU" } });
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

    it("offers only Credit and Debit as add types (no Cash)", async () => {
        render(<CardsForm cards={[]} />);
        fireEvent.click(screen.getByRole("button", { name: "Add card" }));
        // Open the type dropdown so its options mount.
        fireEvent.click(screen.getByLabelText("Card type"));

        await waitFor(() =>
            expect(
                screen.getByRole("option", { name: "Credit" }),
            ).toBeDefined(),
        );
        expect(screen.getByRole("option", { name: "Debit" })).toBeDefined();
        expect(screen.queryByRole("option", { name: "Cash" })).toBeNull();
    });

    it("shows the max-cards hint on the add form", () => {
        render(<CardsForm cards={[]} />);
        fireEvent.click(screen.getByRole("button", { name: "Add card" }));
        expect(
            screen.getByText(`Up to ${MAX_ACTIVE_CARDS} cards.`),
        ).toBeDefined();
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

    it("picks a palette swatch as the colour (custom hex stays hidden)", async () => {
        render(<CardsForm cards={[]} />);
        fireEvent.click(screen.getByRole("button", { name: "Add card" }));
        const form = screen.getByRole("form", { name: "Add card" });
        fireEvent.change(within(form).getByLabelText("Card name"), {
            target: { value: "Teal Card" },
        });
        // The hex field is hidden by default — a swatch pick still works.
        expect(within(form).queryByLabelText("HEX color")).toBeNull();
        fireEvent.click(within(form).getByRole("button", { name: "Teal" }));
        fireEvent.click(within(form).getByRole("button", { name: "Add card" }));

        await waitFor(() =>
            expect(addMock).toHaveBeenCalledWith(
                expect.objectContaining({ color: "#0d9488" }),
            ),
        );
    });

    it("hides the custom hex input until the advanced checkbox is ticked", () => {
        render(<CardsForm cards={[]} />);
        fireEvent.click(screen.getByRole("button", { name: "Add card" }));
        const form = screen.getByRole("form", { name: "Add card" });

        expect(within(form).queryByLabelText("HEX color")).toBeNull();
        fireEvent.click(
            within(form).getByRole("checkbox", {
                name: "Enter a custom color (HEX)",
            }),
        );
        expect(within(form).getByLabelText("HEX color")).toBeDefined();
    });

    it("submits a typed custom hex once the advanced box is ticked", async () => {
        render(<CardsForm cards={[]} />);
        fireEvent.click(screen.getByRole("button", { name: "Add card" }));
        const form = screen.getByRole("form", { name: "Add card" });
        fireEvent.change(within(form).getByLabelText("Card name"), {
            target: { value: "Custom Card" },
        });
        fireEvent.click(
            within(form).getByRole("checkbox", {
                name: "Enter a custom color (HEX)",
            }),
        );
        fireEvent.change(within(form).getByLabelText("HEX color"), {
            target: { value: "#123456" },
        });
        fireEvent.click(within(form).getByRole("button", { name: "Add card" }));

        await waitFor(() =>
            expect(addMock).toHaveBeenCalledWith(
                expect.objectContaining({ color: "#123456" }),
            ),
        );
    });

    it("edit on a custom-hex card pre-checks advanced and prefills the hex", () => {
        render(
            <CardsForm
                cards={[card({ id: "c1", name: "NU", color: "#abcdef" })]}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit NU" }));

        const checkbox = screen.getByRole("checkbox", {
            name: "Enter a custom color (HEX)",
        });
        expect(checkbox.getAttribute("aria-checked")).toBe("true");
        expect(
            (screen.getByLabelText("HEX color") as HTMLInputElement).value,
        ).toBe("#abcdef");
    });

    it("edit on a palette-colour card leaves advanced unchecked", () => {
        render(
            <CardsForm
                cards={[card({ id: "c1", name: "NU", color: "#9333ea" })]}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit NU" }));

        expect(screen.queryByLabelText("HEX color")).toBeNull();
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

    it("puts archived cards in their own section — Restore only, no edit/archive/delete", () => {
        render(
            <CardsForm
                cards={[
                    card({ id: "a1", name: "NU" }),
                    card({ id: "c1", name: "Old", archivedAt: new Date() }),
                ]}
            />,
        );
        expect(screen.getByText("Archived")).toBeDefined();
        expect(
            screen.getByRole("button", { name: "Restore Old" }),
        ).toBeDefined();
        expect(screen.queryByRole("button", { name: "Edit Old" })).toBeNull();
    });

    it("omits the Archived section when there are no archived cards", () => {
        render(<CardsForm cards={[card({ id: "a1", name: "NU" })]} />);
        expect(screen.queryByText("Archived")).toBeNull();
    });

    it("restores an archived card", async () => {
        render(
            <CardsForm
                cards={[
                    card({ id: "c1", name: "Old", archivedAt: new Date() }),
                ]}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Restore Old" }));

        await waitFor(() =>
            expect(restoreMock).toHaveBeenCalledWith({ id: "c1" }),
        );
    });

    it("surfaces a limit-reached message when restore is blocked at the cap", async () => {
        restoreMock.mockResolvedValue({
            ok: false,
            code: "limit_reached",
            message:
                "You're at the 10-card limit — archive or delete an active card first.",
        });
        render(
            <CardsForm
                cards={[
                    card({ id: "c1", name: "Old", archivedAt: new Date() }),
                ]}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Restore Old" }));

        await waitFor(() =>
            expect(
                screen.getByText(
                    "You're at the 10-card limit — archive or delete an active card first.",
                ),
            ).toBeDefined(),
        );
    });

    it("surfaces a name-conflict message when restore is blocked", async () => {
        restoreMock.mockResolvedValue({
            ok: false,
            code: "name_conflict",
            message:
                'You already have an active card named "NU" — rename or archive that one first.',
        });
        render(
            <CardsForm
                cards={[card({ id: "c1", name: "NU", archivedAt: new Date() })]}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Restore NU" }));

        await waitFor(() =>
            expect(
                screen.getByText(
                    'You already have an active card named "NU" — rename or archive that one first.',
                ),
            ).toBeDefined(),
        );
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

    it("edit → Delete opens a confirm dialog, then deletes on confirm", async () => {
        render(
            <CardsForm
                cards={[card({ id: "c1", name: "NU", inUse: false })]}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit NU" }));
        // First Delete click only opens the dialog — nothing deleted yet.
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(deleteMock).not.toHaveBeenCalled();

        const dialog = await screen.findByRole("dialog");
        expect(dialog.textContent).toContain("Delete NU?");
        fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

        await waitFor(() =>
            expect(deleteMock).toHaveBeenCalledWith({ id: "c1" }),
        );
        expect(archiveMock).not.toHaveBeenCalled();
    });

    it("edit → Delete → Cancel dismisses the dialog without deleting", async () => {
        render(
            <CardsForm
                cards={[card({ id: "c1", name: "NU", inUse: false })]}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit NU" }));
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));

        const dialog = await screen.findByRole("dialog");
        fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

        expect(deleteMock).not.toHaveBeenCalled();
    });

    it("surfaces a server field error when saving an edit", async () => {
        updateMock.mockResolvedValue({
            ok: false,
            code: "duplicate_name",
            message: "You already have an active card with that name.",
            fieldErrors: { name: ["A card with that name already exists"] },
        });
        render(<CardsForm cards={[card({ id: "c1", name: "NU" })]} />);
        fireEvent.click(screen.getByRole("button", { name: "Edit NU" }));
        fireEvent.change(screen.getByLabelText("Card name"), {
            target: { value: "BBVA" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        await waitFor(() =>
            expect(
                screen.getByText("A card with that name already exists"),
            ).toBeDefined(),
        );
    });

    it("surfaces a has_references message when a delete is refused", async () => {
        deleteMock.mockResolvedValue({
            ok: false,
            code: "has_references",
            message: "This card is used by past records — archive it instead.",
        });
        render(
            <CardsForm
                cards={[card({ id: "c1", name: "NU", inUse: false })]}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit NU" }));
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

        await waitFor(() =>
            expect(
                screen.getByText(
                    "This card is used by past records — archive it instead.",
                ),
            ).toBeDefined(),
        );
    });

    it("edit form shows the type dropdown prefilled with the card's type", async () => {
        render(
            <CardsForm
                cards={[card({ id: "c1", name: "BBVA", type: "debit" })]}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit BBVA" }));

        // The trigger shows the current type; opening it reveals Credit/Debit.
        expect(screen.getByLabelText("Card type").textContent).toContain(
            "Debit",
        );
        fireEvent.click(screen.getByLabelText("Card type"));
        await waitFor(() =>
            expect(
                screen.getByRole("option", { name: "Credit" }),
            ).toBeDefined(),
        );
        expect(screen.queryByRole("option", { name: "Cash" })).toBeNull();
    });

    it("edit → Save changes calls updateCard with the type", async () => {
        render(
            <CardsForm
                cards={[card({ id: "c1", name: "NU", type: "credit" })]}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit NU" }));
        fireEvent.change(screen.getByLabelText("Card name"), {
            target: { value: "Nubank" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        await waitFor(() =>
            expect(updateMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "c1",
                    name: "Nubank",
                    type: "credit",
                }),
            ),
        );
    });
});
