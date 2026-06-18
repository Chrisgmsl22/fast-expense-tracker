import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginPage from "@/app/(auth)/login/page";
import SettingsPage from "@/app/(dashboard)/settings/page";

// The expenses page became a data-backed async server component in 1.4 (capture),
// so it's no longer a renderable "shell" — its UI is covered by expense-form.test.tsx.
describe("Phase 1 page shells", () => {
    it("Should render the login shell heading", () => {
        render(<LoginPage />);
        expect(screen.getByRole("heading", { name: /log in/i })).toBeDefined();
    });

    it("Should render the settings shell heading", () => {
        render(<SettingsPage />);
        expect(
            screen.getByRole("heading", { name: /settings/i }),
        ).toBeDefined();
    });
});
