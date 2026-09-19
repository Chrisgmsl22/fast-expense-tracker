import { formatMxn, formatMxnWhole } from "@/lib/format";
import {
    TONE_COLOR,
    percentLabel,
    type MoneyTone,
} from "@/components/money/summary-model";

export type DonutSlice = {
    key: string;
    label: string;
    amount: number;
    tone: MoneyTone;
};

/**
 * A donut over slices that sum to `total`, with its legend. The ring is decorative —
 * every figure is in the legend beside it, which is what a screen reader reads.
 */
export function Donut({
    slices,
    total,
    centerCaption,
}: {
    slices: DonutSlice[];
    total: number;
    centerCaption: string;
}) {
    return (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
            <Ring slices={slices} total={total} centerCaption={centerCaption} />
            <ul className="w-full flex-1 space-y-2.5">
                {slices.map((slice) => {
                    const percent = percentLabel(slice.amount, total);
                    return (
                        <li
                            key={slice.key}
                            className="flex items-center gap-2 text-sm"
                        >
                            <span
                                aria-hidden
                                className="size-2.5 shrink-0 rounded-full"
                                style={{
                                    backgroundColor: TONE_COLOR[slice.tone],
                                }}
                            />
                            <span className="min-w-0 truncate text-muted-foreground">
                                {slice.label}
                            </span>
                            <span className="ml-auto font-semibold tabular-nums">
                                {formatMxn(slice.amount)}
                            </span>
                            {/* The mobile sheet has no room for a third column. */}
                            {percent && (
                                <span className="hidden w-10 text-right text-xs text-muted-foreground tabular-nums sm:inline">
                                    {percent}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** Circumference of the r=15.9 circle below, rounded so a slice length IS its percent. */
const RING_LENGTH = 100;

type Arc = DonutSlice & { length: number; offset: number };

/** Each arc starts where the last one ended; offset 25 puts the first at 12 o'clock. */
function toArcs(slices: DonutSlice[], total: number): Arc[] {
    let consumed = 0;
    return slices.map((slice) => {
        const length = total > 0 ? (slice.amount / total) * RING_LENGTH : 0;
        const arc = { ...slice, length, offset: 25 - consumed };
        consumed += length;
        return arc;
    });
}

function Ring({
    slices,
    total,
    centerCaption,
}: {
    slices: DonutSlice[];
    total: number;
    centerCaption: string;
}) {
    return (
        <div className="relative size-30 shrink-0">
            <svg aria-hidden viewBox="0 0 42 42" className="size-full">
                <circle
                    cx="21"
                    cy="21"
                    r="15.9"
                    fill="none"
                    strokeWidth="8"
                    className="stroke-muted"
                />
                {toArcs(slices, total).map((arc) => (
                    <circle
                        key={arc.key}
                        cx="21"
                        cy="21"
                        r="15.9"
                        fill="none"
                        strokeWidth="8"
                        stroke={TONE_COLOR[arc.tone]}
                        strokeDasharray={`${arc.length} ${RING_LENGTH - arc.length}`}
                        strokeDashoffset={arc.offset}
                    />
                ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                {/* No cents: the ring's hole cannot hold them, and the legend
                    beside it carries the exact figure. */}
                <span className="text-sm font-semibold tabular-nums">
                    {formatMxnWhole(total)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                    {centerCaption}
                </span>
            </div>
        </div>
    );
}
