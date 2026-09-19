import {
    getCurrentMonthCdmx,
    getMonthRangeUtc,
    isValidMonth,
} from "@/lib/dates";
import {
    canCloseCycle,
    computeCoupleBalance,
    cycleCloseAtOrAfter,
    movementMovesSettlementBalance,
    type CoupleBalance,
    type SettlementBreakdownKey,
    type SettlementInputs,
    type SettlementRowRef,
    type SettlementRowSource,
} from "@/lib/domain/settlement";
import type { TransferFundingSource } from "@/lib/domain/funding";
import {
    isPartnerPaymentAutoLabel,
    isZeroCents,
    movesSettlementBalance,
    partnerShareOf,
    partnerPaymentDescription,
} from "@/lib/domain/expense";
import {
    isPartnerDebt,
    partnerDebtLabel,
    partnerShareTotal,
    type PartnerDebtDirection,
} from "@/lib/domain/movement";
import { resolvePartnerName } from "@/lib/domain/settings";
import { settlementRepository, settingsRepository } from "@/lib/repositories";
import type {
    SettlementCycleMarker,
    SettlementExpenseRow,
    SettlementMovementRow,
    SettlementRepository,
    SettlementWindowRows,
} from "@/lib/repositories/settlement.repository";
import type { SettingsRepository } from "@/lib/repositories/settings.repository";

/** Where a debt row is stored — see `SettlementJournalItem`'s `partner_debt`. */
export type RowSource = SettlementRowSource;

/** One balance-affecting row for the settlement journal. */
export type SettlementJournalItem = {
    id: string;
    date: Date;
    /** True when the row falls in the previous month ("Earlier months" divider). */
    carriedOver: boolean;
    /**
     * A CLOSED cycle counted this row, so it is frozen server-side. The flag rides ON
     * THE ROW, so every view drops the controls, including one written later.
     */
    locked: boolean;
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
          direction: PartnerDebtDirection;
          description: string;
          /** Full positive debt amount; direction determines its balance sign. */
          amount: number;
          /**
           * Which table the row lives in. A debt and a payment are edited through
           * different actions, so a view that guessed would 404 on a visible row.
           */
          source: RowSource;
      }
    | {
          kind: "transfer";
          direction: "gf_paid" | "gf_received";
          amount: number;
          /** Free-text label ("what it was toward"); null when none. */
          note: string | null;
          /**
           * Carried for the edit-form prefill only, and null on an expense-sourced
           * payment. It changes no figure: the balance counts every transfer at full
           * value (spec 0007 §3.1).
           */
          fundedFrom: TransferFundingSource | null;
          /**
           * Which table this row lives in. A payment you SENT is an `Expense` now (spec
           * 0007 §6b); money she sent you, and any legacy `gf_paid`, are still movements.
           */
          source: RowSource;
      }
);

/**
 * One contributing row behind a breakdown line. `amount` is the positive magnitude it
 * adds, so a line's rows sum to exactly that line's total.
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

/** How a closed cycle ended, in words rather than a signed number. */
export type CycleOutcome =
    | { kind: "you_paid"; amount: number }
    | { kind: "partner_paid"; amount: number }
    | { kind: "even" };

/** The four figures the closed-cycle footer shows (spec 0007 §6b, slice H). */
export type ClosedCycleSummary = {
    /**
     * Everything the cycle bought at full price — NO split applied. Legacy debts
     * he owes retain their recorded contribution. Her standalone debt adds no spend.
     */
    spentUnsplit: number;
    /** What you owed her across the cycle. */
    youOwed: number;
    /** What she owed you across the cycle. */
    sheOwed: number;
    /** Who settled it, and for how much. */
    outcome: CycleOutcome;
};

/** One closed settlement cycle, as the History view reads it (spec 0007 §3.5). */
export type ClosedSettlementCycle = {
    /** The marker row's id — the transfer or payment that closed this cycle. */
    id: string;
    /** The closing row's own date, for display. */
    closedOn: Date;
    /** The closing row's amount — what it took to square the cycle. */
    settledAmount: number;
    journal: SettlementJournalItem[];
    /** The footer figures, derived from the SAME rows the journal shows. */
    summary: ClosedCycleSummary;
};

