import { getCurrentMonthCdmx, getMonthRangeUtc, shiftMonth } from "@/lib/dates";
import {
    computeCoupleBalance,
    type CoupleBalance,
    type SettlementInputs,
} from "@/lib/domain/settlement";
import { partnerShareTotal } from "@/lib/domain/movement";
import { PARTNER_NAME } from "@/lib/partner";
import { settlementRepository } from "@/lib/repositories";
import type {
    SettlementExpenseRow,
    SettlementMovementRow,
    SettlementRepository,
} from "@/lib/repositories/settlement.repository";

/** One balance-affecting row for the settlement journal. */
export type SettlementJournalItem = {
    id: string;
    date: Date;
    /** True when the row falls in the previous month ("Earlier months" divider). */
    carriedOver: boolean;
} & (
    | {
          kind: "your_expense";
          description: string;
          /** What you paid (gross). */
          gross: number;
          /** Brenda's 32% — the `+` this row adds to the balance. */
          partnerShare: number;
      }
    | {
          kind: "partner_debt";
          description: string;
          /** Your share of what she fronted — the `-` this row adds. */
          amount: number;
      }
    | {
          kind: "transfer";
          direction: "gf_paid" | "gf_received";
          amount: number;
      }
    | {
          // A card payment made with Brenda's money — one entry for the two
          // real-world movements (she paid you → you paid the card). Money in
          // from her, so it draws the balance down like a `gf_received`.
          kind: "funded_card_payment";
          amount: number;
      }
);

export type Settlement = {
    balance: CoupleBalance;
    journal: SettlementJournalItem[];
    /** Previous-month portion of the balance, for the "includes $X from last month" note. */
    carriedOver: { present: boolean; amount: number };
};

/** Injectable seams so the assembly is unit-testable without a DB or the clock. */
export type SettlementDeps = {
    settlementRepo: SettlementRepository;
    now: Date;
};

/** Net the four balance inputs from a set of window rows (spec 0004 §2.4). */
function inputsFrom(
    expenses: SettlementExpenseRow[],
    movements: SettlementMovementRow[],
): SettlementInputs {
    // Every expense is the user's own now (ADR-0020) — a thing the partner
    // fronted is a `gf_fronted` movement, not an expense. `partnerShareTotal`
    // sums (amount − actualExpenditure), 0 for a solo expense, so summing all is
    // safe.
    const partnerShareOfYourExpenses = partnerShareTotal(expenses);

    let yourDebtToPartner = 0;
    let moneyPartnerPaidYou = 0;
    let moneyYouPaidPartner = 0;
    for (const m of movements) {
        if (m.type === "gf_paid") moneyYouPaidPartner += m.amount;
        else if (m.type === "gf_received") moneyPartnerPaidYou += m.amount;
        else if (m.type === "gf_fronted") yourDebtToPartner += m.amount;
        else if (m.type === "card_payment" && m.fundedByPartner)
            moneyPartnerPaidYou += m.amount;
    }

    return {
        partnerShareOfYourExpenses,
        yourDebtToPartner,
        moneyPartnerPaidYou,
        moneyYouPaidPartner,
    };
}

/**
 * Assemble the settlement view: a two-sided running balance over a rolling
 * **current + previous month** window (spec 0004 §2.1), the "How this balance is
 * made" breakdown, and the movement journal. The window is intentionally not the
 * dashboard's single viewed month — an unsettled debt must survive one month-end,
 * so the same figure shows regardless of which month the dashboard is on.
 */
export async function getSettlement(
    userId: string,
    deps: Partial<SettlementDeps> = {},
): Promise<Settlement> {
    const settlementRepo = deps.settlementRepo ?? settlementRepository;
    const now = deps.now ?? new Date();

    const currentMonth = getCurrentMonthCdmx(now);
    const previousMonth = shiftMonth(currentMonth, -1);
    const windowStart = getMonthRangeUtc(previousMonth).start;
    const currentStart = getMonthRangeUtc(currentMonth).start;
    const windowEnd = getMonthRangeUtc(currentMonth).end;

    const { expenses, movements } = await settlementRepo.getForWindow(
        userId,
        windowStart,
        windowEnd,
    );

    const balance = computeCoupleBalance(inputsFrom(expenses, movements));

    // The previous-month sub-balance drives the "from last month" callout.
    const isCarried = (date: Date): boolean => date < currentStart;
    const prevExpenses = expenses.filter((e) => isCarried(e.date));
    const prevMovements = movements.filter((m) => isCarried(m.date));
    const prevBalance = computeCoupleBalance(
        inputsFrom(prevExpenses, prevMovements),
    );
    const hasPrevRows = prevExpenses.length > 0 || prevMovements.length > 0;

    const journal = buildJournal(expenses, movements, isCarried);

    return {
        balance,
        journal,
        carriedOver: {
            present: hasPrevRows && prevBalance.amount > 0,
            amount: prevBalance.amount,
        },
    };
}

/** Shared expenses you paid + "I owe Brenda" debts + transfers, newest first. */
function buildJournal(
    expenses: SettlementExpenseRow[],
    movements: SettlementMovementRow[],
    isCarried: (date: Date) => boolean,
): SettlementJournalItem[] {
    const items: SettlementJournalItem[] = [];

    for (const e of expenses) {
        if (e.isShared) {
            items.push({
                kind: "your_expense",
                id: e.id,
                date: e.date,
                carriedOver: isCarried(e.date),
                description: e.description,
                gross: e.amount,
                partnerShare: e.amount - e.actualExpenditure,
            });
        }
        // A solo (not shared) expense doesn't touch the couple balance, so it
        // never enters the settlement journal.
    }

    for (const m of movements) {
        if (m.type === "gf_fronted") {
            // A thing she fronted that you owe her — the "you owe" side of the
            // balance (ADR-0020). The note is the label; blank falls back below.
            items.push({
                kind: "partner_debt",
                id: m.id,
                date: m.date,
                carriedOver: isCarried(m.date),
                description: m.note?.trim() || `I owe ${PARTNER_NAME}`,
                amount: m.amount,
            });
        } else if (m.type === "gf_paid" || m.type === "gf_received") {
            items.push({
                kind: "transfer",
                id: m.id,
                date: m.date,
                carriedOver: isCarried(m.date),
                direction: m.type,
                amount: m.amount,
            });
        } else if (m.type === "card_payment" && m.fundedByPartner) {
            // Her money that went to a card — show it so the balance draw-down
            // is visible, not just a number in the breakdown.
            items.push({
                kind: "funded_card_payment",
                id: m.id,
                date: m.date,
                carriedOver: isCarried(m.date),
                amount: m.amount,
            });
        }
        // A plain (own-money) card payment doesn't touch the balance → not shown.
    }

    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
}
