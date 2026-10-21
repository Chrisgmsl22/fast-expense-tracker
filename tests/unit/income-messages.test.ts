// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { addVariableIncome } from "@/app/_actions/income/add-variable";
import { deleteVariableIncome } from "@/app/_actions/income/delete-variable";
import { setFixedIncome } from "@/app/_actions/income/set-fixed";
import { FakeIncomeRepository } from "@/tests/support/fake-income-repository";
import { setServerLocale } from "@/tests/support/intl-server";

describe("income action messages in Spanish", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
        setServerLocale("es");
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-09-20T18:00:00Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("Should translate the validation message and the schema field errors", async () => {
        const res = await addVariableIncome(
            { source: "", amount: 0, date: "2026-09-10" },
            new FakeIncomeRepository(),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.message).toBe("Ingreso no válido");
        expect(res.fieldErrors?.source).toEqual(["El origen es obligatorio"]);
        expect(res.fieldErrors?.amount).toEqual([
            "El monto debe ser mayor que 0",
        ]);
    });

    it("Should translate a future capture date", async () => {
        const res = await addVariableIncome(
            { source: "Freelance", amount: 100, date: "2026-12-01" },
            new FakeIncomeRepository(),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.fieldErrors?.date).toEqual([
            "La fecha no puede ser posterior a hoy",
        ]);
    });

    it("Should translate a malformed month, and a negative amount", async () => {
        const month = await setFixedIncome(
            { amount: 100, month: "2026-13" },
            new FakeIncomeRepository(),
        );
        expect(month.ok).toBe(false);
        if (month.ok) return;
        expect(month.message).toBe("Mes no válido");
        expect(month.fieldErrors?.month).toEqual([
            "El mes debe tener el formato AAAA-MM",
        ]);

        const amount = await setFixedIncome(
            { amount: -1 },
            new FakeIncomeRepository(),
        );
        expect(amount.ok).toBe(false);
        if (amount.ok) return;
        expect(amount.message).toBe("Monto no válido");
        expect(amount.fieldErrors?.amount).toEqual([
            "El monto no puede ser negativo",
        ]);
    });

    it("Should translate the future-month refusal and keep its code", async () => {
        const res = await setFixedIncome(
            { amount: 100, month: "2026-10" },
            new FakeIncomeRepository(),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.message).toBe(
            "El ingreso fijo no se puede definir para un mes futuro",
        );
        expect(res.fieldErrors?.month).toEqual([
            "El mes no puede ser posterior al mes actual",
        ]);
    });

    it("Should translate a missing row on delete", async () => {
        const res = await deleteVariableIncome(
            { id: "nope" },
            new FakeIncomeRepository(),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
        expect(res.message).toBe("No se encontró el ingreso.");
    });
});
