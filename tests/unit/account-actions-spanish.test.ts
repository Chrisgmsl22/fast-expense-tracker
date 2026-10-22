// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, updateSessionMock, rootUsers } = vi.hoisted(() => ({
    authMock: vi.fn(),
    updateSessionMock: vi.fn(),
    rootUsers: { updateName: vi.fn(), markOnboarded: vi.fn() },
}));
vi.mock("@/auth", () => ({
    auth: authMock,
    unstable_update: updateSessionMock,
}));
vi.mock("@/lib/repositories", () => ({ userRepository: rootUsers }));

import { completeOnboarding } from "@/app/_actions/account/complete-onboarding";
import { updateDisplayName } from "@/app/_actions/account/update-display-name";
import { setServerLocale } from "@/tests/support/intl";

beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "u1" } });
    updateSessionMock.mockReset();
    rootUsers.updateName.mockReset();
    rootUsers.markOnboarded.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    setServerLocale("es");
});

describe("updateDisplayName in Spanish", () => {
    it("Should return the validation summary and the field error in Spanish", async () => {
        expect(await updateDisplayName({ name: "   " })).toEqual({
            ok: false,
            code: "validation",
            message: "Revisa el campo marcado.",
            fieldErrors: { name: ["El nombre es obligatorio"] },
        });
    });

    it("Should name the length limit in Spanish", async () => {
        const result = await updateDisplayName({ name: "x".repeat(51) });

        expect(result).toMatchObject({
            fieldErrors: {
                name: ["El nombre debe tener 50 caracteres o menos"],
            },
        });
    });

    it("Should return the sign-in message in Spanish without a session", async () => {
        authMock.mockResolvedValue(null);

        expect(await updateDisplayName({ name: "Lupe" })).toEqual({
            ok: false,
            code: "unauthenticated",
            message: "No has iniciado sesión",
        });
    });

    it("Should return the save failure in Spanish", async () => {
        rootUsers.updateName.mockRejectedValue(new Error("down"));

        expect(await updateDisplayName({ name: "Lupe" })).toEqual({
            ok: false,
            code: "db_error",
            message: "No se pudo guardar tu nombre. Inténtalo de nuevo.",
        });
    });

    it("Should keep the English text when the locale is English", async () => {
        setServerLocale("en");

        expect(await updateDisplayName({ name: "" })).toMatchObject({
            message: "Check the highlighted field.",
            fieldErrors: { name: ["Name is required"] },
        });
    });
});

describe("completeOnboarding in Spanish", () => {
    it("Should return the finish failure in Spanish", async () => {
        rootUsers.markOnboarded.mockRejectedValue(new Error("down"));

        expect(await completeOnboarding()).toEqual({
            ok: false,
            code: "db_error",
            message:
                "No se pudo terminar la configuración. Inténtalo de nuevo.",
        });
    });

    it("Should return the sign-in message in Spanish without a session", async () => {
        authMock.mockResolvedValue(null);

        expect(await completeOnboarding()).toEqual({
            ok: false,
            code: "unauthenticated",
            message: "No has iniciado sesión",
        });
    });
});