export type Settlement = {
    balance: CoupleBalance;
    /** The rows behind each of the five breakdown lines. */
    breakdownItems: SettlementBreakdownItems;
    /** The OPEN cycle's rows — everything entered since the last close. */
    journal: SettlementJournalItem[];
    /** Previous-month portion of the balance, for the "includes $X from last month" note. */
    carriedOver: { present: boolean; amount: number };
    /** Entry time the open cycle began; null when nothing has ever been closed. */
    openedAt: Date | null;
    /**
     * The row a close would mark, in whichever table it lives, or null when there is
     * nothing to close. The close action re-derives it, so the client never picks it.
     */
    closableMarker: SettlementRowRef | null;
    /** The VIEWED calendar month's rows — the Month view. */
    month: {
        /** `YYYY-MM` of the month being viewed. */
        label: string;
        /** True when that is the live current month (spec 0007 §3.5). */
        isCurrent: boolean;
        journal: SettlementJournalItem[];
    };
    /** Cycles closed IN the viewed month, newest first (at most `HISTORY_LIMIT`). */
    history: ClosedSettlementCycle[];
};

/** Injectable seams so the assembly is unit-testable without a DB or the clock. */
export type SettlementDeps = {
    settlementRepo: SettlementRepository;
    settingsRepo: SettingsRepository;
    now: Date;
};

/** What the reader is looking at — presentation scope, never balance scope. */
export type SettlementViewOptions = {
    /** `YYYY-MM` to scope the Month and History views to. Defaults to now. */
    month?: string;
};

/**
 * Drop any legacy `gf_paid` movement that has already become a payment-expense. The
 * conversion migration MUST reuse the movement's id (ADR-0024) — that is the only
 * thing that makes a twin recognisable, and a missed one doubles the figure.
 */
function withoutConvertedTwins(
    movements: SettlementMovementRow[],
    expenses: SettlementExpenseRow[],
): SettlementMovementRow[] {
    const convertedIds = new Set(
        expenses.filter((e) => e.isPartnerPayment).map((e) => e.id),
    );
    if (convertedIds.size === 0) return movements;
    return movements.filter(
        (m) => !(m.type === "gf_paid" && convertedIds.has(m.id)),
    );
}

/**
 * Net the five balance inputs from a set of window rows (spec 0007). Spec 0007
 * §6b reversed which table each side reads; the balance itself is unchanged.
 */
function inputsFrom(
    expenses: SettlementExpenseRow[],
    movements: SettlementMovementRow[],
): SettlementInputs {
    // Sorted before any summing, so no row can land on both sides.
    const yourExpenses = expenses.filter((e) => !e.isPartnerPayment);
    const paymentExpenses = expenses.filter((e) => e.isPartnerPayment);
    const partnerShareOfYourExpenses = partnerShareTotal(yourExpenses);

    // A payment row's `actualExpenditure` IS what you sent her — no split is
    // applied to it (spec 0007 §6b).
    let moneyYouPaidPartner = paymentExpenses.reduce(
        (sum, e) => sum + e.actualExpenditure,
        0,
    );
    let moneyPartnerPaidYou = 0;
    let yourDebtToPartner = 0;
    let partnerDebtToYou = 0;
    for (const m of withoutConvertedTwins(movements, expenses)) {
        // A debt she fronted: settlement only (spec 0007 §6b).
        if (m.type === "gf_fronted") yourDebtToPartner += m.amount;
        else if (m.type === "partner_debt") partnerDebtToYou += m.amount;
        else if (m.type === "gf_received") moneyPartnerPaidYou += m.amount;
        // LEGACY `gf_paid`: the conversion migration leaves this row behind on an
        // account with no `combined-expenses` category, so it is still counted here
        // and no balance loses one before or after the conversion runs.
        else if (m.type === "gf_paid") moneyYouPaidPartner += m.amount;
    }

    return {
        partnerShareOfYourExpenses,
        yourDebtToPartner,
        partnerDebtToYou,
        moneyPartnerPaidYou,
        moneyYouPaidPartner,
    };
}

