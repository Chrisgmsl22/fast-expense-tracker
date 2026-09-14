import { getCurrentMonthCdmx, getMonthRangeUtc, shiftMonth } from "@/lib/dates";
import {
    computeCoupleBalance,
    type CoupleBalance,
    type SettlementBreakdownKey,
    type SettlementInputs,
} from "@/lib/domain/settlement";
import { partnerShareTotal } from "@/lib/domain/movement";
import { resolvePartnerName } from "@/lib/domain/settings";
import { settlementRepository, settingsRepository } from "@/lib/repositories";
import type {
    SettlementExpenseRow,
    SettlementMovementRow,
    SettlementRepository,
} from "@/lib/repositories/settlement.repository";
import type { SettingsRepository } from "@/lib/repositories/settings.repository";

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
          /** Your partner's 32% — the `+` this row adds to the balance. */
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
          /** Free-text label ("what it was toward"); null when none. */
          note: string | null;
      }
);

/**
 * One contributing row behind a breakdown line — what the expandable "How this
 * balance is made" line reveals. `amount` is the positive magnitude the row adds
 * to its line, so a line's rows sum to exactly that line's total.
 */
export type SettlementBreakdownItem = {
    id: string;
    date: Date;
    description: string;
    /** This row's contribution to its line's total, unsigned (the line carries the sign). */
    amount: number;
    /** Partner-share rows only: the full expense you paid, of which `amount` is her share. */
    gross: number | null;
};

/** The contributing rows of every breakdown line, keyed the same way the line is. */
export type SettlementBreakdownItems = Record<
    SettlementBreakdownKey,
    SettlementBreakdownItem[]
>;

export type Settlement = {
    balance: CoupleBalance;
    /** The rows behind each of the four breakdown lines (spec 0004 §3.1). */
    breakdownItems: SettlementBreakdownItems;
    journal: SettlementJournalItem[];
    /** Previous-month portion of the balance, for the "includes $X from last month" note. */
    carriedOver: { present: boolean; amount: number };
};

/** Injectable seams so the assembly is unit-testable without a DB or the clock. */
export type SettlementDeps = {
    settlementRepo: SettlementRepository;
    settingsRepo: SettingsRepository;
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
    const settingsRepo = deps.settingsRepo ?? settingsRepository;
    const now = deps.now ?? new Date();

    // The partner name is per-user data (spec 0006), used only for the default
    // debt-row label when a debt has no note.
    const { partnerName } = await settingsRepo.getSettings(userId);
    const resolvedPartnerName = resolvePartnerName(partnerName);

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

    // One derivation of the rows behind the balance; the breakdown and the
    // journal are two views of it, so they cannot quote different money.
    const rows = buildSettlementRows(expenses, movements, resolvedPartnerName);

    return {
        balance,
        breakdownItems: buildBreakdownItems(rows),
        journal: buildJournal(rows, isCarried),
        carriedOver: {
            present: hasPrevRows && prevBalance.amount > 0,
            amount: prevBalance.amount,
        },
    };
}

/** The debt row's label when it was logged without a note. */
const debtDescription = (note: string | null, partnerName: string): string =>
    note?.trim() || `I owe ${partnerName}`;

/** The transfer row's label when it was logged without a note. */
const transferDescription = (
    note: string | null,
    direction: "gf_paid" | "gf_received",
    partnerName: string,
): string =>
    note?.trim() ||
    (direction === "gf_received"
        ? `Transfer — ${partnerName} paid you`
        : `Transfer — you paid ${partnerName}`);

/**
 * Newest first, matching the journal. Same-date rows fall back to `createdAt`
 * descending; when a row has none (an in-memory fake), the comparator returns 0
 * and JS's stable sort keeps the repository's own newest-first order.
 */
function byNewest(
    a: { date: Date; createdAt?: Date },
    b: { date: Date; createdAt?: Date },
): number {
    const byDate = b.date.getTime() - a.date.getTime();
    if (byDate !== 0) return byDate;
    if (a.createdAt && b.createdAt) {
        return b.createdAt.getTime() - a.createdAt.getTime();
    }
    return 0;
}

/** `amount` is a Float column, so net the drift out before comparing or showing. */
const roundCents = (n: number): number => Math.round(n * 100) / 100;

/** Sub-cent slack, the same epsilon `isBalanceSettled` uses for Float drift. */
const isZeroCents = (n: number): boolean => Math.abs(n) < 0.005;

/**
 * Make a line's rows add up ON SCREEN. `actualExpenditure` is stored unrounded
 * (`computeActualExpenditure`), so a partner share can carry four decimals: three
 * shares of 10.6656 each render $10.67 and read as $32.01, while their total,
 * 31.9968, renders $32.00. So round every row to cents and hand the leftover
 * cent(s) to the newest row, which keeps Σ rendered rows === the rendered total.
 */
function reconcileToCents<T extends { amount: number }>(rows: T[]): T[] {
    if (rows.length === 0) return rows;
    const total = roundCents(rows.reduce((sum, r) => sum + r.amount, 0));
    const rounded = rows.map((r) => ({ ...r, amount: roundCents(r.amount) }));
    const residual = roundCents(
        total - rounded.reduce((sum, r) => sum + r.amount, 0),
    );
    // Rows are newest first, so the adjustment lands on the most recent row.
    const [newest, ...rest] = rounded as [T, ...T[]];
    return [
        { ...newest, amount: roundCents(newest.amount + residual) },
        ...rest,
    ];
}

