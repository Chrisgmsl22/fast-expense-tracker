"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import type {
    ClosedSettlementCycle,
    SettlementJournalItem,
} from "@/lib/services/settlement/settlement.service";
import { SettlementJournal } from "./SettlementJournal";

type View = "open" | "month" | "history";

/** "4 items" / "1 item" — what the corner measures. */
const itemCount = (n: number): string => `${n} ${n === 1 ? "item" : "items"}`;

/**
 * The three settlement views (spec 0007 §3.5), one visual style: the open cycle
 * (what is being settled now), the selected calendar month, and the settlements
 * closed in that month. All three render the same `SettlementJournal` rows — a
 * view is a projection of the one derivation in `getSettlement`, never a second
 * row component.
 *
 * The Month and History views follow the page's month switcher. The OPEN
 * settlement does not: there is exactly one, it is a "now" concept, and it is
 * not scoped to any month — so on a past month that tab is not offered at all
 * (see `isCurrentMonth`).
 */
export function SettlementViews({
    openJournal,
    monthJournal,
    monthLabel,
    isCurrentMonth,
    history,
    partnerName,
}: {
    openJournal: SettlementJournalItem[];
    monthJournal: SettlementJournalItem[];
    /** Human month name for the Month view and its tab ("September 2026"). */
    monthLabel: string;
    /** True when the selected month is the live one. */
    isCurrentMonth: boolean;
    history: ClosedSettlementCycle[];
    partnerName: string;
}) {
    // Past months have no open settlement to show, so the month is the landing
    // view there and the open tab is absent rather than lying or sitting dead.
    const tabs: { key: View; label: string }[] = [
        ...(isCurrentMonth
            ? [{ key: "open" as const, label: "Open settlement" }]
            : []),
        { key: "month", label: monthLabel },
        { key: "history", label: "History" },
    ];
    const [view, setView] = useState<View>(isCurrentMonth ? "open" : "month");
    // A month change re-renders this with a different tab set; if the open tab
    // went away, fall back to the month rather than showing an empty panel.
    const active: View = tabs.some((t) => t.key === view) ? view : "month";

    // The count measures what THIS view renders, not the dataset behind it.
    const renderedCount =
        active === "open"
            ? openJournal.length
            : active === "month"
              ? monthJournal.length
              : history.length;

    return (
        <div className="rounded-xl border p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div
                    role="tablist"
                    aria-label="Settlement views"
                    className="flex gap-1 rounded-lg bg-muted p-0.5"
                >
                    {tabs.map(({ key, label }) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={active === key}
                            aria-controls="settlement-view-panel"
                            onClick={() => setView(key)}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                active === key
                                    ? "bg-background shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                        {active === "history"
                            ? `${renderedCount} ${renderedCount === 1 ? "settlement" : "settlements"}`
                            : itemCount(renderedCount)}
                    </span>
                    {/* The descriptor names what a JOURNAL ROW can be, so it
                        belongs only beside a row count — History counts closed
                        settlements. The count leads either way, so a narrow
                        screen truncates the prose and not the number. */}
                    {active !== "history" && (
                        <span className="hidden sm:inline">
                            {" "}
                            · shared expenses · debts · transfers
                        </span>
                    )}
                </p>
            </div>

            <div id="settlement-view-panel" role="tabpanel" className="mt-3">
                {active === "open" && (
                    <SettlementJournal
                        bare
                        journal={openJournal}
                        partnerName={partnerName}
                        emptyMessage="This settlement is empty — nothing has been logged since the last close."
                    />
                )}
                {active === "month" && (
                    <>
                        {!isCurrentMonth && (
                            <p className="mb-3 text-xs text-muted-foreground">
                                {monthLabel} is a past month. The open
                                settlement is always the current one — switch
                                back to this month to see it.
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
                {active === "history" && (
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
                                <SettlementJournal
                                    bare
                                    readOnly
                                    journal={cycle.journal}
                                    partnerName={partnerName}
                                    emptyMessage="This settlement closed with no rows in it."
                                />
                            </div>
                        </CollapsiblePanel>
                    </Collapsible>
                </li>
            ))}
        </ul>
    );
}