/** How many closed cycles the History view loads. Older ones stay in the DB. */
const HISTORY_LIMIT = 6;

/** A row's entry time — what cycle membership compares (spec 0007 §3.5). */
const entryTime = (row: { createdAt: Date }): number => row.createdAt.getTime();

/**
 * Assemble the settlement view over the **open settlement cycle** — everything
 * entered since the last close, with no age limit (spec 0007 §3.5). Membership is by
 * ENTRY time against the close instant, so a late row joins the open cycle.
 */
export async function getSettlement(
    userId: string,
    deps: Partial<SettlementDeps> = {},
    options: SettlementViewOptions = {},
): Promise<Settlement> {
    const settlementRepo = deps.settlementRepo ?? settlementRepository;
    const settingsRepo = deps.settingsRepo ?? settingsRepository;
    const now = deps.now ?? new Date();

    // The partner name is per-user data (spec 0006), used only for the default
    // debt-row label when a debt has no note.
    const { partnerName } = await settingsRepo.getSettings(userId);
    const resolvedPartnerName = resolvePartnerName(partnerName);

    const currentMonth = getCurrentMonthCdmx(now);
    // The viewed month scopes the Month and History views ONLY. The balance is
    // the open cycle whatever month is on screen — a settlement is not a month.
    const viewedMonth =
        options.month && isValidMonth(options.month)
            ? options.month
            : currentMonth;
    const { start: currentStart } = getMonthRangeUtc(currentMonth);
    const viewedRange = getMonthRangeUtc(viewedMonth);

    const markers = await settlementRepo.getCycleMarkers(userId);
    const lastMarker = markers.at(-1) ?? null;
    const openedAt = lastMarker?.closedAt ?? null;
    // History is scoped by WHEN THE CLOSE HAPPENED, not by the date of the transfer
    // that carries the marker — the two can differ.
    const closedThisMonth = markers.filter(
        (m) => m.closedAt >= viewedRange.start && m.closedAt < viewedRange.end,
    );
    const shownMarkers = closedThisMonth.slice(-HISTORY_LIMIT);
    const firstShown = shownMarkers[0];
    const lastShown = shownMarkers.at(-1);
    // Rows of the oldest shown cycle start after the close BEFORE it, which may
    // sit in an earlier month; `null` means "from the beginning of time".
    const historyFloor = firstShown
        ? (markers[markers.indexOf(firstShown) - 1]?.closedAt ?? null)
        : null;

    const [openRows, monthRows, historyRows] = await Promise.all([
        settlementRepo.getForCreatedRange(userId, openedAt, null),
        settlementRepo.getForWindow(userId, viewedRange.start, viewedRange.end),
        lastShown
            ? settlementRepo.getForCreatedRange(
                  userId,
                  historyFloor,
                  lastShown.closedAt,
              )
            : Promise.resolve({ expenses: [], movements: [] }),
    ]);

    const { expenses, movements } = openRows;
    const balance = computeCoupleBalance(inputsFrom(expenses, movements));

    // The pre-this-month portion of the OPEN cycle drives the "from earlier"
    // callout. Unlike membership, this one is a date question: it describes when
    // the money happened, not when it was typed in.
    const isCarried = (date: Date): boolean => date < currentStart;
    const prevExpenses = expenses.filter((e) => isCarried(e.date));
    const prevMovements = movements.filter((m) => isCarried(m.date));
    const prevBalance = computeCoupleBalance(
        inputsFrom(prevExpenses, prevMovements),
    );
    const hasPrevRows = prevExpenses.length > 0 || prevMovements.length > 0;

    // Every close instant the user has filed — what makes `locked` a derivation. The
    // Month view is a DATE window, so it always spans closed cycles.
    const closes = markers.map((m) => m.closedAt);

    // One derivation of the rows behind the balance; the breakdown and the
    // journal are two views of it, so they cannot quote different money.
    const rows = buildSettlementRows(
        expenses,
        movements,
        resolvedPartnerName,
        closes,
    );
    // Every view is a projection of the same derivation — no second row shape.
    const monthRowsByLine = buildSettlementRows(
        monthRows.expenses,
        monthRows.movements,
        resolvedPartnerName,
        closes,
    );

    return {
        balance,
        breakdownItems: buildBreakdownItems(rows),
        journal: buildJournal(rows, isCarried),
        carriedOver: {
            present: hasPrevRows && prevBalance.amount > 0,
            amount: prevBalance.amount,
        },
        openedAt,
        closableMarker: findClosableMarker(expenses, movements),
        month: {
            label: viewedMonth,
            isCurrent: viewedMonth === currentMonth,
            // Every row in a calendar month is "this month" by definition.
            journal: buildJournal(monthRowsByLine, () => false),
        },
        history: buildHistory(
            shownMarkers,
            historyFloor,
            historyRows,
            resolvedPartnerName,
            closes,
        ),
    };
}