/**
 * One balance-affecting row, derived ONCE and read by both settlement panels.
 * `amount` is the cent-exact figure they each display, so the breakdown and the
 * journal can never quote different money for the same row.
 */
type SettlementRow = SettlementBreakdownItem & {
    line: SettlementBreakdownKey;
    /** The transfer's raw note — the journal's subtitle and its edit-form prefill. */
    note: string | null;
};

type SettlementRowsByLine = Record<SettlementBreakdownKey, SettlementRow[]>;

/**
 * The single rule for "this expense moves the couple balance". `partnerShareTotal`
 * sums (amount − actualExpenditure) over EVERY expense, so a row counts exactly
 * when that slice is non-zero. Both panels ask this one question — asking it twice,
 * once per panel, is how two views start disagreeing about which rows exist.
 */
function partnerShareOf(e: SettlementExpenseRow): number {
    return e.amount - e.actualExpenditure;
}

/**
 * Every row behind the balance, grouped by the breakdown line it belongs to,
 * newest first, each amount already reconciled to cents. This is the one source
 * both `buildBreakdownItems` and `buildJournal` read.
 */
function buildSettlementRows(
    expenses: SettlementExpenseRow[],
    movements: SettlementMovementRow[],
    partnerName: string,
): SettlementRowsByLine {
    const rows: SettlementRowsByLine = {
        partner_share: [],
        your_debt: [],
        partner_paid: [],
        you_paid: [],
    };

    // Sort the source rows, not the built ones: only the source carries
    // `createdAt`, the same-date tie-break.
    for (const e of [...expenses].sort(byNewest)) {
        const partnerShare = partnerShareOf(e);
        if (isZeroCents(partnerShare)) continue;
        rows.partner_share.push({
            line: "partner_share",
            id: e.id,
            date: e.date,
            description: e.description,
            amount: partnerShare,
            gross: e.amount,
            note: null,
        });
    }

    for (const m of [...movements].sort(byNewest)) {
        const base = { id: m.id, date: m.date, amount: m.amount, gross: null };
        if (m.type === "gf_fronted") {
            // A thing she fronted that you owe her — the "you owe" side of the
            // balance (ADR-0020). The note is the label; blank falls back.
            rows.your_debt.push({
                ...base,
                line: "your_debt",
                description: debtDescription(m.note, partnerName),
                note: m.note?.trim() || null,
            });
        } else if (m.type === "gf_received" || m.type === "gf_paid") {
            const line =
                m.type === "gf_received"
                    ? "partner_paid"
                    : ("you_paid" as const);
            rows[line].push({
                ...base,
                line,
                description: transferDescription(m.note, m.type, partnerName),
                note: m.note?.trim() || null,
            });
        }
        // A card payment (or any other movement) never enters the balance.
    }

    return {
        partner_share: reconcileToCents(rows.partner_share),
        your_debt: reconcileToCents(rows.your_debt),
        partner_paid: reconcileToCents(rows.partner_paid),
        you_paid: reconcileToCents(rows.you_paid),
    };
}

/**
 * The rows behind each of the four breakdown lines, so a line's total can be
 * opened up and read item by item. Each line's rows sum to that line's total, to
 * the cent (spec 0004 §3.1).
 */
function buildBreakdownItems(
    rows: SettlementRowsByLine,
): SettlementBreakdownItems {
    const toItem = ({
        id,
        date,
        description,
        amount,
        gross,
    }: SettlementRow): SettlementBreakdownItem => ({
        id,
        date,
        description,
        amount,
        gross,
    });
    return {
        partner_share: rows.partner_share.map(toItem),
        your_debt: rows.your_debt.map(toItem),
        partner_paid: rows.partner_paid.map(toItem),
        you_paid: rows.you_paid.map(toItem),
    };
}

/**
 * The same rows the breakdown groups by line, laid out chronologically across
 * kinds instead — shared expenses you paid, partner-fronted debts, transfers.
 * Amounts come straight off the shared row, so a row reads identically in both
 * panels.
 */
function buildJournal(
    rows: SettlementRowsByLine,
    isCarried: (date: Date) => boolean,
): SettlementJournalItem[] {
    const items: SettlementJournalItem[] = [];

    for (const row of rows.partner_share) {
        items.push({
            kind: "your_expense",
            id: row.id,
            date: row.date,
            carriedOver: isCarried(row.date),
            description: row.description,
            // A partner-share row always carries the gross it came out of.
            gross: row.gross ?? 0,
            partnerShare: row.amount,
        });
    }

    for (const row of rows.your_debt) {
        items.push({
            kind: "partner_debt",
            id: row.id,
            date: row.date,
            carriedOver: isCarried(row.date),
            description: row.description,
            amount: row.amount,
        });
    }

    for (const line of ["partner_paid", "you_paid"] as const) {
        for (const row of rows[line]) {
            items.push({
                kind: "transfer",
                id: row.id,
                date: row.date,
                carriedOver: isCarried(row.date),
                direction: line === "partner_paid" ? "gf_received" : "gf_paid",
                amount: row.amount,
                note: row.note,
            });
        }
    }

    return items.sort(byNewest);
}
