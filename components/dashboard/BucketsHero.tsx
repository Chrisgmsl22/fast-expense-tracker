import { Progress } from "@/components/ui/progress";
import { formatMxn } from "@/lib/format";
import type { Bucket, BucketKey } from "@/lib/domain/dashboard";

/**
 * The 50/25/25 buckets hero — Essentials / Discretionary /
 * Savings, each a card with a colored top border, the bucket's percentage,
 * spend, and a Progress bar vs its income-derived target. Essentials and
 * Discretionary turn danger when over; Savings is a goal — reaching its target
 * reads as "goal met" (positive), not over-budget.
 */
type BucketDisplay = {
    label: string;
    pct: string;
    border: string;
    text: string;
    bar: string;
};

// Literal class strings (not interpolated) so Tailwind keeps them.
const DISPLAY: Record<BucketKey, BucketDisplay> = {
    essentials: {
        label: "Essentials",
        pct: "50%",
        border: "border-t-bucket-essentials",
        text: "text-bucket-essentials",
        bar: "[&_[data-slot=progress-indicator]]:bg-bucket-essentials",
    },
    discretionary: {
        label: "Discretionary",
        pct: "25%",
        border: "border-t-bucket-discretionary",
        text: "text-bucket-discretionary",
        bar: "[&_[data-slot=progress-indicator]]:bg-bucket-discretionary",
    },
    savings: {
        label: "Savings/Inv",
        pct: "25%",
        border: "border-t-bucket-savings",
        text: "text-bucket-savings",
        bar: "[&_[data-slot=progress-indicator]]:bg-bucket-savings",
    },
};

const DANGER_BAR = "[&_[data-slot=progress-indicator]]:bg-danger";

/** The status line under a bucket amount: left / over / goal-met. */
function bucketStatus(bucket: Bucket): { text: string; danger: boolean } {
    const remaining = bucket.target - bucket.spent;
    if (bucket.key === "savings") {
        return bucket.spent >= bucket.target && bucket.target > 0
            ? { text: "goal met", danger: false }
            : { text: `${formatMxn(remaining)} to go`, danger: false };
    }
    return remaining < 0
        ? { text: `${formatMxn(-remaining)} over`, danger: true }
        : { text: `${formatMxn(remaining)} left`, danger: false };
}

export function BucketsHero({ buckets }: { buckets: Bucket[] }) {
    return (
        <div className="grid gap-4 sm:grid-cols-3">
            {buckets.map((bucket) => {
                const d = DISPLAY[bucket.key];
                const status = bucketStatus(bucket);
                const pct =
                    bucket.target > 0
                        ? Math.min(100, (bucket.spent / bucket.target) * 100)
                        : 0;
                return (
                    <div
                        key={bucket.key}
                        className={`rounded-lg border border-t-4 ${d.border} p-4`}
                    >
                        <div className="flex items-baseline justify-between">
                            <span className="text-sm font-medium">
                                {d.label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {d.pct}
                            </span>
                        </div>
                        <p className={`mt-1 text-2xl font-bold ${d.text}`}>
                            {formatMxn(bucket.spent)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            of {formatMxn(bucket.target)} ·{" "}
                            <span
                                className={
                                    status.danger ? "text-danger" : undefined
                                }
                            >
                                {status.text}
                            </span>
                        </p>
                        <Progress
                            value={pct}
                            aria-label={`${d.label} spend`}
                            className={`mt-3 ${status.danger ? DANGER_BAR : d.bar}`}
                        />
                    </div>
                );
            })}
        </div>
    );
}
