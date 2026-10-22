import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { renderWithIntl } from "@/tests/support/intl";

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
    fireEvent.change(screen.getByLabelText("Password"), {
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
        renderWithIntl(<LoginForm />);

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
        renderWithIntl(<LoginForm />);

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
        renderWithIntl(<LoginForm />);

        fillAndSubmit();

        expect(await screen.findByText("Enter a valid email.")).toBeDefined();
        expect(screen.getByText("Password is required.")).toBeDefined();
    });

    it("shows a generic error when the action throws", async () => {
        loginActionMock.mockRejectedValue(new Error("network down"));
        renderWithIntl(<LoginForm />);

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
        renderWithIntl(<LoginForm />);

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
        renderWithIntl(<LoginForm />);

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

describe("login password toggle", () => {
    it("Should show and hide the password without submitting", () => {
        renderWithIntl(<LoginForm />);
        const password = screen.getByLabelText("Password");
        fireEvent.change(password, { target: { value: "hunter2" } });

        fireEvent.click(screen.getByRole("button", { name: "Show password" }));

        expect(password.getAttribute("type")).toBe("text");
        expect(password.getAttribute("autocomplete")).toBe("current-password");
        expect((password as HTMLInputElement).value).toBe("hunter2");

        fireEvent.click(screen.getByRole("button", { name: "Hide password" }));

        expect(password.getAttribute("type")).toBe("password");
        expect(loginActionMock).not.toHaveBeenCalled();
    });

    it("Should hide the password before the request goes out", async () => {
        const typesAtRequest: (string | null)[] = [];
        loginActionMock.mockImplementation(async () => {
            typesAtRequest.push(
                screen.getByLabelText("Password").getAttribute("type"),
            );
            return { ok: true, data: undefined };
        });
        renderWithIntl(<LoginForm />);
        fireEvent.click(screen.getByRole("button", { name: "Show password" }));

        fillAndSubmit();

        await waitFor(() => expect(replaceMock).toHaveBeenCalled());
        expect(typesAtRequest).toEqual(["password"]);
        expect(loginActionMock).toHaveBeenCalledTimes(1);
    });
});

describe("expired login notice", () => {
    it("Should show the exact notice when the session expired", () => {
        renderWithIntl(<LoginForm sessionExpired />);
        expect(screen.getByRole("status").textContent).toBe(
            "Your session expired. Please log back in.",
        );
    });
    it("Should omit the notice when login has no expiry reason", () => {
        renderWithIntl(<LoginForm />);
        expect(
            screen.queryByText("Your session expired. Please log back in."),
        ).toBeNull();
    });
});

describe("LoginForm in Spanish", () => {
    it("Should render its labels, toggle, button and expiry notice in Spanish", () => {
        renderWithIntl(<LoginForm sessionExpired />, { locale: "es" });
        expect(
            screen.getByRole("form", { name: "Iniciar sesión" }),
        ).toBeDefined();
        expect(screen.getByLabelText("Correo")).toBeDefined();
        expect(screen.getByLabelText("Contraseña")).toBeDefined();
        expect(
            screen.getByRole("button", { name: "Mostrar contraseña" }),
        ).toBeDefined();
        expect(
            screen.getByRole("button", { name: "Iniciar sesión" }),
        ).toBeDefined();
        expect(screen.getByRole("status").textContent).toBe(
            "Tu sesión expiró. Vuelve a iniciar sesión.",
        );
    });

    it("Should show the Spanish fallback when the action throws", async () => {
        loginActionMock.mockRejectedValue(new Error("network"));
        renderWithIntl(<LoginForm />, { locale: "es" });
        fireEvent.change(screen.getByLabelText("Correo"), {
            target: { value: "user@example.com" },
        });
        fireEvent.change(screen.getByLabelText("Contraseña"), {
            target: { value: "hunter2" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
        expect(
            await screen.findByText("Algo salió mal. Inténtalo de nuevo."),
        ).toBeDefined();
    });
});
