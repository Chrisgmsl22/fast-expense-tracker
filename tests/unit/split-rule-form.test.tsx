import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
        render(
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
        render(
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
        render(
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
        render(
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
        render(
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
        render(
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
        render(
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