/**
 * The row a close would mark: the most recently ENTERED row in the open cycle that can
 * carry the boundary — a transfer, or the payment-expense that squared the balance
 * (spec 0007 §6b). Null when the cycle holds neither.
 */
function findClosableMarker(
    expenses: SettlementExpenseRow[],
    movements: SettlementMovementRow[],
): SettlementRowRef | null {
    const candidates: (SettlementRowRef & { createdAt: Date })[] = [
        ...expenses
            .filter((e) => e.isPartnerPayment)
            .map((e) => ({
                id: e.id,
                kind: "expense" as const,
                createdAt: e.createdAt,
            })),
        // A converted twin is the SAME payment as its expense (ADR-0024), so marking
        // the movement would file the boundary on the row no balance reads.
        ...withoutConvertedTwins(movements, expenses)
            .filter((m) => canCloseCycle(m.type))
            .map((m) => ({
                id: m.id,
                kind: "movement" as const,
                createdAt: m.createdAt,
            })),
    ].sort((a, b) => entryTime(b) - entryTime(a));

    const closable = candidates[0];
    return closable ? { id: closable.id, kind: closable.kind } : null;
}

/**
 * Split the loaded history rows into cycles: cycle `i` holds the rows entered in
 * `(previous close, this close]`, the same rule the open cycle uses. Newest first.
 */
function buildHistory(
    markers: SettlementCycleMarker[],
    floor: Date | null,
    rows: SettlementWindowRows,
    partnerName: string,
    closes: readonly Date[],
): ClosedSettlementCycle[] {
    const cycles: ClosedSettlementCycle[] = [];
    let lowerBound = floor?.getTime() ?? Number.NEGATIVE_INFINITY;

    for (const marker of markers) {
        const upperBound = marker.closedAt.getTime();
        const inCycle = <T extends { createdAt: Date }>(all: T[]): T[] =>
            all.filter((r) => {
                const t = entryTime(r);
                return t > lowerBound && t <= upperBound;
            });

        const cycleRows = buildSettlementRows(
            inCycle(rows.expenses),
            inCycle(rows.movements),
            partnerName,
            closes,
        );
        cycles.push({
            id: marker.id,
            closedOn: marker.date,
            settledAmount: marker.amount,
            // A closed cycle spans whatever months it spans, so no row is
            // "carried over" relative to it.
            journal: buildJournal(cycleRows, () => false),
            summary: summarizeCycle(cycleRows),
        });
        lowerBound = upperBound;
    }

    return cycles.reverse();
}

/**
 * The closed cycle's four figures, read off THE SAME rows the journal renders, so the
 * footer cannot disagree with the rows above it.
 */
function summarizeCycle(rows: SettlementRowsByLine): ClosedCycleSummary {
    const sum = (list: { amount: number }[]): number =>
        roundCents(list.reduce((total, r) => total + r.amount, 0));

    // "No split applied": a shared expense contributes the full amount you paid. A
    // debt has no gross — what was recorded is already your share.
    const spentUnsplit = roundCents(
        rows.partner_share.reduce((total, r) => total + (r.gross ?? 0), 0) +
            rows.your_debt.reduce((total, r) => total + r.amount, 0),
    );

    const youPaid = sum(rows.you_paid);
    const partnerPaid = sum(rows.partner_paid);
    const net = roundCents(youPaid - partnerPaid);

    return {
        spentUnsplit,
        youOwed: sum(rows.your_debt),
        sheOwed: roundCents(sum(rows.partner_share) + sum(rows.partner_debt)),
        outcome: isZeroCents(net)
            ? { kind: "even" }
            : net > 0
              ? { kind: "you_paid", amount: net }
              : { kind: "partner_paid", amount: Math.abs(net) },
    };
}

