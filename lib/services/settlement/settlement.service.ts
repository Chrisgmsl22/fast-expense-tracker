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
} from "@/lib/domain/settlement";
import {
    isPartnerPaymentAutoLabel,
    isZeroCents,
    movesSettlementBalance,
    partnerShareOf,
    partnerPaymentDescription,
} from "@/lib/domain/expense";
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
export type RowSource = "expense" | "movement";

/** One balance-affecting row for the settlement journal. */
export type SettlementJournalItem = {
    id: string;
    date: Date;
    /** True when the row falls in the previous month ("Earlier months" divider). */
    carriedOver: boolean;
    /**
     * A CLOSED settlement cycle counted this row, so it is frozen server-side —
     * the same two-part fact the write paths refuse on: the row's cycle is
     * closed AND that cycle counted the row.
     *
     * The flag rides ON THE ROW rather than on a view's props: a locked row must
     * lose its edit/delete controls in every view, including one written later
     * that never heard of cycles. That only holds because EVERY producer of a
     * row derives the fact — an expense-backed row derived it as a hardcoded
     * `false` for two rounds, and the Month view, which passes no `readOnly`,
     * offered Edit and Delete on a payment inside a filed settlement.
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
          /** What you owe her for this row — the `-` it adds to the balance. */
          amount: number;
          /**
           * Which table the row lives in. A debt is a `Movement{gf_fronted}`
           * again (spec 0007 §6b) — settlement only. The field stays because
           * rows of one kind can still come from either table during a
           * conversion, and the two are edited through different actions: a view
           * that guessed would send half of them to the wrong table and report
           * "not found" for a row in plain sight.
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
           * Which table this row lives in. A payment you SENT is an
           * `Expense{isPartnerPayment:true}` now (spec 0007 §6b); money she sent
           * you, and any legacy `gf_paid`, are still movements.
           */
          source: RowSource;
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

/**
 * How a closed cycle ended, in words rather than a signed number: one of you
 * paid, or nobody had to.
 */
export type CycleOutcome =
    | { kind: "you_paid"; amount: number }
    | { kind: "partner_paid"; amount: number }
    | { kind: "even" };

/** The four figures the closed-cycle footer shows (spec 0007 §6b, slice H). */
export type ClosedCycleSummary = {
    /**
     * Everything the cycle bought, at full price — NO split applied. A shared
     * expense contributes its gross; a debt contributes what it recorded, which
     * is already his share and carries no gross to recover.
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
    /** The marker movement's id — the transfer that closed this cycle. */
    id: string;
    /** The closing transfer's own date, for display. */
    closedOn: Date;
    /** The closing transfer's amount — what it took to square the cycle. */
    settledAmount: number;
    journal: SettlementJournalItem[];
    /** The footer figures, derived from the SAME rows the journal shows. */
    summary: ClosedCycleSummary;
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

/**
 * Drop any legacy `gf_paid` movement that has already become a payment-expense.
 *
 * The conversion migration must reuse the movement's id for the expense it
 * creates — a REQUIREMENT on the deferred data PR, recorded in ADR-0024, and the
 * only thing that makes a converted pair recognisable without a join table. The
 * migration inserts and deletes together, so a twin should never exist. This
 * says "should never" out loud instead of trusting it: a partial restore, or a
 * data PR that assigns fresh ids, would otherwise count one payment twice, and a
 * silently doubled settlement figure is the kind of error nobody spots until
 * they pay it.
 *
 * The movement fallback is **transitional, not permanent**. Until CHORE-12 runs
 * the conversion, EVERY legacy `gf_paid` movement is still a movement; after it,
 * only an account whose payments it could not file (no `combined-expenses`
 * category) keeps any. Either way they count in the balance. Nothing writes
 * `gf_paid` anymore, so the set only shrinks.
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
 * Net the four balance inputs from a set of window rows (spec 0004 §2.4).
 *
 * Which table each side reads was REVERSED in spec 0007 §6b:
 *
 * | Side         | Source                                            |
 * | ------------ | ------------------------------------------------- |
 * | she owes you | your ordinary expenses, her share of each         |
 * | you owe her  | `gf_fronted` movements — settlement only          |
 * | you paid her | `Expense{isPartnerPayment}` (+ legacy `gf_paid`)  |
 * | she paid you | `gf_received` movements                           |
 *
 * The balance is **unchanged** by the reversal: the same money nets the same
 * way. Only the table each thing lives in moved.
 */
function inputsFrom(
    expenses: SettlementExpenseRow[],
    movements: SettlementMovementRow[],
): SettlementInputs {
    // Expenses split two ways: ordinary purchases of yours, where she owes you
    // her share, and payments you sent her, which draw the balance down. Each is
    // read once and only once — the sort happens before any summing, so no row
    // can land on both sides. `partnerShareTotal` sums
    // (amount − actualExpenditure), 0 for a solo expense, so summing the rest is
    // safe.
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
    for (const m of withoutConvertedTwins(movements, expenses)) {
        // A debt she fronted: settlement only, and provisional — something she
        // owes you can cancel it before any money moves, which is exactly why it
        // is not an expense (spec 0007 §6b).
        if (m.type === "gf_fronted") yourDebtToPartner += m.amount;
        else if (m.type === "gf_received") moneyPartnerPaidYou += m.amount;
        // LEGACY `gf_paid` (spec 0007 §6b): nothing writes this type anymore,
        // and the conversion to payment-expenses is deferred to CHORE-12, so
        // every existing one is still here. Counted, so no balance silently
        // loses a row before or after that conversion runs.
        else if (m.type === "gf_paid") moneyYouPaidPartner += m.amount;
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

    // Every close instant the user has filed — what makes a row's `locked` a
    // derivation instead of a column lookup. The Month view especially needs it:
    // it is a DATE window, so it always spans closed cycles.
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
            closes,
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
 * The closed cycle's four figures, read off THE SAME rows the journal renders —
 * never a second query and never a re-derivation, so the footer cannot disagree
 * with the rows above it.
 */
function summarizeCycle(rows: SettlementRowsByLine): ClosedCycleSummary {
    const sum = (list: { amount: number }[]): number =>
        roundCents(list.reduce((total, r) => total + r.amount, 0));

    // "No split applied": a shared expense contributes the full amount you paid,
    // not her share of it. A debt has no gross — what was recorded is already
    // your share — so it contributes that.
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
        sheOwed: sum(rows.partner_share),
        outcome: isZeroCents(net)
            ? { kind: "even" }
            : net > 0
              ? { kind: "you_paid", amount: net }
              : { kind: "partner_paid", amount: Math.abs(net) },
    };
}

/** The debt row's label when it was logged without a note. */
const debtDescription = (note: string | null, partnerName: string): string =>
    note?.trim() || `I owe ${partnerName}`;

/**
 * The transfer row's label when it was logged without a note. The outbound side
 * defers to `partnerPaymentDescription`, the same helper that names a
 * payment-EXPENSE, so a legacy `gf_paid` movement and its converted twin read
 * identically and no panel can invent a second wording.
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
 * The note behind a payment-expense's description, or null when it has none.
 *
 * A payment stores its note AS its description (`partnerPaymentDescription`),
 * so recovering the note means undoing that: the auto-generated fallback is
 * "no note", anything else is the user's own text. Carrying it is not cosmetic —
 * the journal's edit form prefills from this field and saves what it holds, so
 * a null here **overwrites the stored description with the fallback label** the
 * next time anyone edits the amount. The debt row has always done the same
 * thing with `debtDescription`; the payment row did not, and silently ate the
 * text.
 *
 * The test is the label's PREFIX, not the label built from the current partner
 * name: renaming the partner in Settings would otherwise leave every older
 * auto-label unmatched, and the journal would prefill the edit form with the
 * pre-rename label as if the user had typed it.
 */
function paymentNote(description: string): string | null {
    return isPartnerPaymentAutoLabel(description) ? null : description;
}

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

/**
 * Round each row to the cent, independently of the rows beside it.
 *
 * This replaces a reconciliation that handed the leftover cent to the newest
 * row. That leftover only existed because `actualExpenditure` was stored as the
 * raw product; new rows are now rounded at write time
 * (`computeActualExpenditure`), so there is nothing left to redistribute.
 *
 * Legacy rows still hold the raw unrounded product: the backfill is DEFERRED to
 * the data-migration PR (CHORE-12), and no migration in this branch touches
 * `actualExpenditure`. It does not matter here. The drift a Float carries is
 * about 1e-13, so rounding each row independently at read time lands on the same
 * cent as a stored rounded value would. That is why this guard stays: it is what
 * keeps an unmigrated row from rendering four decimals.
 *
 * What must never come back is the redistribution: it made a row's value depend
 * on which OTHER rows shared its view, which is how one expense read $383.99 in
 * the month panel and $384.00 in the history panel.
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
    /** Debt rows only: which table the row lives in. Null on every other line. */
    source: RowSource | null;
};

type SettlementRowsByLine = Record<SettlementBreakdownKey, SettlementRow[]>;

/**
 * Every row behind the balance, grouped by the breakdown line it belongs to,
 * newest first, each amount already reconciled to cents. This is the one source
 * both `buildBreakdownItems` and `buildJournal` read.
 *
 * `closes` is every cycle-close instant the user has filed. It is what makes
 * `locked` a DERIVED fact on every row rather than a column lookup: only a
 * transfer carries the marker column, but a cycle freezes every row it counted,
 * whichever table that row lives in.
 */
function buildSettlementRows(
    expenses: SettlementExpenseRow[],
    movements: SettlementMovementRow[],
    partnerName: string,
    closes: readonly Date[],
): SettlementRowsByLine {
    /**
     * Frozen means TWO things — the row's cycle is closed AND that cycle counted
     * the row. This is the SAME pair the three write paths refuse on
     * (`expense/update`, `expense/delete`, `expense/update-partner-payment`),
     * built from the same two helpers, so the locked set and the frozen set
     * cannot drift into disagreement.
     */
    const expenseLocked = (e: SettlementExpenseRow): boolean =>
        cycleCloseAtOrAfter(closes, e.createdAt) !== null &&
        movesSettlementBalance(e);
    const rows: SettlementRowsByLine = {
        partner_share: [],
        your_debt: [],
        partner_paid: [],
        you_paid: [],
    };

    // Sort the source rows, not the built ones: only the source carries
    // `createdAt`, the same-date tie-break.
    for (const e of [...expenses].sort(byNewest)) {
        // A payment you sent her draws the balance DOWN, so it lands on
        // `you_paid` and is never read for a partner share. The `continue` is
        // what keeps one payment on exactly one line — an edit that made
        // `amount` and `actualExpenditure` differ would otherwise leak a phantom
        // partner share out of the same row.
        if (e.isPartnerPayment) {
            rows.you_paid.push({
                line: "you_paid",
                source: "expense",
                id: e.id,
                date: e.date,
                description: e.description,
                amount: e.actualExpenditure,
                gross: null,
                // The row's REAL note, recovered from its description. The edit
                // form prefills from here and writes back what it finds, so a
                // hardcoded null was erasing the user's text on every edit.
                note: paymentNote(e.description),
                locked: expenseLocked(e),
            });
            continue;
        }

        // `partnerShareOf` + `isZeroCents` ARE `movesSettlementBalance`, the
        // predicate the closed-cycle freeze refuses on. One definition, so a
        // frozen row and a counted row can never be different sets.
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
            // Derived exactly like the expense side, and for the same reason: a
            // cycle freezes every row it COUNTED, not just the transfer that
            // carries its marker. Reading `m.closedAt` alone left a debt — which
            // can never hold the marker, the DB CHECK sees to that — editable
            // and deletable inside a filed settlement.
            locked:
                cycleCloseAtOrAfter(closes, m.createdAt) !== null &&
                movementMovesSettlementBalance(m.type),
        };
        if (m.type === "gf_fronted") {
            // A thing she fronted that you owe her — the "you owe" side, and
            // settlement's alone (spec 0007 §6b). The note is the label; blank
            // falls back.
            rows.your_debt.push({
                ...base,
                line: "your_debt",
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
                // A payment you sent is an expense now, so the journal's edit
                // and delete controls must reach the expense actions, not the
                // movement ones. `gf_received` and any legacy `gf_paid` are
                // still movements.
                source: row.source ?? "movement",
            });
        }
    }

    return items.sort(byNewest);
}
