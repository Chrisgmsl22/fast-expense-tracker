import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The login form pulls in the login server action, which imports `@/auth` →
// `next-auth` → `next/server` (unresolvable under Vitest). Stub the action so
// the shell render stays a pure UI check.
vi.mock("@/app/_actions/auth/login", () => ({ loginAction: vi.fn() }));

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
