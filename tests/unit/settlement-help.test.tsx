import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { SettlementHelp } from "@/components/settlement/SettlementHelp";

describe("SettlementHelp", () => {
    it("opens a cheat-sheet of common operations", async () => {
        render(<SettlementHelp />);
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
});
