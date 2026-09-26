import { beforeEach, describe, expect, it, vi } from "vitest";

// Both actions call `auth()`; mock it so these stay pure unit tests. Every
// repository is injected, so no database is in play.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { addPartnerPayment } from "@/app/_actions/expense/add-partner-payment";
import { updatePartnerPayment } from "@/app/_actions/expense/update-partner-payment";
import type { CategoryRepository } from "@/lib/repositories/category.repository";
import { FakeExpenseRepository } from "@/tests/support/fake-expense-repository";
import { FakeSettingsRepository } from "@/tests/support/fake-settings-repository";

/** A category repo that answers only the one lookup these actions make. */
function categoryRepo(
    defaults: { categoryId: string; subcategoryId: string | null } | null = {
        categoryId: "combined",
        subcategoryId: "covered",
    },
): CategoryRepository {
    return {
        getBySlug: async () => null,
        getSubcategorySpends: async () => [],
        getExpensesForCategoryMonth: async () => [],
        getPartnerPaymentDefaults: async () => defaults,
    };
}

function deps(over: Partial<Parameters<typeof addPartnerPayment>[1]> = {}) {
    const expenseRepo = over.expenseRepo ?? new FakeExpenseRepository();
    const settingsRepo = over.settingsRepo ?? new FakeSettingsRepository();
    if (settingsRepo instanceof FakeSettingsRepository) {
        settingsRepo.seed("u1", {
            sharesExpenses: true,
            partnerName: "Brenda",
        });
    }
    return {
        expenseRepo,
        settingsRepo,
        categoryRepo: over.categoryRepo ?? categoryRepo(),
    };
}

const input = (over: Record<string, unknown> = {}) => ({
    date: "2026-09-10",
    amount: 680,
    ...over,
});

describe("addPartnerPayment (unit, injected fakes)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("stores the payment as an expense carrying the payment marker", async () => {
        const repo = new FakeExpenseRepository();
        repo.setSubcategory("covered", "combined");
        const res = await addPartnerPayment(
            input(),
            deps({ expenseRepo: repo }),
        );

        expect(res.ok).toBe(true);
        expect(repo.inserts).toHaveLength(1);
        const row = repo.inserts[0]!;
        // The marker is its own column, NOT `paidBy`: that column is deprecated, and
        // reusing it would revive what ADR-0020 removed.
        expect(row.isPartnerPayment).toBe(true);
        expect(row.paidBy).toBe("you");
    });

    it("treats the amount as what he sent — no split is applied", async () => {
        const repo = new FakeExpenseRepository();
        repo.setSubcategory("covered", "combined");
        await addPartnerPayment(
            input({ amount: 680 }),
            deps({ expenseRepo: repo }),
        );

        const row = repo.inserts[0]!;
        // A $1,000 dinner is logged as his $680: the figure entered IS the consumption,
        // so there is no 32% to derive.
        expect(row.amount).toBe(680);
        expect(row.actualExpenditure).toBe(680);
        expect(row.isShared).toBe(false);
        expect(row.yourPercentage).toBe(1);
        // A transfer leaves a bank account, so there is no card.
        expect(row.cardId).toBeNull();
    });

    it("defaults to combined-expenses and its partner-payment subcategory", async () => {
        const repo = new FakeExpenseRepository();
        repo.setSubcategory("covered", "combined");
        await addPartnerPayment(input(), deps({ expenseRepo: repo }));

        expect(repo.inserts[0]!.categoryId).toBe("combined");
        expect(repo.inserts[0]!.subcategoryId).toBe("covered");
    });

    it("lets the caller file it under a different category", async () => {
        const repo = new FakeExpenseRepository();
        repo.setSubcategory("s9", "groceries");
        await addPartnerPayment(
            input({ categoryId: "groceries", subcategoryId: "s9" }),
            deps({ expenseRepo: repo }),
        );

        expect(repo.inserts[0]!.categoryId).toBe("groceries");
        expect(repo.inserts[0]!.subcategoryId).toBe("s9");
    });

    it("refuses a subcategory belonging to another category", async () => {
        const repo = new FakeExpenseRepository();
        repo.setSubcategory("s9", "groceries");
        const res = await addPartnerPayment(
            input({ categoryId: "personal", subcategoryId: "s9" }),
            deps({ expenseRepo: repo }),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.subcategoryId).toBeDefined();
        expect(repo.inserts).toHaveLength(0);
    });

    it("does not pair the default subcategory with a caller-chosen category", async () => {
        const repo = new FakeExpenseRepository();
        await addPartnerPayment(
            input({ categoryId: "groceries" }),
            deps({ expenseRepo: repo }),
        );

        // The default subcategory belongs to `combined-expenses`; carrying it
        // over would persist a mismatched category/subcategory pair.
        expect(repo.inserts[0]!.subcategoryId).toBeNull();
    });

    it("labels an untitled payment as money SENT, and keeps a note as the description", async () => {
        const repo = new FakeExpenseRepository();
        repo.setSubcategory("covered", "combined");
        await addPartnerPayment(input(), deps({ expenseRepo: repo }));
        await addPartnerPayment(
            input({ note: "  Sushi  " }),
            deps({ expenseRepo: repo }),
        );

        // This string is the `Expense.description`, rendered on four surfaces. "I owe
        // Brenda" described the debt — the opposite event to the one this row records.
        expect(repo.inserts[0]!.description).toBe("Transfer — you paid Brenda");
        expect(repo.inserts[1]!.description).toBe("Sushi");
    });

    it("refuses when the user has no category to file it under", async () => {
        const repo = new FakeExpenseRepository();
        const res = await addPartnerPayment(
            input(),
            deps({ expenseRepo: repo, categoryRepo: categoryRepo(null) }),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(repo.inserts).toHaveLength(0);
    });

    it("rejects invalid input and an unauthenticated caller", async () => {
        const repo = new FakeExpenseRepository();
        const invalid = await addPartnerPayment(
            input({ amount: -5 }),
            deps({ expenseRepo: repo }),
        );
        expect(invalid.ok).toBe(false);
        if (!invalid.ok) expect(invalid.code).toBe("validation");

        authMock.mockResolvedValue(null);
        const anon = await addPartnerPayment(
            input(),
            deps({ expenseRepo: repo }),
        );
        expect(anon.ok).toBe(false);
        if (!anon.ok) expect(anon.code).toBe("unauthenticated");
        expect(repo.inserts).toHaveLength(0);
    });

    it("reports a db failure instead of failing silently", async () => {
        const repo = new FakeExpenseRepository();
        repo.setSubcategory("covered", "combined");
        repo.failOnWrite = true;
        vi.spyOn(console, "error").mockImplementation(() => {});
        const res = await addPartnerPayment(
            input(),
            deps({ expenseRepo: repo }),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
        expect(res.message).toMatch(/could not save/i);
    });

    // `reimbursed` is Health-only (spec 0007 §3.3) and a payment is never
    // reimbursed. `partnerPaymentInputSchema` already refuses it — this pins
    // that so the guard can't silently regress.
    it("refuses fundedFrom: reimbursed — a payment carries no category to earn it", async () => {
        const repo = new FakeExpenseRepository();
        const res = await addPartnerPayment(
            input({ fundedFrom: "reimbursed" }),
            deps({ expenseRepo: repo }),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.fundedFrom).toBeDefined();
        expect(repo.inserts).toHaveLength(0);
    });
});

