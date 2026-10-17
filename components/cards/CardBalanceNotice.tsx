import { ChevronRight, Info } from "lucide-react";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";

const RULES = [
    "Charges count at their full amount, even when you split them.",
    "Card payments lower the balance.",
    "Partner money, insurance refunds and the reimbursed toggle do not change it.",
    "Cash and debit cards spend money you already have, so they are not listed. Transfers to Savings are not card charges.",
    "Archived cards are not listed.",
] as const;

/** The standing work-in-progress notice and the rules behind every balance. */
export function CardBalanceNotice() {
    return (
        <aside
            aria-label="Work in progress"
            className="rounded-xl border bg-muted/60 px-4 py-3 text-sm"
        >
            <p className="flex items-start gap-2">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                    <strong>Work in progress:</strong> balances may not match
                    your bank yet. They count only the card payments you logged.
                </span>
            </p>
            <Collapsible className="mt-2 pl-6">
                <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                    <ChevronRight
                        aria-hidden
                        className="size-3.5 transition-transform group-data-[panel-open]:rotate-90"
                    />
                    How this balance works
                </CollapsibleTrigger>
                <CollapsiblePanel>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                        {RULES.map((rule) => (
                            <li key={rule}>{rule}</li>
                        ))}
                    </ul>
                </CollapsiblePanel>
            </Collapsible>
        </aside>
    );
}
