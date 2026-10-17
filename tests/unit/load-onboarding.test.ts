// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_BUDGET_RULE } from "@/lib/domain/budget-rule";
import {
    loadOnboarding,
    type OnboardingSources,
} from "@/lib/onboarding/load-onboarding";
import type { CardSettingsItem } from "@/lib/repositories/card.repository";
import { FakeBudgetRuleRepository } from "@/tests/support/fake-budget-rule-repository";
import { FakeIncomeRepository } from "@/tests/support/fake-income-repository";
import { FakeSettingsRepository } from "@/tests/support/fake-settings-repository";
import { FakeUserRepository } from "@/tests/support/fake-user-repository";

const MONTH = "2026-10";
const INVENTED_NAME = "Rosa Inventada";

function card(over: Partial<CardSettingsItem>): CardSettingsItem {
    return {
        id: over.id ?? "c1",
        name: over.name ?? "Invented Card",
        color: over.color ?? "#2563eb",
        type: over.type ?? "credit",
        archivedAt: over.archivedAt ?? null,
        inUse: over.inUse ?? false,
    };
}

let users: FakeUserRepository;
let settings: FakeSettingsRepository;
let income: FakeIncomeRepository;
let budgetRules: FakeBudgetRuleRepository;
let cardRows: CardSettingsItem[];
let sources: OnboardingSources;
let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    users = new FakeUserRepository();
    settings = new FakeSettingsRepository();
    income = new FakeIncomeRepository();
    budgetRules = new FakeBudgetRuleRepository();
    cardRows = [];
    sources = {
        users,
        settings,
        income,
        budgetRules,
        cards: { listForSettings: vi.fn(async () => cardRows) },
        categories: {
            listForPicker: vi.fn(async () => [
                {
                    id: "k1",
                    slug: "housing",
                    name: "Housing",
                    color: "#4f46e5",
                },
                { id: "k2", slug: "health", name: "Health", color: "#0891b2" },
            ]),
        },
    };
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("loadOnboarding", () => {
    it("Should return the wizard data when onboardedAt is null", async () => {
        users.seed("u1", { name: INVENTED_NAME, onboardedAt: null });
        settings.seed("u1", {
            sharesExpenses: true,
            partnerName: "Invented Partner",
            defaultSharePercentage: 0.55,
        });
        income.seedFixed("u1", 32000);
        budgetRules.seed("u1", "2026-09", {
            essentials: 60,
            discretionary: 20,
            savings: 20,
        });
        cardRows = [
            card({ id: "a", name: "Blue Card", color: "#2563eb" }),
            card({ id: "b", name: "Old Card", archivedAt: new Date() }),
            card({ id: "c", name: "Cash", type: "cash", color: "#16a34a" }),
        ];

        const data = await loadOnboarding("u1", MONTH, sources);

        expect(data).toEqual({
            name: INVENTED_NAME,
            sharing: {
                sharesExpenses: true,
                partnerName: "Invented Partner",
                sharePercent: 55,
            },
            fixedIncome: 32000,
            budgetRule: { essentials: 60, discretionary: 20, savings: 20 },
            cards: [{ name: "Blue Card", color: "#2563eb" }],
            categories: [
                { id: "k1", name: "Housing", color: "#4f46e5" },
                { id: "k2", name: "Health", color: "#0891b2" },
            ],
        });
    });

    it("Should give a fresh account the starter defaults", async () => {
        users.seed("u1", { onboardedAt: null });
        settings.seed("u1", {
            sharesExpenses: false,
            partnerName: null,
            defaultSharePercentage: 0.5,
        });

        const data = await loadOnboarding("u1", MONTH, sources);

        expect(data).toMatchObject({
            sharing: {
                sharesExpenses: false,
                partnerName: "",
                sharePercent: 50,
            },
            fixedIncome: 0,
            budgetRule: DEFAULT_BUDGET_RULE,
            cards: [],
        });
    });

    it("Should return null and read nothing else once onboardedAt is set", async () => {
        users.seed("u1", { onboardedAt: new Date("2026-10-01T00:00:00Z") });

        const data = await loadOnboarding("u1", MONTH, sources);

        expect(data).toBeNull();
        expect(sources.categories.listForPicker).not.toHaveBeenCalled();
    });

    it("Should return null when the user row is missing", async () => {
        expect(await loadOnboarding("u1", MONTH, sources)).toBeNull();
    });

    it("Should return null and log without PII when the onboarding read fails", async () => {
        users.seed("u1", { name: INVENTED_NAME });
        users.failOnRead = true;

        const data = await loadOnboarding("u1", MONTH, sources);

        expect(data).toBeNull();
        expect(errors).toHaveBeenCalledTimes(1);
        const logged = JSON.stringify(errors.mock.calls);
        expect(logged).toContain("loadOnboarding");
        expect(logged).not.toContain(INVENTED_NAME);
    });

    it("Should return null when a prefill read fails", async () => {
        users.seed("u1", { onboardedAt: null });
        sources.categories.listForPicker = vi.fn(async () => {
            throw new Error("fake: categories failed");
        });

        expect(await loadOnboarding("u1", MONTH, sources)).toBeNull();
        expect(errors).toHaveBeenCalledTimes(1);
    });
});
