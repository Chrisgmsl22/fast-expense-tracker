import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl, setServerLocale } from "@/tests/support/intl";

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
        renderWithIntl(await LoginPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByRole("heading", { name: /log in/i })).toBeDefined();
    });

    it("Should render the login email + password fields and submit", async () => {
        renderWithIntl(await LoginPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByLabelText(/email/i)).toBeDefined();
        expect(screen.getByLabelText("Password")).toBeDefined();
        expect(screen.getByRole("button", { name: /sign in/i })).toBeDefined();
    });

    it("Should render the brand panel copy", async () => {
        renderWithIntl(await LoginPage({ searchParams: Promise.resolve({}) }));
        // Brand name appears in both the mobile and desktop panels (one hidden
        // by CSS, both in the DOM).
        expect(screen.getAllByText(/fast expense/i).length).toBeGreaterThan(0);
    });

    it("Should link Sign up to the signup page", async () => {
        renderWithIntl(await LoginPage({ searchParams: Promise.resolve({}) }));
        const signUp = screen.getByRole("link", { name: "Sign up" });
        expect(signUp.getAttribute("href")).toBe("/signup");
        expect(signUp.getAttribute("aria-disabled")).toBeNull();
        expect(screen.queryByText(/coming soon/i)).toBeNull();
    });
});

describe("login expiry reason", () => {
    it("Should show the notice when the fixed expiry reason is present", async () => {
        renderWithIntl(
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
            renderWithIntl(
                await LoginPage({ searchParams: Promise.resolve({ reason }) }),
            );
            expect(screen.queryByRole("status")).toBeNull();
        },
    );
});

describe("login page in Spanish", () => {
    it("Should render the heading, brand copy and signup link in Spanish", async () => {
        setServerLocale("es");
        renderWithIntl(await LoginPage({ searchParams: Promise.resolve({}) }), {
            locale: "es",
        });
        expect(
            screen.getByRole("heading", { name: "Iniciar sesión" }),
        ).toBeDefined();
        expect(
            screen.getAllByText("Inicia sesión para seguir registrando.")
                .length,
        ).toBeGreaterThan(0);
        expect(
            screen.getByText("Conoce exactamente a dónde se va tu dinero."),
        ).toBeDefined();
        expect(screen.getByText("¿No tienes cuenta?")).toBeDefined();
        expect(
            screen
                .getByRole("link", { name: "Crear cuenta" })
                .getAttribute("href"),
        ).toBe("/signup");
    });
});
