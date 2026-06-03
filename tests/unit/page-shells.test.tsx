import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginPage from "@/app/(auth)/login/page";
import ExpensesPage from "@/app/(dashboard)/expenses/page";
import SettingsPage from "@/app/(dashboard)/settings/page";

describe("Phase 1 page shells", () => {
    it("Should render the login shell heading", () => {
        render(<LoginPage />);
        expect(screen.getByRole("heading", { name: /log in/i })).toBeDefined();
    });

    it("Should render the expenses shell heading", () => {
        render(<ExpensesPage />);
        expect(
            screen.getByRole("heading", { name: /expenses/i }),
        ).toBeDefined();
    });

    it("Should render the settings shell heading", () => {
        render(<SettingsPage />);
        expect(
            screen.getByRole("heading", { name: /settings/i }),
        ).toBeDefined();
    });
});
