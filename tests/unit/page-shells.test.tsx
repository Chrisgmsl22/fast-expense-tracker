import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The login form pulls in the login server action, which imports `@/auth` →
// `next-auth` → `next/server` (unresolvable under Vitest). Stub the action so
// the shell render stays a pure UI check.
vi.mock("@/app/_actions/auth/login", () => ({ loginAction: vi.fn() }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: vi.fn() }),
}));

import LoginPage from "@/app/(auth)/login/page";

// The expenses page became a data-backed async server component in 1.4 (capture),
// so it's no longer a renderable "shell" — its UI is covered by expense-form.test.tsx.
// The settings page did the same in CHORE-6.a (it reads Settings + threads the
// partner name), so it's dropped here too — its UI is covered by
// split-rule-form.test.tsx.
describe("Phase 1 page shells", async () => {
    it("Should render the login shell heading", async () => {
        render(await LoginPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByRole("heading", { name: /log in/i })).toBeDefined();
    });

    it("Should render the login email + password fields and submit", async () => {
        render(await LoginPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByLabelText(/email/i)).toBeDefined();
        expect(screen.getByLabelText(/password/i)).toBeDefined();
        expect(screen.getByRole("button", { name: /sign in/i })).toBeDefined();
    });

    it("Should render the brand panel copy", async () => {
        render(await LoginPage({ searchParams: Promise.resolve({}) }));
        // Brand name appears in both the mobile and desktop panels (one hidden
        // by CSS, both in the DOM).
        expect(screen.getAllByText(/fast expense/i).length).toBeGreaterThan(0);
    });

    it("Should render Sign up as a non-interactive coming-soon placeholder", async () => {
        render(await LoginPage({ searchParams: Promise.resolve({}) }));
        const signUp = screen.getByText(/sign up/i);
        expect(signUp.getAttribute("aria-disabled")).toBe("true");
        // It must not be a real link/button that could navigate or submit.
        expect(screen.queryByRole("button", { name: /sign up/i })).toBeNull();
        expect(screen.queryByRole("link", { name: /sign up/i })).toBeNull();
    });
});

describe("login expiry reason", () => {
    it("Should show the notice when the fixed expiry reason is present", async () => {
        render(
            await LoginPage({
                searchParams: Promise.resolve({ reason: "session-expired" }),
            }),
        );
        expect(screen.getByRole("status").textContent).toBe(
            "Your session expired. Please log back in.",
        );
    });
    it.each([
        undefined,
        "logout",
        "https://example.com",
        ["session-expired", "logout"],
    ])(
        "Should omit the notice when the reason is not the fixed value (%s)",
        async (reason) => {
            render(
                await LoginPage({ searchParams: Promise.resolve({ reason }) }),
            );
            expect(screen.queryByRole("status")).toBeNull();
        },
    );
});
