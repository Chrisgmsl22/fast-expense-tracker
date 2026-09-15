import { getCurrentMonthCdmx, getMonthRangeUtc } from "@/lib/dates";
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

/** Where a debt row is stored — see `SettlementJournalItem`'s `partner_debt`. */
export type DebtSource = "expense" | "movement";

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
          /**
           * Which table the row lives in. A debt is an `Expense{isFronted:true}`
           * now (spec 0007 §6a), but a legacy `gf_fronted` movement the
           * migration could not convert still counts in the balance and still
           * renders here. The two look identical on screen and are edited and
           * deleted through different actions, so the row carries its own
           * origin: a view that guessed would send half of them to the wrong
           * table and report "not found" for a row in plain sight.
           */
          source: DebtSource;
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
    /** The current calendar month's rows — the Month view, unchanged in look. */
    month: { label: string; journal: SettlementJournalItem[] };
    /** Closed cycles, newest first (most recent `HISTORY_LIMIT`). */
    history: ClosedSettlementCycle[];
};

/** Injectable seams so the assembly is unit-testable without a DB or the clock. */
export type SettlementDeps = {
    settlementRepo: SettlementRepository;
    settingsRepo: SettingsRepository;
    now: Date;
};

/**
 * Drop any legacy `gf_fronted` movement that has already become an expense.
 *
 * The conversion migration reuses the movement's id for the expense it creates,
 * so a converted pair is recognisable without a join table. The migration is
 * atomic — it inserts and deletes in one transaction — so a twin should never
 * exist. This says "should never" out loud instead of trusting it: a partial
 * restore, a replay against a half-migrated copy, or a hand-run INSERT would
 * otherwise count one debt twice, and a silently doubled IOU is the kind of
 * error nobody spots until they pay it.
 *
 * The movement fallback is **transitional, not permanent**. It exists for one
 * case: an account with no `combined-expenses` category when the migration ran,
 * which had nowhere honest to file the debt. Such an account is converted by
 * creating that category and re-running the migration's conversion step; until
 * then its debts still count in the balance and can still be deleted. Nothing
 * writes `gf_fronted` anymore, so the set only shrinks.
 */
function withoutConvertedTwins(
    movements: SettlementMovementRow[],
    expenses: SettlementExpenseRow[],
): SettlementMovementRow[] {
    const convertedIds = new Set(
        expenses.filter((e) => e.isFronted).map((e) => e.id),
    );
    if (convertedIds.size === 0) return movements;
    return movements.filter(
        (m) => !(m.type === "gf_fronted" && convertedIds.has(m.id)),
    );
}

/** Net the four balance inputs from a set of window rows (spec 0004 §2.4). */
function inputsFrom(
    expenses: SettlementExpenseRow[],
    movements: SettlementMovementRow[],
): SettlementInputs {
    // Expenses now split two ways (spec 0007 §6a): the ones you paid, where the
    // partner owes you her share, and the ones she fronted, where you owe her
    // the whole row. They pull the balance in opposite directions, so each is
    // read once and only once — the sort happens here, before any summing, so no
    // row can land on both sides. `partnerShareTotal` sums
    // (amount − actualExpenditure), 0 for a solo expense, so summing the rest is
    // safe.
    const yourExpenses = expenses.filter((e) => !e.isFronted);
    const frontedExpenses = expenses.filter((e) => e.isFronted);
    const partnerShareOfYourExpenses = partnerShareTotal(yourExpenses);

    // A fronted row's `actualExpenditure` IS what you owe her: the amount logged
    // was already your share (spec 0007 §6a decision 1).
    let yourDebtToPartner = frontedExpenses.reduce(
        (sum, e) => sum + e.actualExpenditure,
        0,
    );
    let moneyPartnerPaidYou = 0;
    let moneyYouPaidPartner = 0;
    for (const m of withoutConvertedTwins(movements, expenses)) {
        if (m.type === "gf_paid") moneyYouPaidPartner += m.amount;
        else if (m.type === "gf_received") moneyPartnerPaidYou += m.amount;
        // LEGACY `gf_fronted` (spec 0007 §6a): the migration converted these to
        // expenses, but an account the conversion had to skip keeps its debts
        // here. Still counted, so no balance silently loses a row.
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
): Promise<Settlement> {
    const settlementRepo = deps.settlementRepo ?? settlementRepository;
    const settingsRepo = deps.settingsRepo ?? settingsRepository;
    const now = deps.now ?? new Date();

    // The partner name is per-user data (spec 0006), used only for the default
    // debt-row label when a debt has no note.
    const { partnerName } = await settingsRepo.getSettings(userId);
    const resolvedPartnerName = resolvePartnerName(partnerName);

    const currentMonth = getCurrentMonthCdmx(now);
    const { start: currentStart, end: currentEnd } =
        getMonthRangeUtc(currentMonth);

    const markers = await settlementRepo.getCycleMarkers(userId);
    const lastMarker = markers.at(-1) ?? null;
    const openedAt = lastMarker?.closedAt ?? null;
    // Load only the cycles History shows; `null` when there are fewer than the
    // limit, which means "from the beginning".
    const historyFloor =
        markers[markers.length - 1 - HISTORY_LIMIT]?.closedAt ?? null;

    const [openRows, monthRows, historyRows] = await Promise.all([
        settlementRepo.getForCreatedRange(userId, openedAt, null),
        settlementRepo.getForWindow(userId, currentStart, currentEnd),
        lastMarker
            ? settlementRepo.getForCreatedRange(
                  userId,
                  historyFloor,
                  lastMarker.closedAt,
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
            label: currentMonth,
            // Every row in a calendar month is "this month" by definition.
            journal: buildJournal(monthRowsByLine, () => false),
        },
        history: buildHistory(
            markers.slice(-HISTORY_LIMIT),
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
    /** This row closed a cycle, so it is frozen — see `SettlementJournalItem`. */
    locked: boolean;
    /** Debt rows only: which table the row lives in. Null on every other line. */
    source: DebtSource | null;
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
        // A fronted expense is the OTHER side of the balance: you owe her the
        // whole row, so it lands on `your_debt` and is never read for a partner
        // share. The `continue` is what keeps one fronted amount on exactly one
        // line — an edit that made `amount` and `actualExpenditure` differ would
        // otherwise leak a phantom partner share out of the same row.
        if (e.isFronted) {
            rows.your_debt.push({
                line: "your_debt",
                source: "expense",
                id: e.id,
                date: e.date,
                description: e.description,
                amount: e.actualExpenditure,
                gross: null,
                note: null,
                // Only a transfer can carry the cycle marker.
                locked: false,
            });
            continue;
        }

        const partnerShare = partnerShareOf(e);
        if (isZeroCents(partnerShare)) continue;
        rows.partner_share.push({
            line: "partner_share",
            source: null,
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

    for (const m of [...withoutConvertedTwins(movements, expenses)].sort(
        byNewest,
    )) {
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
                // The legacy shape: still owed, still counted, but it lives in
                // the movement table and is reached by the movement actions.
                source: "movement",
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
                source: null,
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
            // Both debt loops above set a source, so this only narrows the type.
            source: row.source ?? "expense",
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
