import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/_actions/movement/add-transfer", () => ({
    addTransfer: vi.fn(),
}));
vi.mock("@/app/_actions/movement/update-transfer", () => ({
    updateTransfer: vi.fn(),
}));
vi.mock("@/app/_actions/movement/add-partner-debt", () => ({
    addPartnerDebt: vi.fn(),
}));
vi.mock("@/app/_actions/movement/update-partner-debt", () => ({
    updatePartnerDebt: vi.fn(),
}));
vi.mock("@/app/_actions/expense/add-partner-payment", () => ({
    addPartnerPayment: vi.fn(),
}));
vi.mock("@/app/_actions/expense/update-partner-payment", () => ({
    updatePartnerPayment: vi.fn(),
}));

import { SettlementActions } from "@/components/settlement/SettlementActions";
import { pastMonthNotice } from "@/components/settlement/past-month-notice";

describe("SettlementActions", () => {
    it("opens the partner debt form at zero with the configured name", async () => {
        render(
            <SettlementActions
                direction="settled"
                netAmount={0}
                partnerName="Alex"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "+ Alex owes me" }));
        const dialog = await screen.findByRole("dialog");
        expect(
            within(dialog).getByLabelText("What Alex owes you (MXN)"),
        ).toBeDefined();
        expect(
            within(dialog).getByText(/It adds no expense, income, or payment/),
        ).toBeDefined();
    });
    it("shows both debt actions and hides payment at zero", () => {
        render(
            <SettlementActions
                direction="settled"
                netAmount={0}
                partnerName="Brenda"
            />,
        );
        expect(
            screen.queryByRole("button", { name: "Record payment" }),
        ).toBeNull();
        expect(
            screen.getByRole("button", { name: /I owe Brenda/ }),
        ).toBeDefined();
        expect(
            screen.getByRole("button", { name: /Brenda owes me/ }),
        ).toBeDefined();
    });

    it("quick-settle prefills 'Brenda paid me' + the net amount when she owes you", async () => {
        render(
            <SettlementActions
                direction="she_owes"
                netAmount={700}
                partnerName="Brenda"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Record payment" }));

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
        render(
            <SettlementActions
                direction="you_owe"
                netAmount={200}
                partnerName="Brenda"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Record payment" }));

        const dialog = await screen.findByRole("dialog");
        expect(
            within(dialog).getByRole("button", {
                name: /Log payment to Brenda/,
            }),
        ).toBeDefined();
    });

    it("opens the debt form (settlement-only — no category picker)", async () => {
        render(
            <SettlementActions
                direction="she_owes"
                netAmount={700}
                partnerName="Brenda"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: /I owe Brenda/ }));

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByLabelText(/What you owe/)).toBeDefined();
        expect(
            within(dialog).queryByRole("combobox", { name: "Category" }),
        ).toBeNull();
    });

    it("carries the past-month warning INTO the transfer dialog", async () => {
        // The dialog covers the page, so the page's own copy of this sentence
        // is invisible at exactly the moment it matters.
        const notice = pastMonthNotice("August 2026");
        render(
            <SettlementActions
                direction="she_owes"
                netAmount={700}
                partnerName="Brenda"
                pastMonthNotice={notice}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Record payment" }));

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText(notice)).toBeDefined();
    });

    it("carries the past-month warning INTO the debt dialog", async () => {
        const notice = pastMonthNotice("August 2026");
        render(
            <SettlementActions
                direction="she_owes"
                netAmount={700}
                partnerName="Brenda"
                pastMonthNotice={notice}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: /I owe Brenda/ }));

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText(notice)).toBeDefined();
    });

    it("shows no such warning while on the current month", async () => {
        render(
            <SettlementActions
                direction="she_owes"
                netAmount={700}
                partnerName="Brenda"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Record payment" }));

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).queryByText(/You are viewing/)).toBeNull();
    });
});
