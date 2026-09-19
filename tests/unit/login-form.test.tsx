import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    act,
} from "@testing-library/react";

// Isolate the component from the server action (and its auth/db imports).
const { loginActionMock, replaceMock } = vi.hoisted(() => ({
    loginActionMock: vi.fn(),
    replaceMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: replaceMock }),
}));
vi.mock("@/app/_actions/auth/login", () => ({
    loginAction: (...args: unknown[]) => loginActionMock(...args),
}));

import { LoginForm } from "@/components/auth/LoginForm";

beforeEach(() => {
    loginActionMock.mockReset();
    replaceMock.mockReset();
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

    it("Should keep a delayed success pending and navigate without an error", async () => {
        let release!: (value: { ok: true; data: undefined }) => void;
        loginActionMock.mockReturnValue(
            new Promise((resolve) => {
                release = resolve;
            }),
        );
        render(<LoginForm />);

        fillAndSubmit();

        const pendingButton = await screen.findByRole("button", {
            name: /signing in/i,
        });
        expect((pendingButton as HTMLButtonElement).disabled).toBe(true);
        expect(replaceMock).not.toHaveBeenCalled();
        expect(screen.queryByRole("alert")).toBeNull();

        await act(async () => release({ ok: true, data: undefined }));

        expect(replaceMock).toHaveBeenCalledExactlyOnceWith("/dashboard");
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("Should clear a failed attempt before a successful retry", async () => {
        loginActionMock
            .mockResolvedValueOnce({
                ok: false,
                code: "invalid_credentials",
                message: "Invalid email or password.",
            })
            .mockResolvedValueOnce({ ok: true, data: undefined });
        render(<LoginForm />);

        fillAndSubmit();
        expect((await screen.findByRole("alert")).textContent).toBe(
            "Invalid email or password.",
        );
        expect(replaceMock).not.toHaveBeenCalled();
        await waitFor(() =>
            expect(
                (
                    screen.getByRole("button", {
                        name: /sign in/i,
                    }) as HTMLButtonElement
                ).disabled,
            ).toBe(false),
        );

        fillAndSubmit();

        await waitFor(() =>
            expect(replaceMock).toHaveBeenCalledExactlyOnceWith("/dashboard"),
        );
        expect(screen.queryByRole("alert")).toBeNull();
    });
});

describe("expired login notice", () => {
    it("Should show the exact notice when the session expired", () => {
        render(<LoginForm sessionExpired />);
        expect(screen.getByRole("status").textContent).toBe(
            "Your session expired. Please log back in.",
        );
    });
    it("Should omit the notice when login has no expiry reason", () => {
        render(<LoginForm />);
        expect(
            screen.queryByText("Your session expired. Please log back in."),
        ).toBeNull();
    });
});
