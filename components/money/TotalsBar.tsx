import type { ReactNode } from "react";

/**
 * One figure in a totals bar. `highlight` is the figure the eye should land on,
 * `strong` a closing total behind a divider.
 */
export type TotalsItem = {
    label: ReactNode;
    value: string;
    tone?: "plain" | "highlight" | "strong";
};

/**
 * The dark pill-shaped totals bar, shared by the expenses list and the settlement's
 * closed-cycle footer. Layout only: the caller computes every figure.
 */
export function TotalsBar({
    items,
    testId,
    className = "",
}: {
    items: TotalsItem[];
    testId?: string;
    className?: string;
}) {
    return (
        <div
            data-testid={testId}
            className={`flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-lg bg-foreground px-5 py-3 text-sm text-background ${className}`}
        >
            {items.map((item, i) => (
                <span
                    key={i}
                    className={
                        item.tone === "strong"
                            ? "border-background/20 text-background/70 sm:border-l sm:pl-6"
                            : "text-background/70"
                    }
                >
                    {item.label}{" "}
                    <span
                        className={
                            item.tone === "highlight"
                                ? "rounded-full bg-spent-tint px-2 py-0.5 font-semibold text-spent"
                                : item.tone === "strong"
                                  ? "ml-1 text-base font-semibold text-background"
                                  : "font-semibold text-background"
                        }
                    >
                        {item.value}
                    </span>
                </span>
            ))}
        </div>
    );
}