describe("updatePartnerPayment (unit, injected fakes)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    function seeded() {
        const repo = new FakeExpenseRepository();
        repo.seedExpense("e1", "u1", {
            isPartnerPayment: true,
            categoryId: "groceries",
            subcategoryId: "s9",
            notes: "split with the cats",
            amount: 500,
            actualExpenditure: 500,
        });
        return repo;
    }

    it("saves the new amount on both money columns", async () => {
        const repo = seeded();
        const res = await updatePartnerPayment(
            { id: "e1", ...input({ amount: 720 }) },
            deps({ expenseRepo: repo }),
        );

        expect(res.ok).toBe(true);
        expect(repo.updates[0]!.data.amount).toBe(720);
        expect(repo.updates[0]!.data.actualExpenditure).toBe(720);
    });

    it("preserves the category, subcategory and notes the form never showed", async () => {
        const repo = seeded();
        await updatePartnerPayment(
            { id: "e1", ...input() },
            deps({ expenseRepo: repo }),
        );

        const data = repo.updates[0]!.data;
        expect(data.categoryId).toBe("groceries");
        expect(data.subcategoryId).toBe("s9");
        expect(data.notes).toBe("split with the cats");
    });

    it("refuses an ordinary expense, so a purchase can't be retyped as a debt", async () => {
        const repo = new FakeExpenseRepository();
        repo.seedExpense("e2", "u1", { isPartnerPayment: false });
        const res = await updatePartnerPayment(
            { id: "e2", ...input() },
            deps({ expenseRepo: repo }),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
        expect(repo.updates).toHaveLength(0);
    });

    it("refuses another user's row (IDOR guard)", async () => {
        const repo = new FakeExpenseRepository();
        repo.seedExpense("e3", "someone-else", { isPartnerPayment: true });
        const res = await updatePartnerPayment(
            { id: "e3", ...input() },
            deps({ expenseRepo: repo }),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
        expect(repo.updates).toHaveLength(0);
    });

    // Same schema-level refusal as `addPartnerPayment` — pinned here too,
    // since this is a second, independent write path.
    it("refuses fundedFrom: reimbursed", async () => {
        const repo = seeded();
        const res = await updatePartnerPayment(
            { id: "e1", ...input({ fundedFrom: "reimbursed" }) },
            deps({ expenseRepo: repo }),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.fundedFrom).toBeDefined();
        expect(repo.updates).toHaveLength(0);
    });
});
