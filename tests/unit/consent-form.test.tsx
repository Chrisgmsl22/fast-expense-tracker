import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/tests/support/intl";

const { consentActionMock, assignMock } = vi.hoisted(() => ({
    consentActionMock: vi.fn(),
    assignMock: vi.fn(),
}));
vi.mock("@/app/_actions/auth/consent", () => ({
    consentAction: (...args: unknown[]) => consentActionMock(...args),
}));

import { ConsentForm } from "@/components/auth/ConsentForm";

const oauthQuery = "client_id=invented&sig=abc";

function renderForm(locale: "en" | "es" = "en") {
    renderWithIntl(
        <ConsentForm
            clientName="Invented iOS"
            scopes={["openid", "offline_access", "fet:api", "fet:admin"]}
            oauthQuery={oauthQuery}
        />,
        { locale },
    );
}

beforeEach(() => {
    consentActionMock.mockReset();
    assignMock.mockReset();
    vi.stubGlobal("location", { ...window.location, assign: assignMock });
});
afterEach(() => vi.unstubAllGlobals());

describe("ConsentForm", () => {
    it("guard: shows the client and one line per listed scope", () => {
        renderForm();
        expect(
            screen.getByText("Invented iOS wants to access your account."),
        ).toBeDefined();
        expect(
            screen.getAllByRole("listitem").map((item) => item.textContent),
        ).toEqual([
            "Confirm who you are",
            "Stay signed in until you sign out in the app",
            "Read and change your expenses, income, cards and budgets",
            "Read and close settlements with your partner",
            "Read and change your settings",
        ]);
    });

    it.each([
        ["Allow", true],
        ["Deny", false],
    ])(
        "guard: %s sends the answer and opens the returned URL",
        async (label, accept) => {
            consentActionMock.mockResolvedValue({
                ok: true,
                data: "fet-test://oauth/cb?code=x",
            });
            renderForm();

            fireEvent.click(screen.getByRole("button", { name: label }));

            await waitFor(() =>
                expect(assignMock).toHaveBeenCalledExactlyOnceWith(
                    "fet-test://oauth/cb?code=x",
                ),
            );
            expect(consentActionMock).toHaveBeenCalledWith({
                accept,
                oauthQuery,
            });
        },
    );

    it("guard: shows the action error and stays on the page", async () => {
        consentActionMock.mockResolvedValue({
            ok: false,
            code: "expired",
            message: "This sign-in request expired. Start again from the app.",
        });
        renderForm();

        fireEvent.click(screen.getByRole("button", { name: "Allow" }));

        expect((await screen.findByRole("alert")).textContent).toBe(
            "This sign-in request expired. Start again from the app.",
        );
        expect(assignMock).not.toHaveBeenCalled();
    });

    it("disables both buttons while the answer is pending", async () => {
        let release!: (value: { ok: true; data: string }) => void;
        consentActionMock.mockReturnValue(
            new Promise((resolve) => {
                release = resolve;
            }),
        );
        renderForm();

        fireEvent.click(screen.getByRole("button", { name: "Allow" }));

        const pending = await screen.findByRole("button", { name: "Saving…" });
        expect((pending as HTMLButtonElement).disabled).toBe(true);
        expect(
            (screen.getByRole("button", { name: "Deny" }) as HTMLButtonElement)
                .disabled,
        ).toBe(true);
        await act(async () => release({ ok: true, data: "fet-test://x/cb" }));
        expect(assignMock).toHaveBeenCalledWith("fet-test://x/cb");
    });

    it("renders in Spanish", () => {
        renderForm("es");
        expect(
            screen.getByText("Invented iOS quiere acceder a tu cuenta."),
        ).toBeDefined();
        expect(screen.getByRole("button", { name: "Permitir" })).toBeDefined();
        expect(screen.getByRole("button", { name: "Rechazar" })).toBeDefined();
        expect(
            screen.getAllByRole("listitem").map((item) => item.textContent),
        ).toEqual([
            "Confirmar quién eres",
            "Mantener tu sesión abierta hasta que la cierres en la app",
            "Ver y cambiar tus gastos, ingresos, tarjetas y presupuestos",
            "Ver y cerrar liquidaciones con tu pareja",
            "Ver y cambiar tu configuración",
        ]);
    });
});
