import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/tests/support/intl";

const logoutActionMock = vi.fn();
vi.mock("@/app/_actions/auth/logout", () => ({
    logoutAction: () => logoutActionMock(),
}));

import { LogoutButton } from "@/components/auth/LogoutButton";

beforeEach(() => {
    logoutActionMock.mockReset();
    logoutActionMock.mockResolvedValue(undefined);
});

describe("LogoutButton", () => {
    it("renders a Sign out button", () => {
        renderWithIntl(<LogoutButton />);
        expect(screen.getByRole("button", { name: /sign out/i })).toBeDefined();
    });

    it("calls logoutAction when clicked", async () => {
        renderWithIntl(<LogoutButton />);
        fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
        await waitFor(() => expect(logoutActionMock).toHaveBeenCalled());
    });
});

describe("LogoutButton in Spanish", () => {
    it("Should name the button in Spanish, also when icon-only", () => {
        renderWithIntl(<LogoutButton />, { locale: "es" });
        expect(
            screen.getByRole("button", { name: "Cerrar sesión" }),
        ).toBeDefined();
    });

    it("Should give the icon-only button a Spanish name and title", () => {
        renderWithIntl(<LogoutButton iconOnly />, { locale: "es" });
        const button = screen.getByRole("button", { name: "Cerrar sesión" });
        expect(button.getAttribute("title")).toBe("Cerrar sesión");
    });
});