/** The debt row's label when it was logged without a note. */
const debtDescription = (
    note: string | null,
    partnerName: string,
    direction: PartnerDebtDirection,
): string => note?.trim() || partnerDebtLabel(direction, partnerName);

/**
 * The transfer row's label when logged without a note. The outbound side defers to
 * `partnerPaymentDescription`, so a legacy movement and its twin read identically.
 */
const transferDescription = (
    note: string | null,
    direction: "gf_paid" | "gf_received",
    partnerName: string,
): string =>
    direction === "gf_received"
        ? note?.trim() || `Transfer — ${partnerName} paid you`
        : partnerPaymentDescription(note, partnerName);

/**
 * The note behind a payment-expense's description, or null when it has none. The
 * journal's edit form prefills from this and saves what it finds, so a null here
 * OVERWRITES the stored text. Matched on the label's PREFIX, not the current name.
 */
function paymentNote(description: string): string | null {
    return isPartnerPaymentAutoLabel(description) ? null : description;
}

/**
 * Newest first, `createdAt` breaking a same-date tie. A row without one (an in-memory
 * fake) compares 0, and the stable sort keeps the repository's order.
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

/**
 * Round each row to the cent INDEPENDENTLY of the rows beside it. Never redistribute
 * a leftover: that made a row's value depend on which other rows shared its view, so
 * one expense read $383.99 in one panel and $384.00 in another.
 */
function roundRowsToCents<T extends { amount: number }>(rows: T[]): T[] {
    return rows.map((r) => ({ ...r, amount: roundCents(r.amount) }));
}

/**
 * One balance-affecting row, derived ONCE and read by both panels, so the breakdown
 * and the journal can never quote different money for the same row.
 */
type SettlementRow = SettlementBreakdownItem & {
    line: SettlementBreakdownKey;
    /** The transfer's raw note — the journal's subtitle and its edit-form prefill. */
    note: string | null;
    /** This row closed a cycle, so it is frozen — see `SettlementJournalItem`. */
    locked: boolean;
    /** Debt rows only: which table the row lives in. Null on every other line. */
    source: RowSource | null;
    /**
     * Legacy `gf_paid`/`gf_received` movements only — a payment-expense keeps its
     * funding on the expense row, which its own edit path reads. Null = no claim.
     */
    fundedFrom: TransferFundingSource | null;
};

type SettlementRowsByLine = Record<SettlementBreakdownKey, SettlementRow[]>;

/**
 * Every row behind the balance, grouped by breakdown line, newest first — the one
 * source `buildBreakdownItems` and `buildJournal` both read. `closes` is what makes
 * `locked` a derived fact rather than a column lookup.
 */
