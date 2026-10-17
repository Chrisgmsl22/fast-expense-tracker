import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { FakeSignupGate } from "@/tests/support/fake-signup-gate";

const { gate } = vi.hoisted(() => ({
    gate: { current: undefined as FakeSignupGate | undefined },
}));
vi.mock("@/lib/repositories", () => ({
    get signupGate() {
        return gate.current;
    },
}));
vi.mock("@/app/_actions/auth/signup", () => ({ signupAction: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: vi.fn() }),
}));

import SignupPage, { dynamic } from "@/app/(auth)/signup/page";

beforeEach(() => {
    gate.current = new FakeSignupGate();
});

describe("SignupPage", () => {
    it("Should read the gate on every request rather than at build time", () => {
        expect(dynamic).toBe("force-dynamic");
    });

    it("Should show the signup form when the gate is open", async () => {
        render(await SignupPage());

        expect(gate.current?.reads).toBe(1);
        expect(screen.getByRole("form", { name: "Sign up" })).toBeDefined();
        expect(
            screen.getByRole("heading", { name: "Create account" }),
        ).toBeDefined();
        expect(screen.queryByText("Sign-ups are closed right now.")).toBeNull();
    });

    it("Should show the closed message and no form when the gate is closed", async () => {
        gate.current = new FakeSignupGate({ open: false });

        render(await SignupPage());

        expect(screen.getByRole("status").textContent).toBe(
            "Sign-ups are closed right now.",
        );
        expect(screen.queryByRole("form")).toBeNull();
        expect(screen.queryByLabelText("Password")).toBeNull();
    });

    it.each([{ open: true, maxUsers: 10 } as const, { open: false } as const])(
        "Should link back to login (gate open: $open)",
        async (state) => {
            gate.current = new FakeSignupGate(state);

            render(await SignupPage());

            expect(
                screen
                    .getByRole("link", { name: "Log in" })
                    .getAttribute("href"),
            ).toBe("/login");
            expect(
                screen.getByText(/already have an account\?/i),
            ).toBeDefined();
        },
    );
});
