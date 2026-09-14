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

const VIEW_LABELS: Record<View, string> = {
    open: "Open settlement",
    month: "This month",
    history: "History",
};

/**
 * The three settlement views (spec 0007 §3.5), one visual style: the open cycle
 * (what is being settled now), the calendar month, and the closed cycles. All
 * three render the same `SettlementJournal` rows — a view is a projection of the
 * one derivation in `getSettlement`, never a second row component.
 */
export function SettlementViews({
    openJournal,
    monthJournal,
    monthLabel,
    history,
    partnerName,
}: {
    openJournal: SettlementJournalItem[];
    monthJournal: SettlementJournalItem[];
    /** Human month name for the Month view ("September"). */
    monthLabel: string;
    history: ClosedSettlementCycle[];
    partnerName: string;
}) {
    const [view, setView] = useState<View>("open");

    return (
        <div className="rounded-xl border p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div
                    role="tablist"
                    aria-label="Settlement views"
                    className="flex gap-1 rounded-lg bg-muted p-0.5"
                >
                    {(Object.keys(VIEW_LABELS) as View[]).map((key) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={view === key}
                            aria-controls="settlement-view-panel"
                            onClick={() => setView(key)}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                view === key
                                    ? "bg-background shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {VIEW_LABELS[key]}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">
                    shared expenses · debts · transfers
                </p>
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
                    <SettlementJournal
                        bare
                        journal={monthJournal}
                        partnerName={partnerName}
                        emptyMessage={`No shared expenses or transfers in ${monthLabel}.`}
                    />
                )}
                {view === "history" && (
                    <ClosedCycles history={history} partnerName={partnerName} />
                )}
            </div>
        </div>
    );
}

/** Closed cycles, newest first, each opening to the rows it contained. */
function ClosedCycles({
    history,
    partnerName,
}: {
    history: ClosedSettlementCycle[];
    partnerName: string;
}) {
    if (history.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No settlements closed yet. When a balance reaches zero you can
                close it, and it shows up here.
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
