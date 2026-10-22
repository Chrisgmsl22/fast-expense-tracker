import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithIntl } from "@/tests/support/intl";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/_actions/card/add", () => ({ addCard: vi.fn() }));
vi.mock("@/app/_actions/card/update", () => ({ updateCard: vi.fn() }));
vi.mock("@/app/_actions/card/archive", () => ({ archiveCard: vi.fn() }));
vi.mock("@/app/_actions/card/delete", () => ({ deleteCard: vi.fn() }));
vi.mock("@/app/_actions/card/restore", () => ({ restoreCard: vi.fn() }));

import { CardsForm } from "@/components/settings/CardsForm";
import { MAX_ACTIVE_CARDS } from "@/lib/domain/card";
import { MESSAGES } from "@/i18n/messages";
import { CARD_PALETTE } from "@/lib/palette";
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
        renderWithIntl(
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
        renderWithIntl(<CardsForm cards={[]} />);
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
        renderWithIntl(<CardsForm cards={[]} />);
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
        renderWithIntl(<CardsForm cards={[]} />);
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
        renderWithIntl(<CardsForm cards={[]} />);
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
        renderWithIntl(<CardsForm cards={[]} />);
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
        renderWithIntl(<CardsForm cards={[]} />);
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
        renderWithIntl(<CardsForm cards={[]} />);
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

    it("reverts to a palette swatch when the custom-hex box is unchecked", async () => {
        renderWithIntl(<CardsForm cards={[]} />);
        fireEvent.click(screen.getByRole("button", { name: "Add card" }));
        const form = screen.getByRole("form", { name: "Add card" });
        fireEvent.change(within(form).getByLabelText("Card name"), {
            target: { value: "Custom Card" },
        });
        const box = within(form).getByRole("checkbox", {
            name: "Enter a custom color (HEX)",
        });
        fireEvent.click(box); // check → reveal hex
        fireEvent.change(within(form).getByLabelText("HEX color"), {
            target: { value: "#123456" },
        });
        fireEvent.click(box); // uncheck → reset to a swatch

        // Hex field is hidden again and the first palette swatch (Slate) is selected.
        expect(within(form).queryByLabelText("HEX color")).toBeNull();
        expect(
            within(form)
                .getByRole("button", { name: "Slate" })
                .getAttribute("aria-pressed"),
        ).toBe("true");

        // What's submitted matches the visible swatch, not the discarded hex.
        fireEvent.click(within(form).getByRole("button", { name: "Add card" }));
        await waitFor(() =>
            expect(addMock).toHaveBeenCalledWith(
                expect.objectContaining({ color: "#6b7280" }),
            ),
        );
    });

    it("edit on a custom-hex card pre-checks advanced and prefills the hex", () => {
        renderWithIntl(
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
        renderWithIntl(
            <CardsForm
                cards={[card({ id: "c1", name: "NU", color: "#9333ea" })]}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit NU" }));

        expect(screen.queryByLabelText("HEX color")).toBeNull();
    });

    it("locks the cash card — no edit control, shows a lock note", () => {
        renderWithIntl(
            <CardsForm
                cards={[card({ id: "cash", name: "Cash", type: "cash" })]}
            />,
        );
        expect(screen.queryByRole("button", { name: "Edit Cash" })).toBeNull();
        expect(screen.getByText("locked")).toBeDefined();
    });

    it("puts archived cards in their own section — Restore only, no edit/archive/delete", () => {
        renderWithIntl(
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
        renderWithIntl(<CardsForm cards={[card({ id: "a1", name: "NU" })]} />);
        expect(screen.queryByText("Archived")).toBeNull();
    });

    it("restores an archived card", async () => {
        renderWithIntl(
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
        renderWithIntl(
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
        renderWithIntl(
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
        renderWithIntl(<CardsForm cards={cards} />);
        const addButton = screen.getByRole("button", {
            name: "Add card",
        }) as HTMLButtonElement;
        expect(addButton.disabled).toBe(true);
        expect(screen.getByText(/reached the .* limit/i)).toBeDefined();
    });

    it("edit → Archive when the card is in use", async () => {
        renderWithIntl(
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
        renderWithIntl(
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
        renderWithIntl(
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
        renderWithIntl(<CardsForm cards={[card({ id: "c1", name: "NU" })]} />);
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

    it("shows a colour error under the colour field when saving an edit", async () => {
        updateMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Please fix the highlighted fields.",
            fieldErrors: { color: ["Enter a valid #RRGGBB color"] },
        });
        renderWithIntl(
            <CardsForm
                cards={[card({ id: "c1", name: "BBVA", color: "blue" })]}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit BBVA" }));
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        const error = await screen.findByText("Enter a valid #RRGGBB color");
        expect(error.id).toBe("edit-card-c1-color-error");
        const hex = screen.getByLabelText("HEX color");
        expect(hex.getAttribute("aria-invalid")).toBe("true");
        expect(hex.getAttribute("aria-describedby")).toBe(error.id);
        expect(
            screen
                .getByRole("group", { name: "Color swatches" })
                .getAttribute("aria-describedby"),
        ).toBe(error.id);
    });

    it("shows a colour error under the colour field on add", async () => {
        addMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Please fix the highlighted fields.",
            fieldErrors: { color: ["Enter a valid #RRGGBB color"] },
        });
        renderWithIntl(<CardsForm cards={[]} />);
        fireEvent.click(screen.getByRole("button", { name: "Add card" }));
        const form = screen.getByRole("form", { name: "Add card" });
        fireEvent.click(within(form).getByRole("button", { name: "Add card" }));

        const error = await within(form).findByText(
            "Enter a valid #RRGGBB color",
        );
        expect(error.id).toBe("add-card-color-error");
        expect(
            within(form)
                .getByRole("group", { name: "Color swatches" })
                .getAttribute("aria-describedby"),
        ).toBe("add-card-color-error");
    });

    it("leaves the colour field undescribed when there is no colour error", () => {
        renderWithIntl(<CardsForm cards={[card({ id: "c1", name: "NU" })]} />);
        fireEvent.click(screen.getByRole("button", { name: "Edit NU" }));

        expect(
            screen
                .getByRole("group", { name: "Color swatches" })
                .getAttribute("aria-describedby"),
        ).toBeNull();
    });

    it("surfaces a has_references message when a delete is refused", async () => {
        deleteMock.mockResolvedValue({
            ok: false,
            code: "has_references",
            message: "This card is used by past records — archive it instead.",
        });
        renderWithIntl(
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
        renderWithIntl(
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
        renderWithIntl(
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

describe("CardsForm in Spanish", () => {
    it("Should render rows, types and the locked Cash card in Spanish", () => {
        renderWithIntl(
            <CardsForm
                cards={[
                    card({ id: "c1", name: "NU" }),
                    card({ id: "c2", name: "BBVA", type: "debit" }),
                    card({
                        id: "cash",
                        name: "Cash",
                        type: "cash",
                        color: "#16a34a",
                    }),
                    card({
                        id: "old",
                        name: "Old",
                        archivedAt: new Date("2026-01-01"),
                    }),
                ]}
            />,
            { locale: "es" },
        );
        const section = screen.getByRole("region", { name: "Tarjetas" });
        expect(within(section).getAllByText("Crédito")).toHaveLength(2);
        expect(within(section).getByText("Débito")).toBeDefined();
        expect(within(section).getByText("Efectivo")).toBeDefined();
        expect(within(section).getByText("bloqueada")).toBeDefined();
        expect(screen.getByRole("button", { name: "Editar NU" })).toBeDefined();
        expect(screen.getByText("Archivadas")).toBeDefined();
        expect(
            screen.getByRole("button", { name: "Restaurar Old" }),
        ).toBeDefined();
    });

    it("Should render the add form and swatch names in Spanish", () => {
        renderWithIntl(<CardsForm cards={[]} />, { locale: "es" });
        expect(
            screen.getByText("Aún no tienes tarjetas. Agrega la primera."),
        ).toBeDefined();
        fireEvent.click(
            screen.getByRole("button", { name: "Agregar tarjeta" }),
        );
        const form = screen.getByRole("form", { name: "Agregar tarjeta" });
        expect(
            within(form).getByLabelText("Nombre de la tarjeta"),
        ).toBeDefined();
        expect(
            within(form).getByRole("combobox", { name: "Tipo de tarjeta" }),
        ).toBeDefined();
        const swatches = within(form).getByRole("group", {
            name: "Muestras de color",
        });
        expect(
            within(swatches).getByRole("button", { name: "Pizarra" }),
        ).toBeDefined();
        expect(
            within(form).getByRole("button", { name: "Cancelar" }),
        ).toBeDefined();
    });

    it("Should confirm a delete in Spanish", () => {
        renderWithIntl(<CardsForm cards={[card({ id: "c1", name: "NU" })]} />, {
            locale: "es",
        });
        fireEvent.click(screen.getByRole("button", { name: "Editar NU" }));
        fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
        expect(
            screen.getByRole("dialog", { name: "¿Eliminar NU?" }),
        ).toBeDefined();
        expect(screen.getByText("Esto no se puede deshacer.")).toBeDefined();
    });

    it("Should show the card cap in Spanish", () => {
        const cards = Array.from({ length: MAX_ACTIVE_CARDS }, (_, i) =>
            card({ id: `c${i}`, name: `Card ${i}` }),
        );
        renderWithIntl(<CardsForm cards={cards} />, { locale: "es" });
        expect(
            screen.getByText(
                `Llegaste al límite de ${MAX_ACTIVE_CARDS} tarjetas. Archiva una para agregar otra.`,
            ),
        ).toBeDefined();
    });
});

describe("CardsForm labels", () => {
    it("Should show an unknown card type as stored", () => {
        renderWithIntl(
            <CardsForm cards={[card({ id: "c1", type: "prepaid" })]} />,
            { locale: "es" },
        );
        expect(screen.getByText("prepaid")).toBeDefined();
    });

    it.each(["en", "es"] as const)(
        "Should have a %s name for every palette swatch",
        (locale) => {
            const names: Record<string, string> =
                MESSAGES[locale].settings.cards.swatches;
            for (const swatch of CARD_PALETTE) {
                expect(Object.hasOwn(names, swatch.name)).toBe(true);
            }
        },
    );
});
