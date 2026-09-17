import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, getSettingsMock, getSettlementMock, redirectMock } =
    vi.hoisted(() => ({
        authMock: vi.fn(),
        getSettingsMock: vi.fn(),
        getSettlementMock: vi.fn(),
        redirectMock: vi.fn((path: string) => {
            // Mirror Next's redirect(), which throws to halt rendering.
            throw new Error(`REDIRECT:${path}`);
        }),
    }));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
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
    closableMovementId: null,
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
    authMock.mockReset();
    getSettingsMock.mockReset();
    getSettlementMock.mockReset();
    redirectMock.mockClear();

    authMock.mockResolvedValue({ user: { id: "u1" } });
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
