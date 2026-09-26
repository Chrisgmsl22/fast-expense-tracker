import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { saveBudgetRule } from "@/app/_actions/settings/save-budget-rule";
import { resolveBudgetRule } from "@/lib/domain/budget-rule";
import { FakeBudgetRuleRepository } from "@/tests/support/fake-budget-rule-repository";

const valid = { essentials: 60, discretionary: 30, savings: 10 };

// Guards: the action is new, so every case fails pre-fix (no module).
describe("saveBudgetRule (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "user-a" } });
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-09-20T18:00:00Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("Should upsert the rule for the current month, scoped to the session user", async () => {
        const repo = new FakeBudgetRuleRepository();
        const res = await saveBudgetRule(valid, repo);

        expect(res).toEqual({
            ok: true,
            data: { effectiveMonth: "2026-09", rule: valid },
        });
        expect(repo.saves).toEqual([
            { userId: "user-a", effectiveMonth: "2026-09", rule: valid },
        ]);
    });

    it("Should use the Mexico City month, not the UTC one, at the boundary", async () => {
        // 03:00Z on Oct 1 is still Sep 30 in CDMX (UTC-6).
        vi.setSystemTime(new Date("2026-10-01T03:00:00Z"));
        const repo = new FakeBudgetRuleRepository();
        await saveBudgetRule(valid, repo);

        expect(repo.saves[0]?.effectiveMonth).toBe("2026-09");
    });

    it("Should replace this month's rule on a second save, not add one", async () => {
        const repo = new FakeBudgetRuleRepository();
        await saveBudgetRule(valid, repo);
        await saveBudgetRule(
            { essentials: 50, discretionary: 20, savings: 30 },
            repo,
        );

        const rules = await repo.listRules("user-a");
        expect(rules).toEqual([
            {
                effectiveMonth: "2026-09",
                essentials: 50,
                discretionary: 20,
                savings: 30,
            },
        ]);
    });

    it("Should leave a past month's split alone", async () => {
        const repo = new FakeBudgetRuleRepository();
        repo.seed("user-a", "2026-06", {
            essentials: 70,
            discretionary: 20,
            savings: 10,
        });
        await saveBudgetRule(valid, repo);

        const rules = await repo.listRules("user-a");
        expect(resolveBudgetRule(rules, "2026-08")).toEqual({
            essentials: 70,
            discretionary: 20,
            savings: 10,
        });
        expect(resolveBudgetRule(rules, "2026-09")).toEqual(valid);
    });

    it("Should ignore a client-supplied userId or month", async () => {
        const repo = new FakeBudgetRuleRepository();
        await saveBudgetRule(
            { ...valid, userId: "user-b", effectiveMonth: "2020-01" },
            repo,
        );

        expect(repo.saves).toEqual([
            { userId: "user-a", effectiveMonth: "2026-09", rule: valid },
        ]);
    });

    it("Should keep user A's rule out of user B's reach", async () => {
        const repo = new FakeBudgetRuleRepository();
        await saveBudgetRule(valid, repo);

        authMock.mockResolvedValue({ user: { id: "user-b" } });
        await saveBudgetRule(
            { essentials: 34, discretionary: 33, savings: 33 },
            repo,
        );

        expect(
            resolveBudgetRule(await repo.listRules("user-a"), "2026-09"),
        ).toEqual(valid);
        expect(
            resolveBudgetRule(await repo.listRules("user-b"), "2026-09"),
        ).toEqual({ essentials: 34, discretionary: 33, savings: 33 });
    });

    it.each([
        ["99", { essentials: 50, discretionary: 25, savings: 24 }],
        ["101", { essentials: 50, discretionary: 25, savings: 26 }],
    ])(
        "Should refuse a total of %s with the sum message and no write",
        async (_, input) => {
            const repo = new FakeBudgetRuleRepository();
            const res = await saveBudgetRule(input, repo);

            expect(res).toEqual({
                ok: false,
                code: "validation",
                message: "The three buckets must add up to 100%",
                fieldErrors: {},
            });
            expect(repo.saves).toHaveLength(0);
        },
    );

    it("Should refuse a non-integer percentage on its field, never rounding it", async () => {
        const repo = new FakeBudgetRuleRepository();
        const res = await saveBudgetRule(
            { essentials: 50.5, discretionary: 24.5, savings: 25 },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.essentials).toEqual(["Enter a whole number"]);
        expect(repo.saves).toHaveLength(0);
    });

    it("Should refuse without a session and never write", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeBudgetRuleRepository();
        const res = await saveBudgetRule(valid, repo);

        expect(res).toMatchObject({ ok: false, code: "unauthenticated" });
        expect(repo.saves).toHaveLength(0);
    });

    it("Should map a repository failure to db_error", async () => {
        const repo = new FakeBudgetRuleRepository();
        repo.failOnWrite = true;
        vi.spyOn(console, "error").mockImplementation(() => {});
        const res = await saveBudgetRule(valid, repo);

        expect(res).toMatchObject({ ok: false, code: "db_error" });
    });
});
