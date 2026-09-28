"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TotalsBar } from "@/components/money/TotalsBar";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import type {
    ClosedCycleSummary,
    ClosedSettlementCycle,
    CycleOutcome,
    SettlementJournalItem,
} from "@/lib/services/settlement/settlement.service";
import { CopySettlementButton } from "./CopySettlementButton";
import { SettlementJournal } from "./SettlementJournal";
import type { MonthPosition } from "./month-position";

type View = "open" | "month" | "history";

/** "September 2026" → "Sep 2026". */
const shortMonthLabel = (label: string): string =>
    label.replace(/^(\p{L}{3})\p{L}*/u, "$1");

/** "4 items" / "1 item" — what the corner measures. */
const itemCount = (n: number): string => `${n} ${n === 1 ? "item" : "items"}`;

/**
 * The open cycle has no month, so its tab stays visible for every month.
 */
export function SettlementViews({
    openJournal,
    monthJournal,
    monthLabel,
    monthPosition,
    history,
    partnerName,
}: {
    openJournal: SettlementJournalItem[];
    monthJournal: SettlementJournalItem[];
    /** Human month name for the Month view and its tab ("September 2026"). */
    monthLabel: string;
    monthPosition: MonthPosition;
    history: ClosedSettlementCycle[];
    partnerName: string;
}) {
    // A phone shows the short labels so the copy button fits on the tablist
    // line; the full label stays the tab's accessible name.
    const tabs: { key: View; label: string; short: string }[] = [
        { key: "open", label: "Open settlement", short: "Open" },
        { key: "month", label: monthLabel, short: shortMonthLabel(monthLabel) },
        { key: "history", label: "History", short: "History" },
    ];
    // Sets the tab only at mount; a later month change is a soft navigation
    // that keeps this component mounted, so the initialiser never re-runs
    // and the tab in effect persists, whoever set it.
    const [view, setView] = useState<View>(
        monthPosition === "current" ? "open" : "month",
    );

    // The count measures what THIS view renders, not the dataset behind it.
    const renderedCount =
        view === "open"
            ? openJournal.length
            : view === "month"
              ? monthJournal.length
              : history.length;

    return (
        <div className="rounded-xl border p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                    role="tablist"
                    aria-label="Settlement views"
                    className="flex shrink-0 gap-1 rounded-lg bg-muted p-0.5"
                >
                    {tabs.map(({ key, label, short }) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-label={label}
                            aria-selected={view === key}
                            aria-controls="settlement-view-panel"
                            onClick={() => setView(key)}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                view === key
                                    ? "bg-background shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {short === label ? (
                                label
                            ) : (
                                <>
                                    <span className="sm:hidden">{short}</span>
                                    <span className="hidden sm:inline">
                                        {label}
                                    </span>
                                </>
                            )}
                        </button>
                    ))}
                </div>
                {/* The slot's wrap size is only the count and the button: the
                    descriptor is `w-0`, so it takes what the line has left and
                    truncates. That keeps the copy button on the tablist line
                    without making the Open tab's header taller than the others. */}
                <div className="flex min-w-0 grow items-center justify-end gap-2">
                    <p className="flex min-w-0 grow justify-end text-xs text-muted-foreground">
                        <span className="shrink-0 font-medium text-foreground">
                            {view === "history"
                                ? `${renderedCount} ${renderedCount === 1 ? "settlement" : "settlements"}`
                                : itemCount(renderedCount)}
                        </span>
                        {/* The descriptor names what a JOURNAL ROW can be, so it
                            belongs only beside a row count — History counts closed
                            settlements. The count leads either way, so a narrow
                            screen truncates the prose and not the number. */}
                        {view !== "history" && (
                            <span className="hidden w-0 max-w-fit grow truncate sm:block">
                                {/* Non-breaking: a plain space at the start
                                    of a truncated block collapses away. */}
                                {" "}· shared expenses · debts · transfers
                            </span>
                        )}
                    </p>
                    {view === "open" && (
                        <CopySettlementButton
                            journal={openJournal}
                            partnerName={partnerName}
                            scope="open"
                        />
                    )}
                </div>
            </div>

            <div id="settlement-view-panel" role="tabpanel" className="mt-3">
                {view === "open" && (
                    <SettlementJournal
                        bare
                        journal={openJournal}
                        partnerName={partnerName}
                        emptyMessage="This settlement is empty — nothing has been logged since the last close."
                    />
                )}
                {view === "month" && (
                    <>
                        {monthPosition !== "current" && (
                            <p className="mb-3 text-xs text-muted-foreground">
                                {monthPosition === "past"
                                    ? `${monthLabel} has ended. This is what it held — the open settlement is on its own tab.`
                                    : `${monthLabel} has not started. This is what is already dated to it — the open settlement is on its own tab.`}
                            </p>
                        )}
                        <SettlementJournal
                            bare
                            journal={monthJournal}
                            partnerName={partnerName}
                            emptyMessage={`No shared expenses or transfers in ${monthLabel}.`}
                        />
                    </>
                )}
                {view === "history" && (
                    <ClosedCycles
                        history={history}
                        monthLabel={monthLabel}
                        partnerName={partnerName}
                    />
                )}
            </div>
        </div>
    );
}

