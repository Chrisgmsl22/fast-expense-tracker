import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Isolate the component from the server action (and its auth/db imports).
const loginActionMock = vi.fn();
vi.mock("@/app/_actions/auth/login", () => ({
    loginAction: (...args: unknown[]) => loginActionMock(...args),
}));

import { LoginForm } from "@/components/auth/LoginForm";

beforeEach(() => {
    loginActionMock.mockReset();
});

function fillAndSubmit(email = "user@example.com", password = "hunter2") {
    fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: email },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: password },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("LoginForm", () => {
    it("submits the entered credentials to loginAction", async () => {
        loginActionMock.mockResolvedValue({
            ok: false,
            code: "invalid_credentials",
            message: "Invalid email or password.",
        });
        render(<LoginForm />);

        fillAndSubmit("admin@example.com", "secret123");

        await waitFor(() =>
            expect(loginActionMock).toHaveBeenCalledWith({
                email: "admin@example.com",
                password: "secret123",
            }),
        );
    });

    it("surfaces the form-level error message a failed result returns", async () => {
        loginActionMock.mockResolvedValue({
            ok: false,
            code: "invalid_credentials",
            message: "Invalid email or password.",
        });
        render(<LoginForm />);

        fillAndSubmit();

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toMatch(/invalid email or password/i);
    });

    it("renders per-field validation errors from the result", async () => {
        loginActionMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Enter a valid email and password.",
            fieldErrors: {
                email: ["Enter a valid email."],
                password: ["Password is required."],
            },
        });
        render(<LoginForm />);

        fillAndSubmit();

        expect(await screen.findByText("Enter a valid email.")).toBeDefined();
        expect(screen.getByText("Password is required.")).toBeDefined();
    });

    it("shows a generic error when the action throws", async () => {
        loginActionMock.mockRejectedValue(new Error("network down"));
        render(<LoginForm />);

        fillAndSubmit();

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toMatch(/something went wrong/i);
    });

    it("disables the submit button and shows a pending label while submitting", async () => {
        // A never-resolving action keeps the transition pending so the UI state
        // is observable.
        let release: () => void = () => {};
        loginActionMock.mockReturnValue(
            new Promise<never>(() => {
                release = () => {};
            }),
        );
        render(<LoginForm />);

        fillAndSubmit();

        const pendingButton = await screen.findByRole("button", {
            name: /signing in/i,
        });
        expect((pendingButton as HTMLButtonElement).disabled).toBe(true);
        release();
    });
});
