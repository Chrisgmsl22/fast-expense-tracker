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

import SettlementPage from "@/app/(dashboard)/settlement/page";

const settlementStub = {
    balance: { balance: 0, amount: 0, direction: "settled", breakdown: [] },
    carriedOver: 0,
    journal: [],
};

beforeEach(() => {
    authMock.mockReset();
    getSettingsMock.mockReset();
    getSettlementMock.mockReset();
    redirectMock.mockClear();

    authMock.mockResolvedValue({ user: { id: "u1" } });
    getSettlementMock.mockResolvedValue(settlementStub);
});

describe("SettlementPage route guard (CHORE-6.b)", () => {
    it("redirects a Solo user to the dashboard", async () => {
        getSettingsMock.mockResolvedValue({
            sharesExpenses: false,
            partnerName: null,
            defaultSharePercentage: 0.68,
        });

        await expect(SettlementPage()).rejects.toThrow("REDIRECT:/dashboard");
        expect(redirectMock).toHaveBeenCalledWith("/dashboard");
    });

    it("lets a Shared user through (no redirect)", async () => {
        getSettingsMock.mockResolvedValue({
            sharesExpenses: true,
            partnerName: "Brenda",
            defaultSharePercentage: 0.68,
        });

        await expect(SettlementPage()).resolves.toBeDefined();
        expect(redirectMock).not.toHaveBeenCalled();
    });
});
