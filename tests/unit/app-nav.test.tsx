import { describe, it, expect, vi } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from "@testing-library/react";

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
}));
vi.mock("@/app/_actions/auth/logout", () => ({
    logoutAction: vi.fn(),
}));

import { AppNav } from "@/components/nav/AppNav";

describe("AppNav", () => {
    it("renders the nav links and marks the active route", () => {
        render(<AppNav email="test@email.com" showSettlement />);
        // Desktop row (drawer is closed, so links appear once).
        expect(
            screen
                .getByRole("link", { name: "Dashboard" })
                .getAttribute("aria-current"),
        ).toBe("page");
        expect(screen.getByRole("link", { name: "Expenses" })).toBeDefined();
        expect(screen.getByRole("link", { name: "Income" })).toBeDefined();
        expect(screen.getByRole("link", { name: "Settlement" })).toBeDefined();
        // Settings is a separate gear entry point, not part of the primary
        // LINKS row. Drawer is closed, so only the desktop gear is present.
        const settings = screen.getByRole("link", { name: "Settings" });
        expect(settings.getAttribute("href")).toBe("/settings");
    });

    it("opens a drawer with the links, email, and sign-out", async () => {
        render(<AppNav email="test@email.com" showSettlement />);
        fireEvent.click(screen.getByRole("button", { name: /open menu/i }));

        const drawer = await screen.findByRole("dialog");
        expect(
            within(drawer).getByRole("link", { name: "Dashboard" }),
        ).toBeDefined();
        expect(within(drawer).getByText("test@email.com")).toBeDefined();
        const settings = within(drawer).getByRole("link", { name: "Settings" });
        expect(settings.getAttribute("href")).toBe("/settings");
        expect(
            within(drawer).getByRole("button", { name: /sign out/i }),
        ).toBeDefined();
    });

    it("closes the drawer when a link is tapped", async () => {
        render(<AppNav email="test@email.com" showSettlement />);
        fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
        const drawer = await screen.findByRole("dialog");

        fireEvent.click(within(drawer).getByRole("link", { name: "Income" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    // showSettlement=false is the Solo + settled case (nothing left to wind
    // down); the layout hides the link. The others stay.
    it("drops the Settlement link when showSettlement is false (CHORE-6.b)", () => {
        render(<AppNav email="test@email.com" showSettlement={false} />);
        expect(screen.getByRole("link", { name: "Dashboard" })).toBeDefined();
        expect(screen.getByRole("link", { name: "Expenses" })).toBeDefined();
        expect(screen.getByRole("link", { name: "Income" })).toBeDefined();
        expect(screen.queryByRole("link", { name: "Settlement" })).toBeNull();
        // The Settings gear stays regardless of mode.
        expect(screen.getByRole("link", { name: "Settings" })).toBeDefined();
    });

    // showSettlement=true covers both Shared mode and Solo-with-an-unsettled
    // balance — either way the link is reachable so the balance can be settled.
    it("shows the Settlement link when showSettlement is true (CHORE-6.b)", () => {
        render(<AppNav email="test@email.com" showSettlement />);
        expect(screen.getByRole("link", { name: "Settlement" })).toBeDefined();
    });
});
