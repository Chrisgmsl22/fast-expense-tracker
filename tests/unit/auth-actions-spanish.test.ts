// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInMock, AuthErrorMock, rootGate, rootAccounts } = vi.hoisted(() => {
    class AuthErrorMock extends Error {
        type: string;
        constructor(type: string) {
            super(type);
            this.type = type;
        }
    }
    return {
        signInMock: vi.fn(),
        AuthErrorMock,
        rootGate: { read: vi.fn() },
        rootAccounts: {
            countUsers: vi.fn(),
            createUserWithStarterKit: vi.fn(),
        },
    };
});
vi.mock("@/auth", () => ({ signIn: signInMock }));
vi.mock("next-auth", () => ({ AuthError: AuthErrorMock }));
vi.mock("@/lib/repositories", () => ({
    signupGate: rootGate,
    userProvisioningRepository: rootAccounts,
}));

import { loginAction } from "@/app/_actions/auth/login";
import { signupAction } from "@/app/_actions/auth/signup";
import { setServerLocale } from "@/tests/support/intl";

const PASSWORD = "Invented-pass-123";

beforeEach(() => {
    signInMock.mockReset();
    rootGate.read.mockReset();
    rootGate.read.mockResolvedValue({ open: true, maxUsers: 10 });
    rootAccounts.countUsers.mockReset();
    rootAccounts.countUsers.mockResolvedValue(0);
    setServerLocale("es");
});

describe("loginAction in Spanish", () => {
    it("Should return the validation summary and field errors in Spanish", async () => {
        expect(await loginAction({ email: "nope", password: "" })).toEqual({
            ok: false,
            code: "validation",
            message: "Escribe un correo y una contraseña válidos.",
            fieldErrors: {
                email: ["Escribe un correo válido"],
                password: ["La contraseña es obligatoria"],
            },
        });
    });

    it("Should return the invalid-credentials message in Spanish", async () => {
        signInMock.mockRejectedValue(new AuthErrorMock("CredentialsSignin"));

        expect(
            await loginAction({ email: "a@example.com", password: "x" }),
        ).toEqual({
            ok: false,
            code: "invalid_credentials",
            message: "Correo o contraseña incorrectos.",
        });
    });

    it("Should return the generic failure in Spanish for any other auth error", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        signInMock.mockRejectedValue(new AuthErrorMock("CallbackRouteError"));

        expect(
            await loginAction({ email: "a@example.com", password: "x" }),
        ).toMatchObject({
            code: "error",
            message: "Algo salió mal. Inténtalo de nuevo.",
        });
    });
});

describe("signupAction in Spanish", () => {
    it("Should translate the summary and each field error", async () => {
        expect(
            await signupAction({
                name: "",
                email: "ana@example.com",
                password: "abc",
                confirmPassword: "abd",
            }),
        ).toEqual({
            ok: false,
            code: "validation",
            message: "Revisa los campos marcados.",
            fieldErrors: {
                name: ["El nombre es obligatorio"],
                password: ["La contraseña debe tener al menos 8 caracteres"],
                confirmPassword: ["Las contraseñas no coinciden"],
            },
        });
    });

    it("Should return the closed message in Spanish without field errors", async () => {
        rootGate.read.mockResolvedValue({ open: false });

        expect(
            await signupAction({
                name: "Ana",
                email: "ana@example.com",
                password: PASSWORD,
                confirmPassword: PASSWORD,
            }),
        ).toEqual({
            ok: false,
            code: "closed",
            message: "Por ahora no se pueden crear cuentas.",
        });
    });

    it("Should pass a success straight through", async () => {
        rootAccounts.createUserWithStarterKit.mockResolvedValue({
            userId: "u1",
        });
        vi.spyOn(console, "info").mockImplementation(() => {});
        signInMock.mockResolvedValue("http://localhost/dashboard");

        expect(
            await signupAction({
                name: "Ana",
                email: "ana@example.com",
                password: PASSWORD,
                confirmPassword: PASSWORD,
            }),
        ).toEqual({ ok: true, data: undefined });
    });
});
