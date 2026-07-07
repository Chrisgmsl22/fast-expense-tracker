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
        render(<AppNav email="test@email.com" />);
        // Desktop row (drawer is closed, so links appear once).
        expect(
            screen
                .getByRole("link", { name: "Dashboard" })
                .getAttribute("aria-current"),
        ).toBe("page");
        expect(screen.getByRole("link", { name: "Expenses" })).toBeDefined();
        expect(screen.getByRole("link", { name: "Income" })).toBeDefined();
        expect(screen.getByRole("link", { name: "Settlement" })).toBeDefined();
    });

    it("opens a drawer with the links, email, and sign-out", async () => {
        render(<AppNav email="test@email.com" />);
        fireEvent.click(screen.getByRole("button", { name: /open menu/i }));

        const drawer = await screen.findByRole("dialog");
        expect(
            within(drawer).getByRole("link", { name: "Dashboard" }),
        ).toBeDefined();
        expect(within(drawer).getByText("test@email.com")).toBeDefined();
        expect(
            within(drawer).getByRole("button", { name: /sign out/i }),
        ).toBeDefined();
    });

    it("closes the drawer when a link is tapped", async () => {
        render(<AppNav email="test@email.com" />);
        fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
        const drawer = await screen.findByRole("dialog");

        fireEvent.click(within(drawer).getByRole("link", { name: "Income" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });
});
