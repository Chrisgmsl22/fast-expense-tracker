import { Progress } from "@/components/ui/progress";
import { formatMxn } from "@/lib/format";
import type { Bucket, BucketKey } from "@/lib/domain/dashboard";

// Essentials and Discretionary turn danger when over their target. Savings is
// a goal: reaching its target reads as "goal met", not over-budget.
type BucketDisplay = {
    label: string;
    border: string;
    text: string;
    bar: string;
};

// Literal class strings (not interpolated) so Tailwind keeps them.
const DISPLAY: Record<BucketKey, BucketDisplay> = {
    essentials: {
        label: "Essentials",
        border: "border-t-bucket-essentials",
        text: "text-bucket-essentials",
        bar: "[&_[data-slot=progress-indicator]]:bg-bucket-essentials",
    },
    discretionary: {
        label: "Discretionary",
        border: "border-t-bucket-discretionary",
        text: "text-bucket-discretionary",
        bar: "[&_[data-slot=progress-indicator]]:bg-bucket-discretionary",
    },
    savings: {
        label: "Savings/Inv",
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
        return remaining <= 0 && bucket.spent > 0
            ? { text: "goal met", danger: false }
            : { text: `${formatMxn(remaining)} to go`, danger: false };
    }
    return remaining < 0
        ? { text: `${formatMxn(-remaining)} over`, danger: true }
        : { text: `${formatMxn(remaining)} left`, danger: false };
}

/** A 0% bucket has no target to divide by: any spend fills it. */
function progressFill(bucket: Bucket): number {
    if (bucket.target <= 0) return bucket.spent > 0 ? 100 : 0;
    return Math.min(100, (bucket.spent / bucket.target) * 100);
}

export function BucketsHero({ buckets }: { buckets: Bucket[] }) {
    return (
        <div className="grid gap-4 sm:grid-cols-3">
            {buckets.map((bucket) => {
                const d = DISPLAY[bucket.key];
                const status = bucketStatus(bucket);
                const fill = progressFill(bucket);
                return (
                    <div
                        key={bucket.key}
                        className={`rounded-lg border border-t-4 ${status.danger ? "border-danger border-t-danger bg-danger-tint" : d.border} p-4`}
                    >
                        <div className="flex items-baseline justify-between">
                            <span
                                className={`text-sm font-medium${status.danger ? " text-danger" : ""}`}
                            >
                                {d.label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {bucket.percent}%
                            </span>
                        </div>
                        <p
                            className={`mt-1 text-2xl font-bold ${status.danger ? "text-danger" : d.text}`}
                        >
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
                            value={fill}
                            aria-label={`${d.label} spend`}
                            className={`mt-3 ${status.danger ? DANGER_BAR : d.bar}`}
                        />
                    </div>
                );
            })}
        </div>
    );
}
