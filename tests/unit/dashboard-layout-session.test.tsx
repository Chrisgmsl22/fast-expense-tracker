import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { context, settings, settlement, summary, onboarding } = vi.hoisted(
    () => ({
        context: vi.fn(),
        settings: vi.fn(),
        settlement: vi.fn(),
        summary: vi.fn(),
        onboarding: vi.fn(),
    }),
);
vi.mock("@/lib/auth/session", () => ({ getSessionContext: context }));
vi.mock("@/lib/repositories", () => ({
    settingsRepository: { getSettings: settings },
    budgetRuleRepository: {},
    cardRepository: {},
    categoryRepository: {},
    incomeRepository: {},
    userRepository: {},
}));
vi.mock("@/lib/services/settlement/settlement.service", () => ({
    getSettlement: settlement,
}));
vi.mock("@/lib/services/dashboard/dashboard.service", () => ({
    getDashboardSummary: summary,
}));
vi.mock("@/lib/onboarding/load-onboarding", () => ({
    loadOnboarding: onboarding,
}));
vi.mock("@/components/nav/sidebar-model", () => ({
    buildSidebarModel: () => ({ period: { dayKey: "2026-10-24" } }),
}));
vi.mock("@/components/auth/IdleSessionGuard", () => ({
    IdleSessionGuard: vi.fn(({ children }: { children: ReactNode }) => (
        <>{children}</>
    )),
}));
vi.mock("@/components/nav/AppNav", () => ({ AppNav: vi.fn(() => null) }));
vi.mock("@/components/nav/SidebarDateGuard", () => ({
    SidebarDateGuard: () => null,
}));
vi.mock("@/components/onboarding/OnboardingWizard", () => ({
    OnboardingWizard: () => null,
}));

import DashboardLayout from "@/app/(dashboard)/layout";
import { IdleSessionGuard } from "@/components/auth/IdleSessionGuard";
import { AppNav } from "@/components/nav/AppNav";

beforeEach(() => {
    vi.clearAllMocks();
    context.mockResolvedValue({
        userId: "session-user",
        name: "Invented Name",
        email: "test@example.com",
        idleExpiresAt: 1792854000000,
        idleSessionId: "idle-a",
    });
    settings.mockResolvedValue({ sharesExpenses: false, partnerName: null });
    settlement.mockResolvedValue({ balance: {} });
    summary.mockResolvedValue({});
    onboarding.mockResolvedValue(null);
});

describe("DashboardLayout session", () => {
    it("Should read the context once and retain the display and idle fields", async () => {
        render(await DashboardLayout({ children: null }));

        expect(context).toHaveBeenCalledTimes(1);
        expect(vi.mocked(IdleSessionGuard).mock.calls[0]?.[0]).toMatchObject({
            idleExpiresAt: 1792854000000,
            idleSessionId: "idle-a",
        });
        expect(vi.mocked(AppNav).mock.calls[0]?.[0]).toMatchObject({
            name: "Invented Name",
            email: "test@example.com",
        });
        expect(settings).toHaveBeenCalledWith("session-user");
        expect(settlement).toHaveBeenCalledWith("session-user");
        expect(summary).toHaveBeenCalledWith(
            "session-user",
            expect.any(String),
            expect.any(Object),
        );
        expect(onboarding).toHaveBeenCalledWith(
            "session-user",
            expect.any(String),
            expect.any(Object),
        );
    });

    it("Should render nothing and skip data reads without a session", async () => {
        context.mockResolvedValue(null);

        expect(await DashboardLayout({ children: null })).toBeNull();
        expect(settings).not.toHaveBeenCalled();
        expect(settlement).not.toHaveBeenCalled();
        expect(summary).not.toHaveBeenCalled();
        expect(onboarding).not.toHaveBeenCalled();
    });

    it("Should preserve absent display and idle values", async () => {
        context.mockResolvedValue({
            userId: "session-user",
            name: null,
            email: null,
        });

        render(await DashboardLayout({ children: null }));

        expect(vi.mocked(AppNav).mock.calls[0]?.[0]).toMatchObject({
            name: undefined,
            email: undefined,
        });
        expect(vi.mocked(IdleSessionGuard).mock.calls[0]?.[0]).toMatchObject({
            idleExpiresAt: undefined,
            idleSessionId: undefined,
        });
    });
});
