import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { addCard } from "@/app/_actions/card/add";
import { archiveCard } from "@/app/_actions/card/archive";
import { deleteCard } from "@/app/_actions/card/delete";
import { getCardHistory } from "@/app/_actions/card/get-history";
import { restoreCard } from "@/app/_actions/card/restore";
import { updateCard } from "@/app/_actions/card/update";
import { saveBudgetRule } from "@/app/_actions/settings/save-budget-rule";
import { saveSplitRule } from "@/app/_actions/settings/save-split-rule";
import { MAX_ACTIVE_CARDS } from "@/lib/domain/card";
import { FakeBudgetRuleRepository } from "@/tests/support/fake-budget-rule-repository";
import { FakeCardRepository } from "@/tests/support/fake-card-repository";
import { FakeSettingsRepository } from "@/tests/support/fake-settings-repository";
import { setServerLocale } from "@/tests/support/intl";

beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "u1" } });
    setServerLocale("es");
});

describe("settings actions in Spanish", () => {
    it("Should return the split rule's validation summary and field errors in Spanish", async () => {
        const res = await saveSplitRule(
            { sharesExpenses: true, partnerName: "", sharePercentage: 0 },
            new FakeSettingsRepository(),
        );

        expect(res).toEqual({
            ok: false,
            code: "validation",
            message: "Corrige los campos marcados.",
            fieldErrors: {
                partnerName: [
                    "Agrega el nombre de tu pareja para compartir gastos",
                ],
                sharePercentage: ["Debe ser al menos 1%"],
            },
        });
    });

    it("Should return the unauthenticated message in Spanish with the same code", async () => {
        authMock.mockResolvedValue(null);
        const res = await saveSplitRule(
            { sharesExpenses: false },
            new FakeSettingsRepository(),
        );

        expect(res).toEqual({
            ok: false,
            code: "unauthenticated",
            message: "No has iniciado sesión",
        });
    });

    it("Should return the budget rule's sum message in Spanish", async () => {
        const res = await saveBudgetRule(
            { essentials: 50, discretionary: 25, savings: 20 },
            new FakeBudgetRuleRepository(),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.message).toBe("Las tres bolsas deben sumar 100%");
    });

    it("Should fall back to the summary and translate field errors when one percent is out of range", async () => {
        const res = await saveBudgetRule(
            { essentials: 150, discretionary: -50, savings: 0 },
            new FakeBudgetRuleRepository(),
        );

        expect(res).toMatchObject({
            ok: false,
            code: "validation",
            message: "Corrige los campos marcados.",
            fieldErrors: {
                essentials: ["No puede pasar de 100%"],
                discretionary: ["Debe ser al menos 0%"],
            },
        });
    });
});

describe("card actions in Spanish", () => {
    it("Should translate the add form's field errors", async () => {
        const res = await addCard(
            { name: "", type: "credit", color: "nope" },
            new FakeCardRepository(),
        );

        expect(res).toEqual({
            ok: false,
            code: "validation",
            message: "Corrige los campos marcados.",
            fieldErrors: {
                name: ["El nombre de la tarjeta es obligatorio"],
                color: ["Escribe un color #RRGGBB válido"],
            },
        });
    });

    it("Should name the card cap in the Spanish limit message", async () => {
        const repo = new FakeCardRepository();
        for (let i = 0; i < MAX_ACTIVE_CARDS; i++) {
            repo.seed({ userId: "u1", name: `Card ${i}` });
        }

        const res = await addCard(
            { name: "Nueva", type: "credit", color: "#9333ea" },
            repo,
        );

        expect(res).toEqual({
            ok: false,
            code: "limit_reached",
            message: `Puedes tener como máximo ${MAX_ACTIVE_CARDS} tarjetas activas. Archiva una para agregar otra.`,
        });
    });

    it("Should return the duplicate name in Spanish on add and on edit", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "BBVA" });
        repo.seed({ userId: "u1", name: "NU" });
        const duplicate = {
            ok: false,
            code: "duplicate_name",
            message: "Ya tienes una tarjeta activa con ese nombre.",
            fieldErrors: { name: ["Ya existe una tarjeta con ese nombre"] },
        };

        expect(
            await addCard(
                { name: "nu", type: "debit", color: "#9333ea" },
                repo,
            ),
        ).toEqual(duplicate);
        expect(
            await updateCard(
                { id, name: "NU", type: "debit", color: "#9333ea" },
                repo,
            ),
        ).toEqual(duplicate);
    });

    it("Should lock the Cash card with Spanish messages", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "Cash", type: "cash" });

        expect(await archiveCard({ id }, repo)).toMatchObject({
            code: "cash_locked",
            message: "La tarjeta de efectivo no se puede archivar.",
        });
        expect(await deleteCard({ id }, repo)).toMatchObject({
            code: "cash_locked",
            message: "La tarjeta de efectivo no se puede eliminar.",
        });
        expect(
            await updateCard(
                { id, name: "Cash", type: "debit", color: "#16a34a" },
                repo,
            ),
        ).toMatchObject({
            code: "cash_locked",
            message: "La tarjeta de efectivo no se puede editar.",
        });
    });

    it("Should tell the user to archive a used card in Spanish", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({ userId: "u1", name: "Used", references: 1 });

        expect(await deleteCard({ id }, repo)).toEqual({
            ok: false,
            code: "has_references",
            message:
                "Esta tarjeta tiene registros anteriores. Mejor archívala.",
        });
    });

    it("Should quote the conflicting name when a restore is blocked", async () => {
        const repo = new FakeCardRepository();
        const id = repo.seed({
            userId: "u1",
            name: "NU",
            archivedAt: new Date(),
        });
        repo.seed({ userId: "u1", name: "nu" });

        expect(await restoreCard({ id }, repo)).toEqual({
            ok: false,
            code: "name_conflict",
            message:
                'Ya tienes una tarjeta activa llamada "NU". Cámbiale el nombre o archívala primero.',
        });
    });

    it("Should return the history validation and not-found messages in Spanish", async () => {
        const repo = new FakeCardRepository();

        expect(await getCardHistory({ id: "c1", month: "x" }, repo)).toEqual({
            ok: false,
            code: "validation",
            message: "Elige una tarjeta y un mes.",
        });
        expect(
            await getCardHistory({ id: "missing", month: "2026-09" }, repo),
        ).toEqual({
            ok: false,
            code: "not_found",
            message: "Esa tarjeta ya no existe.",
        });
    });
});
