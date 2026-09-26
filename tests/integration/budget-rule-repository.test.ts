import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import {
    DEFAULT_BUDGET_RULE,
    resolveBudgetRule,
} from "@/lib/domain/budget-rule";
import { PrismaBudgetRuleRepository } from "@/lib/repositories/budget-rule.repository";

const repo = new PrismaBudgetRuleRepository(db);

let userSeq = 0;
async function seedUser() {
    userSeq += 1;
    return db.user.create({
        data: {
            email: `budget-rule-${userSeq}@example.com`,
            password: "x",
            name: "Test",
        },
    });
}

// Guards: the table and adapter are new, so every case fails pre-fix.
describe("PrismaBudgetRuleRepository (integration)", () => {
    it("Should return no rules for a user who never saved one", async () => {
        const user = await seedUser();
        const rules = await repo.listRules(user.id);
        expect(rules).toEqual([]);
        expect(resolveBudgetRule(rules, "2026-09")).toEqual(
            DEFAULT_BUDGET_RULE,
        );
    });

    it("Should upsert one row per user per effective month", async () => {
        const user = await seedUser();
        await repo.saveRule(user.id, "2026-09", {
            essentials: 60,
            discretionary: 30,
            savings: 10,
        });
        await repo.saveRule(user.id, "2026-09", {
            essentials: 55,
            discretionary: 25,
            savings: 20,
        });

        expect(await repo.listRules(user.id)).toEqual([
            {
                effectiveMonth: "2026-09",
                essentials: 55,
                discretionary: 25,
                savings: 20,
            },
        ]);
        expect(await db.budgetRule.count({ where: { userId: user.id } })).toBe(
            1,
        );
    });

    it("Should list rules oldest first and keep a past month's split", async () => {
        const user = await seedUser();
        await repo.saveRule(user.id, "2026-10", {
            essentials: 40,
            discretionary: 30,
            savings: 30,
        });
        await repo.saveRule(user.id, "2026-07", {
            essentials: 60,
            discretionary: 20,
            savings: 20,
        });

        const rules = await repo.listRules(user.id);
        expect(rules.map((r) => r.effectiveMonth)).toEqual([
            "2026-07",
            "2026-10",
        ]);
        expect(resolveBudgetRule(rules, "2026-09")).toEqual({
            essentials: 60,
            discretionary: 20,
            savings: 20,
        });
        expect(resolveBudgetRule(rules, "2026-11")).toEqual({
            essentials: 40,
            discretionary: 30,
            savings: 30,
        });
    });

    it("Should scope reads and writes to the user", async () => {
        const a = await seedUser();
        const b = await seedUser();
        await repo.saveRule(a.id, "2026-09", {
            essentials: 70,
            discretionary: 20,
            savings: 10,
        });
        await repo.saveRule(b.id, "2026-09", {
            essentials: 34,
            discretionary: 33,
            savings: 33,
        });

        expect(await repo.listRules(a.id)).toEqual([
            {
                effectiveMonth: "2026-09",
                essentials: 70,
                discretionary: 20,
                savings: 10,
            },
        ]);
        expect(await repo.listRules(b.id)).toEqual([
            {
                effectiveMonth: "2026-09",
                essentials: 34,
                discretionary: 33,
                savings: 33,
            },
        ]);
    });

    it("Should refuse a rule for a user that does not exist", async () => {
        await expect(
            repo.saveRule("no-such-user", "2026-09", DEFAULT_BUDGET_RULE),
        ).rejects.toThrow();
    });
});
