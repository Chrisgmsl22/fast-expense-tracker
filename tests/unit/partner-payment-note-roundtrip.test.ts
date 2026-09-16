// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { updatePartnerPayment } from "@/app/_actions/expense/update-partner-payment";
import { partnerPaymentDescription } from "@/lib/domain/expense";
import type { SettlementExpenseRow } from "@/lib/repositories/settlement.repository";
import { getSettlement } from "@/lib/services/settlement/settlement.service";
import { FakeExpenseRepository } from "@/tests/support/fake-expense-repository";
import { FakeSettlementRepository } from "@/tests/support/fake-settlement-repository";
import { FakeSettingsRepository } from "@/tests/support/fake-settings-repository";

/**
 * Editing a payment from the settlement journal must not eat its description. The
 * journal row carried `note: null`, the dialog prefilled empty, and the action rebuilt
 * the description from that — writing the fallback over the user's text.
 */
const NOW = new Date("2026-09-15T12:00:00Z");
const DAY = new Date("2026-09-10T06:00:00Z");
const PARTNER = "Brenda";

function settlementDeps(rows: SettlementExpenseRow[]) {
    const settlementRepo = new FakeSettlementRepository();
    settlementRepo.setExpenses(rows);
    const settingsRepo = new FakeSettingsRepository();
    settingsRepo.seed("u1", { sharesExpenses: true, partnerName: PARTNER });
    return { settlementRepo, settingsRepo, now: NOW };
}

const paymentRow = (description: string): SettlementExpenseRow => ({
    id: "pay1",
    date: DAY,
    description,
    amount: 380,
    actualExpenditure: 380,
    isShared: false,
    isPartnerPayment: true,
    createdAt: DAY,
});

function actionDeps(description: string) {
    const expenseRepo = new FakeExpenseRepository();
    expenseRepo.seedExpense("pay1", "u1", {
        isPartnerPayment: true,
        amount: 380,
        actualExpenditure: 380,
        description,
        date: DAY,
    });
    const settingsRepo = new FakeSettingsRepository();
    settingsRepo.seed("u1", { sharesExpenses: true, partnerName: PARTNER });
    return { expenseRepo, settingsRepo };
}

/** What `TransferForm` sends: an empty field becomes `undefined`. */
const asFormWouldSend = (note: string | null) => note || undefined;

describe("a payment's description survives an edit from the settlement journal", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("carries the real description into the journal row's note", async () => {
        const settlement = await getSettlement(
            "u1",
            settlementDeps([paymentRow("carwash")]),
        );

        const row = settlement.journal.find((j) => j.kind === "transfer");
        expect(row).toBeDefined();
        // The edit dialog prefills from exactly this field. A null here is what
        // made the form render empty over a row that had text.
        if (row?.kind === "transfer") expect(row.note).toBe("carwash");
    });

    it("keeps the description when only the amount is edited", async () => {
        const settlement = await getSettlement(
            "u1",
            settlementDeps([paymentRow("carwash")]),
        );
        const row = settlement.journal.find((j) => j.kind === "transfer");
        const note = row?.kind === "transfer" ? row.note : null;

        const deps = actionDeps("carwash");
        const res = await updatePartnerPayment(
            {
                id: "pay1",
                date: "2026-09-10",
                amount: 400,
                note: asFormWouldSend(note),
            },
            deps,
        );

        expect(res.ok).toBe(true);
        const saved = deps.expenseRepo.updates[0]!.data;
        expect(saved.amount).toBe(400);
        // The whole point: the text he typed is still there afterwards.
        expect(saved.description).toBe("carwash");
    });

    it("reports no note for a payment that never had one", async () => {
        const auto = partnerPaymentDescription(null, PARTNER);
        const settlement = await getSettlement(
            "u1",
            settlementDeps([paymentRow(auto)]),
        );

        const row = settlement.journal.find((j) => j.kind === "transfer");
        // The auto-generated label is NOT a note: prefilling the field with it
        // would make the user delete boilerplate to type their own.
        if (row?.kind === "transfer") expect(row.note).toBeNull();
    });

    it("still reports no note after the partner is renamed", async () => {
        // The row was auto-labelled as "Brenda"; Settings now says "Ana". Comparing
        // against the CURRENT name would make the old label look like the user's text.
        const auto = partnerPaymentDescription(null, "Brenda");
        const deps = settlementDeps([paymentRow(auto)]);
        deps.settingsRepo.seed("u1", {
            sharesExpenses: true,
            partnerName: "Ana",
        });

        const settlement = await getSettlement("u1", deps);

        const row = settlement.journal.find((j) => j.kind === "transfer");
        if (row?.kind === "transfer") expect(row.note).toBeNull();
    });

    it("re-derives the same label when the note field is genuinely empty", async () => {
        const auto = partnerPaymentDescription(null, PARTNER);
        const deps = actionDeps(auto);
        const res = await updatePartnerPayment(
            {
                id: "pay1",
                date: "2026-09-10",
                amount: 400,
                note: asFormWouldSend(null),
            },
            deps,
        );

        expect(res.ok).toBe(true);
        expect(deps.expenseRepo.updates[0]!.data.description).toBe(auto);
    });

    it("names the payment as money SENT, never as a debt owed", async () => {
        // The old fallback said "I owe {partner}" — the opposite event to this row.
        const label = partnerPaymentDescription(null, PARTNER);

        expect(label).not.toMatch(/I owe/i);
        expect(label).toBe(`Transfer — you paid ${PARTNER}`);
    });

    it("gives the breakdown and the journal the same words for one row", async () => {
        const auto = partnerPaymentDescription(null, PARTNER);
        const settlement = await getSettlement(
            "u1",
            settlementDeps([paymentRow(auto)]),
        );

        // The journal titles this row "Transfer — you paid {partner}"; the
        // breakdown prints its description. Two panels, one wording.
        expect(settlement.breakdownItems.you_paid[0]!.description).toBe(
            `Transfer — you paid ${PARTNER}`,
        );
    });
});
