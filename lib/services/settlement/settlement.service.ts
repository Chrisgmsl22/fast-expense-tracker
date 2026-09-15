import {
    getCurrentMonthCdmx,
    getMonthRangeUtc,
    isValidMonth,
} from "@/lib/dates";
import {
    canCloseCycle,
    computeCoupleBalance,
    type CoupleBalance,
    type SettlementBreakdownKey,
    type SettlementInputs,
} from "@/lib/domain/settlement";
import { partnerShareTotal } from "@/lib/domain/movement";
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

/** One balance-affecting row for the settlement journal. */
export type SettlementJournalItem = {
    id: string;
    date: Date;
    /** True when the row falls in the previous month ("Earlier months" divider). */
    carriedOver: boolean;
    /**
     * This row closed a settlement cycle, so it is frozen server-side. The flag
     * rides ON THE ROW rather than on a view's props: a locked row must lose its
     * edit/delete controls in every view, including one written later that never
     * heard of cycles.
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

/** One closed settlement cycle, as the History view reads it (spec 0007 §3.5). */
export type ClosedSettlementCycle = {
    /** The marker movement's id — the transfer that closed this cycle. */
    id: string;
    /** The closing transfer's own date, for display. */
    closedOn: Date;
    /** The closing transfer's amount — what it took to square the cycle. */
    settledAmount: number;
    journal: SettlementJournalItem[];
};

export type Settlement = {
    balance: CoupleBalance;
    /** The rows behind each of the four breakdown lines (spec 0004 §3.1). */
    breakdownItems: SettlementBreakdownItems;
    /** The OPEN cycle's rows — everything entered since the last close. */
    journal: SettlementJournalItem[];
    /** Previous-month portion of the balance, for the "includes $X from last month" note. */
    carriedOver: { present: boolean; amount: number };
    /** Entry time the open cycle began; null when nothing has ever been closed. */
    openedAt: Date | null;
    /**
     * The transfer a close would mark, or null when there is nothing to close
     * (an empty cycle, or one with no transfer in it). Derived server-side and
     * re-derived by the close action, so the client never picks the marker.
     */
    closableMovementId: string | null;
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

/** How many closed cycles the History view loads. Older ones stay in the DB. */
const HISTORY_LIMIT = 6;

/** A row's entry time — what cycle membership compares (spec 0007 §3.5). */
const entryTime = (row: { createdAt: Date }): number => row.createdAt.getTime();

/**
 * Assemble the settlement view over the **open settlement cycle** — everything
 * entered since the last confirmed close, with no upper age limit (spec 0007
 * §3.5). This replaces the old rolling current+previous-month window, which
 * silently dropped anything unsettled older than last month out of the balance.
 *
 * Cycle membership is by ENTRY TIME against the marker's `closedAt` — the
 * instant the user confirmed the close, not the closing transfer's own entry
 * time. Everything the zero balance counted is therefore inside the cycle that
 * was closed, and a row entered afterwards is in the open one even if its date
 * falls inside a closed cycle. That is what makes "a late shared expense joins
 * the open cycle" true. Rows still display their own date, so the journal reads
 * chronologically as before.
 *
 * Returns all three views (spec 0007 §3.5): the open cycle (the balance itself),
 * the calendar month, and the closed cycles.
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
    // History is scoped by WHEN THE CLOSE HAPPENED — a cycle belongs to the month
    // the user closed it in, not to the date of the transfer that carries the
    // marker (the two can differ). The cap survives month scoping as a bound on
    // how much a single query can pull; a month with more than six closes would
    // show the six most recent.
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

    // One derivation of the rows behind the balance; the breakdown and the
    // journal are two views of it, so they cannot quote different money.
    const rows = buildSettlementRows(expenses, movements, resolvedPartnerName);
    // Every view is a projection of the same derivation — no second row shape.
    const monthRowsByLine = buildSettlementRows(
        monthRows.expenses,
        monthRows.movements,
        resolvedPartnerName,
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
        closableMovementId: findClosableMovementId(movements),
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
        ),
    };
}

/**
 * The transfer a close would mark: the most recently ENTERED `gf_paid` /
 * `gf_received` in the open cycle. That is the movement that squared the
 * balance, so it is the honest marker for when the cycle ended. Null when the
 * open cycle holds no transfer — there is then nothing to close.
 */
function findClosableMovementId(
    movements: SettlementMovementRow[],
): string | null {
    const transfers = movements
        .filter((m) => canCloseCycle(m.type))
        .sort((a, b) => entryTime(b) - entryTime(a));
    return transfers[0]?.id ?? null;
}

/**
 * Split the loaded history rows into their cycles and render each one. Cycle
 * `i` holds the rows entered in `(previous close instant, this close instant]` —
 * the same rule the open cycle uses. Newest cycle first.
 */
function buildHistory(
    markers: SettlementCycleMarker[],
    floor: Date | null,
    rows: SettlementWindowRows,
    partnerName: string,
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
        );
        cycles.push({
            id: marker.id,
            closedOn: marker.date,
            settledAmount: marker.amount,
            // A closed cycle spans whatever months it spans, so no row is
            // "carried over" relative to it.
            journal: buildJournal(cycleRows, () => false),
        });
        lowerBound = upperBound;
    }

    return cycles.reverse();
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
 * Round each row to the cent, independently of the rows beside it.
 *
 * This replaces a reconciliation that handed the leftover cent to the newest
 * row. That leftover only existed because `actualExpenditure` was stored as the
 * raw product; it is now rounded at write time (`computeActualExpenditure`) and
 * the existing rows were migrated, so there is nothing left to redistribute.
 *
 * The rounding stays as a guard — a Float column can still carry drift, and a
 * row that predates the migration must not render four decimals. What must
 * never come back is the redistribution: it made a row's value depend on which
 * OTHER rows shared its view, which is how one expense read $383.99 in the
 * month panel and $384.00 in the history panel.
 */
function roundRowsToCents<T extends { amount: number }>(rows: T[]): T[] {
    return rows.map((r) => ({ ...r, amount: roundCents(r.amount) }));
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
    /** This row closed a cycle, so it is frozen — see `SettlementJournalItem`. */
    locked: boolean;
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
            // Only a transfer can carry the marker, so an expense never locks.
            locked: false,
        });
    }

    for (const m of [...movements].sort(byNewest)) {
        const base = {
            id: m.id,
            date: m.date,
            amount: m.amount,
            gross: null,
            // The DB CHECK keeps `closedAt` off anything but a transfer, so
            // reading it for every movement kind is safe.
            locked: m.closedAt !== null,
        };
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
        partner_share: roundRowsToCents(rows.partner_share),
        your_debt: roundRowsToCents(rows.your_debt),
        partner_paid: roundRowsToCents(rows.partner_paid),
        you_paid: roundRowsToCents(rows.you_paid),
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
            locked: row.locked,
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
            locked: row.locked,
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
                locked: row.locked,
                direction: line === "partner_paid" ? "gf_received" : "gf_paid",
                amount: row.amount,
                note: row.note,
            });
        }
    }

    return items.sort(byNewest);
}
