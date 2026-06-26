import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
        render(<LogoutButton />);
        expect(screen.getByRole("button", { name: /sign out/i })).toBeDefined();
    });

    it("calls logoutAction when clicked", async () => {
        render(<LogoutButton />);
        fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
        await waitFor(() => expect(logoutActionMock).toHaveBeenCalled());
    });
});
