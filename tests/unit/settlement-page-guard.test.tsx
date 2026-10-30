import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl, setServerLocale } from "@/tests/support/intl";

const {
    getSessionUserIdMock,
    getSettingsMock,
    getSettlementMock,
    redirectMock,
} = vi.hoisted(() => ({
    getSessionUserIdMock: vi.fn(),
    getSettingsMock: vi.fn(),
    getSettlementMock: vi.fn(),
    redirectMock: vi.fn((path: string) => {
        // Mirror Next's redirect(), which throws to halt rendering.
        throw new Error(`REDIRECT:${path}`);
    }),
}));

vi.mock("@/lib/auth/session", () => ({
    getSessionUserId: getSessionUserIdMock,
}));
vi.mock("next/navigation", () => ({
    redirect: redirectMock,
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/settlement",
}));
vi.mock("@/lib/repositories", () => ({
    settingsRepository: { getSettings: getSettingsMock },
    movementRepository: {},
}));
vi.mock("@/lib/services/settlement/settlement.service", () => ({
    getSettlement: getSettlementMock,
}));
vi.mock("@/lib/month-scope.server", () => ({
    getScopedMonth: async () => "2026-07",
}));

import SettlementPage from "@/app/(dashboard)/settlement/page";

/** The cycle fields every settlement now carries (spec 0007 §3.5). */
const cycleStub = {
    openedAt: null,
    closableMarker: null,
    month: { label: "2026-07", isCurrent: true, journal: [] },
    history: [],
};

/** The page now takes `searchParams`; the guard tests never set a month. */
const noParams = { searchParams: Promise.resolve({}) };

const settledStub = {
    balance: { balance: 0, amount: 0, direction: "settled", breakdown: [] },
    carriedOver: { present: false, amount: 0 },
    journal: [],
    ...cycleStub,
};

const unsettledStub = {
    balance: {
        balance: 320,
        amount: 320,
        direction: "she_owes",
        breakdown: [],
    },
    carriedOver: { present: false, amount: 0 },
    journal: [],
    ...cycleStub,
};

beforeEach(() => {
    getSessionUserIdMock.mockReset();
    getSettingsMock.mockReset();
    getSettlementMock.mockReset();
    redirectMock.mockClear();

    getSessionUserIdMock.mockResolvedValue("u1");
    getSettlementMock.mockResolvedValue(settledStub);
});

describe("SettlementPage route guard (CHORE-6.b)", () => {
    it("redirects a Solo user with a settled balance to the dashboard", async () => {
        getSettingsMock.mockResolvedValue({
            sharesExpenses: false,
            partnerName: null,
            defaultSharePercentage: 0.68,
        });

        await expect(SettlementPage(noParams)).rejects.toThrow(
            "REDIRECT:/dashboard",
        );
        expect(redirectMock).toHaveBeenCalledWith("/dashboard");
    });

    it("lets a Solo user with an unsettled balance through (they can wind it down)", async () => {
        getSettingsMock.mockResolvedValue({
            sharesExpenses: false,
            partnerName: "Brenda",
            defaultSharePercentage: 0.68,
        });
        getSettlementMock.mockResolvedValue(unsettledStub);

        await expect(SettlementPage(noParams)).resolves.toBeDefined();
        expect(redirectMock).not.toHaveBeenCalled();
    });

    it("lets a Shared user through (no redirect)", async () => {
        getSettingsMock.mockResolvedValue({
            sharesExpenses: true,
            partnerName: "Brenda",
            defaultSharePercentage: 0.68,
        });

        await expect(SettlementPage(noParams)).resolves.toBeDefined();
        expect(redirectMock).not.toHaveBeenCalled();
    });
});

describe("SettlementPage in Spanish", () => {
    it("titles the page and warns about a past month in Spanish", async () => {
        getSettingsMock.mockResolvedValue({
            sharesExpenses: true,
            partnerName: "Brenda",
            defaultSharePercentage: 0.68,
        });
        getSettlementMock.mockResolvedValue({
            ...unsettledStub,
            breakdownItems: {
                partner_share: [],
                partner_debt: [],
                your_debt: [],
                partner_paid: [],
                you_paid: [],
            },
            month: { label: "2026-07", isCurrent: false, journal: [] },
        });

        setServerLocale("es");
        const page = await SettlementPage(noParams);
        if (!page) throw new Error("expected the page to render");
        renderWithIntl(page, { locale: "es" });

        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Cuentas por pagar",
            }),
        ).toBeDefined();
        expect(screen.getByText("con Brenda")).toBeDefined();
        expect(
            screen.getByText(
                "Estás viendo julio de 2026. Lo que registres queda con fecha de hoy y entra en la cuenta abierta.",
            ),
        ).toBeDefined();
    });
});
