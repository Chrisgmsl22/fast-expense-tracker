// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionUserIdMock } = vi.hoisted(() => ({
    getSessionUserIdMock: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
    getSessionUserId: getSessionUserIdMock,
}));

import { addPartnerPayment } from "@/app/_actions/expense/add-partner-payment";
import { createExpense } from "@/app/_actions/expense/create";
import { deleteExpense } from "@/app/_actions/expense/delete";
import { frozenRefusalKey } from "@/app/_actions/expense/field-messages";
import { getExpenseForEdit } from "@/app/_actions/expense/get-for-edit";
import { updateExpense } from "@/app/_actions/expense/update";
import { updatePartnerPayment } from "@/app/_actions/expense/update-partner-payment";
import type { CategoryRepository } from "@/lib/repositories/category.repository";
import { FakeCardRepository } from "@/tests/support/fake-card-repository";
import { FakeExpenseRepository } from "@/tests/support/fake-expense-repository";
import { FakeSettingsRepository } from "@/tests/support/fake-settings-repository";
import { setServerLocale } from "@/tests/support/intl-server";

const CLOSED_AT = new Date("2026-09-12T18:00:00Z");

/** A category repo with no default to file a payment under. */
const noDefaultsCategoryRepo: CategoryRepository = {
    getBySlug: async () => null,
    listForPicker: async () => [],
    listSubcategoriesForPicker: async () => [],
    getSubcategorySpends: async () => [],
    getExpensesForCategoryMonth: async () => [],
    getPartnerPaymentDefaults: async () => null,
};

const cycleFacts = (isPartnerPayment: boolean, closed: boolean) => ({
    amount: 1000,
    actualExpenditure: isPartnerPayment ? 1000 : 680,
    isPartnerPayment,
    cycleClosedAt: closed ? CLOSED_AT : null,
});

describe("frozenRefusalKey", () => {
    it("Should return null when the cycle is open", () => {
        expect(frozenRefusalKey(cycleFacts(false, false), "edit")).toBeNull();
    });

    it.each([
        [true, "edit", "paymentEdit"],
        [true, "delete", "paymentDelete"],
        [false, "edit", "expenseEdit"],
        [false, "delete", "expenseDelete"],
    ] as const)(
        "Should name the refusal for payment=%s, action=%s",
        (isPartnerPayment, action, key) => {
            expect(
                frozenRefusalKey(cycleFacts(isPartnerPayment, true), action),
            ).toBe(key);
        },
    );
});

describe("expense action messages in Spanish", () => {
    beforeEach(() => {
        getSessionUserIdMock.mockReset();
        getSessionUserIdMock.mockResolvedValue("u1");
        setServerLocale("es");
    });

    it.each([
        ["en", "Enter a valid date"],
        ["es", "Ingresa una fecha válida"],
    ] as const)(
        "Should name an empty date in %s, never with zod's own text",
        async (locale, message) => {
            setServerLocale(locale);
            const res = await createExpense(
                {
                    date: "",
                    amount: 100,
                    categoryId: "c1",
                    description: "Tacos",
                },
                new FakeExpenseRepository(),
            );

            expect(res.ok).toBe(false);
            if (res.ok) return;
            expect(res.fieldErrors?.date).toEqual([message]);
        },
    );

    it("Should translate the validation message and the schema field errors", async () => {
        const repo = new FakeExpenseRepository();

        const res = await createExpense(
            { date: "2026-05-10", amount: -5, categoryId: "", description: "" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.message).toBe("Gasto no válido");
        expect(res.fieldErrors?.amount).toEqual([
            "El monto debe ser mayor que 0",
        ]);
        expect(res.fieldErrors?.categoryId).toEqual([
            "La categoría es obligatoria",
        ]);
        expect(res.fieldErrors?.description).toEqual([
            "La descripción es obligatoria",
        ]);
    });

    it("Should translate the Health-only reimbursed refusal", async () => {
        const repo = new FakeExpenseRepository();

        const res = await createExpense(
            {
                date: "2026-05-10",
                amount: 100,
                categoryId: "cat1",
                description: "Farmacia",
                fundedFrom: "reimbursed",
            },
            repo,
            new FakeCardRepository(),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.fieldErrors?.fundedFrom?.[0]).toMatch(
            /^Solo los gastos de salud/,
        );
    });

    it("Should translate the unauthenticated message and keep its code", async () => {
        getSessionUserIdMock.mockResolvedValue(null);

        const res = await getExpenseForEdit("e1", new FakeExpenseRepository());

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
        expect(res.message).toBe("No has iniciado sesión");
    });

    it("Should translate a frozen delete refusal", async () => {
        const repo = new FakeExpenseRepository();
        repo.seedExpense("e1", "u1", {
            amount: 1000,
            actualExpenditure: 680,
            isShared: true,
            yourPercentage: 0.68,
            cycleClosedAt: CLOSED_AT,
        });

        const res = await deleteExpense({ id: "e1" }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("cycle_closed");
        expect(res.message).toBe(
            "La parte de tu pareja en este gasto forma parte de una cuenta que ya cerraste, así que no se puede eliminar.",
        );
    });

    it("Should translate the split-into-closed-cycle refusal and its field error", async () => {
        const repo = new FakeExpenseRepository();
        repo.seedExpense("e1", "u1", {
            categoryId: "cat1",
            amount: 800,
            actualExpenditure: 800,
            cycleClosedAt: CLOSED_AT,
        });

        const res = await updateExpense(
            {
                id: "e1",
                date: "2026-09-10",
                amount: 800,
                categoryId: "cat1",
                description: "Soriana",
                isShared: true,
                yourPercentage: 0.68,
            },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("cycle_closed");
        expect(res.message).toMatch(/^Este gasto cae dentro de una cuenta/);
        expect(res.fieldErrors?.isShared).toEqual([
            "La cuenta que cubre esta fecha ya está cerrada",
        ]);
    });

    it("Should translate a missing payment and a missing payment category", async () => {
        const settingsRepo = new FakeSettingsRepository();
        const expenseRepo = new FakeExpenseRepository();

        const missing = await updatePartnerPayment(
            { id: "nope", date: "2026-09-10", amount: 500 },
            { expenseRepo, settingsRepo },
        );
        expect(missing.ok).toBe(false);
        if (missing.ok) return;
        expect(missing.code).toBe("not_found");
        expect(missing.message).toBe("No se encontró el pago.");

        const noCategory = await addPartnerPayment(
            { date: "2026-09-10", amount: 500 },
            {
                expenseRepo,
                settingsRepo,
                categoryRepo: noDefaultsCategoryRepo,
            },
        );
        expect(noCategory.ok).toBe(false);
        if (noCategory.ok) return;
        expect(noCategory.message).toMatch(/Gastos en pareja/);
        expect(noCategory.fieldErrors?.categoryId).toEqual([
            "La categoría es obligatoria",
        ]);
    });
});