/** How the cycle ended, in words rather than a signed number. */
function outcomeText(outcome: CycleOutcome, partnerName: string): string {
    if (outcome.kind === "even") return "Came out even";
    return outcome.kind === "you_paid"
        ? `You paid ${partnerName}`
        : `${partnerName} paid you`;
}

/**
 * The closed cycle's four figures. Every one comes from `cycle.summary`, derived
 * from the same rows rendered above — so the footer cannot quote money the rows do not.
 */
function CycleSummaryFooter({
    summary,
    partnerName,
}: {
    summary: ClosedCycleSummary;
    partnerName: string;
}) {
    return (
        <TotalsBar
            className="mt-3"
            testId="cycle-summary"
            items={[
                {
                    label: "Spent (unsplit)",
                    value: formatMxn(summary.spentUnsplit),
                },
                {
                    label: `You owed ${partnerName}`,
                    value: formatMxn(summary.youOwed),
                },
                {
                    label: `${partnerName} owed you`,
                    value: formatMxn(summary.sheOwed),
                },
                {
                    label: outcomeText(summary.outcome, partnerName),
                    value:
                        summary.outcome.kind === "even"
                            ? "—"
                            : formatMxn(summary.outcome.amount),
                    tone: "strong",
                },
            ]}
        />
    );
}

/** Cycles closed in the selected month, newest first, each openable. */
function ClosedCycles({
    history,
    monthLabel,
    partnerName,
}: {
    history: ClosedSettlementCycle[];
    monthLabel: string;
    partnerName: string;
}) {
    if (history.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No settlement was closed in {monthLabel}. When a balance reaches
                zero you can close it, and it is filed under the month you
                closed it in.
            </p>
        );
    }

    return (
        <ul className="divide-y">
            {history.map((cycle) => (
                <li key={cycle.id} className="py-1">
                    <Collapsible>
                        <CollapsibleTrigger
                            aria-controls={`cycle-${cycle.id}`}
                            className="group flex w-full items-center justify-between gap-3 py-1.5 text-left text-sm hover:bg-muted/50"
                        >
                            <span className="flex min-w-0 items-center gap-1.5">
                                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-90" />
                                <span className="truncate font-medium">
                                    Settled {formatExpenseDate(cycle.closedOn)}
                                </span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                {formatMxn(cycle.settledAmount)} ·{" "}
                                {cycle.journal.length} rows
                            </span>
                        </CollapsibleTrigger>
                        {/* Kept mounted (and `hidden` while closed) so the
                            trigger's `aria-controls` always points at a real
                            element — Base UI drops it when the panel unmounts. */}
                        <CollapsiblePanel id={`cycle-${cycle.id}`} keepMounted>
                            <div className="mb-2 ml-5 border-l pl-3">
                                {/* In the panel, not the trigger: a button
                                    inside a button is invalid markup. The
                                    panel clips overflow, so the padding keeps
                                    the button's 8px touch margin inside it. */}
                                {cycle.journal.length > 0 && (
                                    <div className="flex justify-end pt-2 pr-2">
                                        <CopySettlementButton
                                            journal={cycle.journal}
                                            partnerName={partnerName}
                                            scope="closed"
                                        />
                                    </div>
                                )}
                                <SettlementJournal
                                    bare
                                    readOnly
                                    journal={cycle.journal}
                                    partnerName={partnerName}
                                    emptyMessage="This settlement closed with no rows in it."
                                />
                                <CycleSummaryFooter
                                    summary={cycle.summary}
                                    partnerName={partnerName}
                                />
                            </div>
                        </CollapsiblePanel>
                    </Collapsible>
                </li>
            ))}
        </ul>
    );
}
