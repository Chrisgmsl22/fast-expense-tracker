import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/_actions/movement/add-transfer", () => ({
    addTransfer: vi.fn(),
}));
vi.mock("@/app/_actions/movement/add-partner-debt", () => ({
    addPartnerDebt: vi.fn(),
}));
vi.mock("@/app/_actions/movement/update-partner-debt", () => ({
    updatePartnerDebt: vi.fn(),
}));

import { SettlementActions } from "@/components/settlement/SettlementActions";

describe("SettlementActions", () => {
    it("renders both actions", () => {
        render(<SettlementActions direction="settled" netAmount={0} />);
        expect(
            screen.getByRole("button", { name: "Log a transfer" }),
        ).toBeDefined();
        expect(
            screen.getByRole("button", { name: /I owe Brenda/ }),
        ).toBeDefined();
    });

    it("quick-settle prefills 'Brenda paid me' + the net amount when she owes you", async () => {
        render(<SettlementActions direction="she_owes" netAmount={700} />);
        fireEvent.click(screen.getByRole("button", { name: "Log a transfer" }));

        const dialog = await screen.findByRole("dialog");
        // she_owes → the settling transfer is her paying you (gf_received).
        expect(
            within(dialog).getByRole("button", {
                name: /Log Brenda's payment/,
            }),
        ).toBeDefined();
        const amount = within(dialog).getByLabelText(
            /Amount/,
        ) as HTMLInputElement;
        expect(amount.value).toBe("700");
    });

    it("quick-settle uses 'I paid Brenda' when you owe her", async () => {
        render(<SettlementActions direction="you_owe" netAmount={200} />);
        fireEvent.click(screen.getByRole("button", { name: "Log a transfer" }));

        const dialog = await screen.findByRole("dialog");
        expect(
            within(dialog).getByRole("button", {
                name: /Log payment to Brenda/,
            }),
        ).toBeDefined();
    });

    it("opens the debt form (settlement-only — no category picker)", async () => {
        render(<SettlementActions direction="she_owes" netAmount={700} />);
        fireEvent.click(screen.getByRole("button", { name: /I owe Brenda/ }));

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByLabelText(/Amount you owe/)).toBeDefined();
        expect(
            within(dialog).queryByRole("combobox", { name: "Category" }),
        ).toBeNull();
    });
});
