import { describe, it, expect } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { renderWithIntl } from "@/tests/support/intl";

import { SettlementHelp } from "@/components/settlement/SettlementHelp";

describe("SettlementHelp", () => {
    it("opens a cheat-sheet of common operations", async () => {
        renderWithIntl(<SettlementHelp partnerName="Brenda" />);
        fireEvent.click(
            screen.getByRole("button", { name: /how to use settlement/i }),
        );

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("Common operations")).toBeDefined();
        // A couple of the key flows are listed.
        expect(
            within(dialog).getByText(/You pay for something shared/),
        ).toBeDefined();
        expect(
            within(dialog).getByText(/You pay off a credit card/),
        ).toBeDefined();
    });

    it("quotes the real menu and button labels", async () => {
        renderWithIntl(<SettlementHelp partnerName="Brenda" />);
        fireEvent.click(
            screen.getByRole("button", { name: /how to use settlement/i }),
        );

        const dialog = await screen.findByRole("dialog");
        expect(
            within(dialog).getByText(
                /^Add → "Brenda paid me" \(or "Record payment" here\)/,
            ),
        ).toBeDefined();
        expect(
            within(dialog).getByText(
                '"Record payment" here (it will say "I paid Brenda").',
            ),
        ).toBeDefined();
        expect(
            within(dialog).getByText(/^"\+ I owe Brenda" here/),
        ).toBeDefined();
        expect(
            within(dialog).getByText(/^"\+ Brenda owes me" records/),
        ).toBeDefined();
        expect(within(dialog).getByText(/^Add → Card payment\./)).toBeDefined();
    });

    it("quotes the Spanish labels the menu and buttons show", async () => {
        renderWithIntl(<SettlementHelp partnerName="Brenda" />, {
            locale: "es",
        });
        fireEvent.click(
            screen.getByRole("button", { name: "Cómo usar Cuentas" }),
        );

        const dialog = await screen.findByRole("dialog");
        expect(
            within(dialog).getByText(
                /^Agregar → "Brenda me pagó" \(o "Registrar pago" aquí\)/,
            ),
        ).toBeDefined();
        expect(
            within(dialog).getByText(
                '"Registrar pago" aquí (dirá "Le pagué a Brenda").',
            ),
        ).toBeDefined();
        expect(
            within(dialog).getByText(/^"\+ Le debo a Brenda" aquí/),
        ).toBeDefined();
        expect(
            within(dialog).getByText(/^"\+ Brenda me debe" registra/),
        ).toBeDefined();
        expect(
            within(dialog).getByText(/^Agregar → Pago de tarjeta\./),
        ).toBeDefined();
    });
});