function buildSettlementRows(
    expenses: SettlementExpenseRow[],
    movements: SettlementMovementRow[],
    partnerName: string,
    closes: readonly Date[],
): SettlementRowsByLine {
    /**
     * Frozen means TWO things — the cycle is closed AND it counted the row. Built from
     * the same helpers the write paths refuse on, so the two sets cannot drift.
     */
    const expenseLocked = (e: SettlementExpenseRow): boolean =>
        cycleCloseAtOrAfter(closes, e.createdAt) !== null &&
        movesSettlementBalance(e);
    const rows: SettlementRowsByLine = {
        partner_share: [],
        partner_debt: [],
        your_debt: [],
        partner_paid: [],
        you_paid: [],
    };

    // Sort the source rows, not the built ones: only the source carries
    // `createdAt`, the same-date tie-break.
    for (const e of [...expenses].sort(byNewest)) {
        // A payment lands on `you_paid` and is never read for a partner share; the
        // `continue` is what keeps one payment on exactly one line.
        if (e.isPartnerPayment) {
            rows.you_paid.push({
                line: "you_paid",
                source: "expense",
                fundedFrom: e.fundedFrom,
                id: e.id,
                date: e.date,
                description: e.description,
                amount: e.actualExpenditure,
                gross: null,
                // The row's real note, recovered from its description — the edit form writes back what it finds.
                note: paymentNote(e.description),
                locked: expenseLocked(e),
            });
            continue;
        }

        // `partnerShareOf` + `isZeroCents` ARE `movesSettlementBalance` — one
        // definition, so a frozen row and a counted row can never be different sets.
        const partnerShare = partnerShareOf(e);
        if (isZeroCents(partnerShare)) continue;
        rows.partner_share.push({
            line: "partner_share",
            source: null,
            fundedFrom: null,
            id: e.id,
            date: e.date,
            description: e.description,
            amount: partnerShare,
            gross: e.amount,
            note: null,
            locked: expenseLocked(e),
        });
    }

    for (const m of [...withoutConvertedTwins(movements, expenses)].sort(
        byNewest,
    )) {
        const base = {
            id: m.id,
            date: m.date,
            amount: m.amount,
            gross: null,
            // Derived like the expense side: a cycle freezes every row it COUNTED, not
            // just the transfer carrying its marker (a debt can never hold one).
            locked:
                cycleCloseAtOrAfter(closes, m.createdAt) !== null &&
                movementMovesSettlementBalance(m.type),
        };
        if (isPartnerDebt(m.type)) {
            // A debt in either direction belongs only to settlement (spec 0007).
            const line =
                m.type === "partner_debt" ? "partner_debt" : "your_debt";
            rows[line].push({
                ...base,
                line,
                source: "movement",
                fundedFrom: null,
                description: debtDescription(m.note, partnerName, m.type),
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
                source: null,
                description: transferDescription(m.note, m.type, partnerName),
                note: m.note?.trim() || null,
                fundedFrom: m.fundedFrom,
            });
        }
        // A card payment (or any other movement) never enters the balance.
    }

    return {
        partner_share: roundRowsToCents(rows.partner_share),
        partner_debt: roundRowsToCents(rows.partner_debt),
        your_debt: roundRowsToCents(rows.your_debt),
        partner_paid: roundRowsToCents(rows.partner_paid),
        you_paid: roundRowsToCents(rows.you_paid),
    };
}

/**
 * The rows behind each of the five breakdown lines. Each line's rows sum to that
 * line's total, to the cent (spec 0004 §3.1).
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
        partner_debt: rows.partner_debt.map(toItem),
        your_debt: rows.your_debt.map(toItem),
        partner_paid: rows.partner_paid.map(toItem),
        you_paid: rows.you_paid.map(toItem),
    };
}

/**
 * The same rows the breakdown groups by line, laid out chronologically instead.
 * Amounts come straight off the shared row, so both panels read identically.
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
            locked: row.locked,
            description: row.description,
            // A partner-share row always carries the gross it came out of.
            gross: row.gross ?? 0,
            partnerShare: row.amount,
        });
    }

    for (const row of [...rows.your_debt, ...rows.partner_debt]) {
        items.push({
            kind: "partner_debt",
            direction:
                row.line === "partner_debt" ? "partner_debt" : "gf_fronted",
            id: row.id,
            date: row.date,
            carriedOver: isCarried(row.date),
            locked: row.locked,
            description: row.description,
            amount: row.amount,
            // A debt is a movement again (spec 0007 §6b); the fallback only
            // narrows the type.
            source: row.source ?? "movement",
        });
    }

    for (const line of ["partner_paid", "you_paid"] as const) {
        for (const row of rows[line]) {
            items.push({
                kind: "transfer",
                id: row.id,
                date: row.date,
                carriedOver: isCarried(row.date),
                locked: row.locked,
                direction: line === "partner_paid" ? "gf_received" : "gf_paid",
                amount: row.amount,
                note: row.note,
                fundedFrom: row.fundedFrom,
                // A payment you sent is an expense now, so the journal's controls must
                // reach the expense actions. `gf_received` and legacy `gf_paid` do not.
                source: row.source ?? "movement",
            });
        }
    }

    return items.sort(byNewest);
}
