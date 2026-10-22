import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/tests/support/intl";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/_actions/settings/save-split-rule", () => ({
    saveSplitRule: vi.fn(),
}));

import { SplitRuleForm } from "@/components/settings/SplitRuleForm";
import { saveSplitRule } from "@/app/_actions/settings/save-split-rule";

const saveMock = saveSplitRule as unknown as Mock;

beforeEach(() => {
    saveMock.mockReset();
    saveMock.mockResolvedValue({ ok: true, data: { sharesExpenses: true } });
});

describe("SplitRuleForm", () => {
    it("Solo mode: hides the partner + share fields until the toggle is on", () => {
        renderWithIntl(
            <SplitRuleForm
                sharesExpenses={false}
                partnerName={null}
                defaultSharePercentage={0.68}
            />,
        );
        expect(screen.queryByLabelText("Partner name")).toBeNull();
        expect(screen.queryByLabelText("Your share")).toBeNull();
    });

    it("reveals the partner + share fields when sharing is toggled on", () => {
        renderWithIntl(
            <SplitRuleForm
                sharesExpenses={false}
                partnerName={null}
                defaultSharePercentage={0.68}
            />,
        );
        fireEvent.click(
            screen.getByRole("checkbox", { name: "I share expenses" }),
        );
        expect(screen.getByLabelText("Partner name")).toBeDefined();
        expect(screen.getByLabelText("Your share")).toBeDefined();
    });

    it("Shared mode: prefills the toggle, partner name and share %", () => {
        renderWithIntl(
            <SplitRuleForm
                sharesExpenses={true}
                partnerName="Brenda"
                defaultSharePercentage={0.68}
            />,
        );
        expect(
            (screen.getByLabelText("Partner name") as HTMLInputElement).value,
        ).toBe("Brenda");
        expect(
            (screen.getByLabelText("Your share") as HTMLInputElement).value,
        ).toBe("68");
    });

    it("saves the shared split rule via the action", async () => {
        renderWithIntl(
            <SplitRuleForm
                sharesExpenses={true}
                partnerName="Brenda"
                defaultSharePercentage={0.68}
            />,
        );
        fireEvent.change(screen.getByLabelText("Your share"), {
            target: { value: "70" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        await waitFor(() =>
            expect(saveMock).toHaveBeenCalledWith({
                sharesExpenses: true,
                partnerName: "Brenda",
                sharePercentage: "70",
            }),
        );
    });

    it("the Save button itself becomes a disabled 'Saved' success state", async () => {
        renderWithIntl(
            <SplitRuleForm
                sharesExpenses={true}
                partnerName="Brenda"
                defaultSharePercentage={0.68}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        // On success the button label flips to "Saved" and it is disabled;
        // there is no separate standalone "Saved" text element anymore.
        const savedButton = (await screen.findByRole("button", {
            name: "Saved",
        })) as HTMLButtonElement;
        expect(savedButton.disabled).toBe(true);
        expect(
            screen.queryByRole("button", { name: "Save changes" }),
        ).toBeNull();
    });

    it("renders the server's partner-name validation error", async () => {
        saveMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Please fix the highlighted fields.",
            fieldErrors: {
                partnerName: ["Add your partner's name to share expenses"],
            },
        });
        renderWithIntl(
            <SplitRuleForm
                sharesExpenses={true}
                partnerName=""
                defaultSharePercentage={0.68}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        await waitFor(() =>
            expect(
                screen.getByText("Add your partner's name to share expenses"),
            ).toBeDefined(),
        );
    });

    it("saves Solo mode with sharing off", async () => {
        renderWithIntl(
            <SplitRuleForm
                sharesExpenses={true}
                partnerName="Brenda"
                defaultSharePercentage={0.68}
            />,
        );
        // Toggle sharing off, then save.
        fireEvent.click(
            screen.getByRole("checkbox", { name: "I share expenses" }),
        );
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        await waitFor(() =>
            expect(saveMock).toHaveBeenCalledWith(
                expect.objectContaining({ sharesExpenses: false }),
            ),
        );
    });
});

describe("SplitRuleForm in Spanish", () => {
    it("Should render its labels, preview and button in Spanish", () => {
        renderWithIntl(
            <SplitRuleForm
                sharesExpenses
                partnerName="Brenda"
                defaultSharePercentage={0.68}
            />,
            { locale: "es" },
        );
        expect(
            screen.getByRole("form", { name: "Regla para dividir gastos" }),
        ).toBeDefined();
        expect(
            screen.getByRole("checkbox", { name: "Comparto gastos" }),
        ).toBeDefined();
        expect(screen.getByLabelText("Nombre de tu pareja")).toBeDefined();
        expect(screen.getByLabelText("Tu parte")).toBeDefined();
        expect(screen.getByText("Tú 68%")).toBeDefined();
        expect(screen.getByText("Pareja 32%")).toBeDefined();
        expect(
            screen.getByRole("button", { name: "Guardar cambios" }),
        ).toBeDefined();
    });

    it("Should show the Spanish fallback when the action throws", async () => {
        saveMock.mockRejectedValue(new Error("network"));
        renderWithIntl(
            <SplitRuleForm
                sharesExpenses={false}
                partnerName={null}
                defaultSharePercentage={0.68}
            />,
            { locale: "es" },
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Guardar cambios" }),
        );
        expect(
            await screen.findByText(
                "Algo salió mal al guardar tu configuración.",
            ),
        ).toBeDefined();
    });
});
