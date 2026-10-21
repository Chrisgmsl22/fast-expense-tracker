import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/repositories", () => ({
    settingsRepository: {
        getSettings: async () => ({
            sharesExpenses: true,
            partnerName: "Brenda",
            defaultSharePercentage: 0.68,
        }),
    },
    cardRepository: { listForSettings: async () => [] },
    budgetRuleRepository: { listRules: async () => [] },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/_actions/settings/save-split-rule", () => ({
    saveSplitRule: vi.fn(),
}));
vi.mock("@/app/_actions/settings/save-budget-rule", () => ({
    saveBudgetRule: vi.fn(),
}));
vi.mock("@/app/_actions/locale/set-locale", () => ({ setLocale: vi.fn() }));

import SettingsPage from "@/app/(dashboard)/settings/page";
import type { Locale } from "@/i18n/config";
import { renderWithIntl, setServerLocale } from "@/tests/support/intl";

async function renderPage(locale: Locale = "en") {
    setServerLocale(locale);
    const page = await SettingsPage();
    if (!page) throw new Error("Expected the page to render");
    return renderWithIntl(page, { locale });
}

beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "u1" } });
});

describe("SettingsPage", () => {
    it("Should render nothing without a session", async () => {
        authMock.mockResolvedValue(null);
        expect(await SettingsPage()).toBeNull();
    });

    it("Should render the page and its sections in English", async () => {
        await renderPage();

        expect(screen.getByRole("heading", { name: "Settings" })).toBeDefined();
        const soon = screen.getByRole("region", { name: "Coming soon" });
        expect(within(soon).getByText("More settings")).toBeDefined();
        expect(within(soon).getAllByRole("listitem")[0]?.textContent).toBe(
            "Category limits · coming soon",
        );
    });

    it("Should render the page and its sections in Spanish", async () => {
        await renderPage("es");

        expect(
            screen.getByRole("heading", { level: 1, name: "Configuración" }),
        ).toBeDefined();
        expect(
            screen.getByRole("form", { name: "Regla para dividir gastos" }),
        ).toBeDefined();
        expect(
            screen.getByRole("form", { name: "Regla de presupuesto" }),
        ).toBeDefined();
        expect(screen.getByRole("region", { name: "Tarjetas" })).toBeDefined();
        expect(screen.getByRole("heading", { name: "Idioma" })).toBeDefined();
        const soon = screen.getByRole("region", { name: "Próximamente" });
        expect(within(soon).getByText("Más opciones")).toBeDefined();
        expect(
            within(soon)
                .getAllByRole("listitem")
                .map((item) => item.textContent),
        ).toEqual([
            "Límites por categoría · próximamente",
            "Preferencias · próximamente",
            "Privacidad · próximamente",
            "Exportar datos · próximamente",
            "Cuenta · próximamente",
        ]);
    });
});
