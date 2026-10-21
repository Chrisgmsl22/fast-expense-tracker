import { useTranslations } from "next-intl";

import { Progress } from "@/components/ui/progress";
import { useBucketLabel } from "@/components/dashboard/bucket-label";
import { formatMxn } from "@/lib/format";
import type { Bucket, BucketKey } from "@/lib/domain/dashboard";

// Essentials and Discretionary turn danger when over their target. Savings is
// a goal: reaching its target reads as "goal met", not over-budget.
type BucketDisplay = {
    border: string;
    text: string;
    bar: string;
};

// Literal class strings (not interpolated) so Tailwind keeps them.
const DISPLAY: Record<BucketKey, BucketDisplay> = {
    essentials: {
        border: "border-t-bucket-essentials",
        text: "text-bucket-essentials",
        bar: "[&_[data-slot=progress-indicator]]:bg-bucket-essentials",
    },
    discretionary: {
        border: "border-t-bucket-discretionary",
        text: "text-bucket-discretionary",
        bar: "[&_[data-slot=progress-indicator]]:bg-bucket-discretionary",
    },
    savings: {
        border: "border-t-bucket-savings",
        text: "text-bucket-savings",
        bar: "[&_[data-slot=progress-indicator]]:bg-bucket-savings",
    },
};

const DANGER_BAR = "[&_[data-slot=progress-indicator]]:bg-danger";

type BucketStatus =
    | { kind: "goalMet"; danger: false }
    | { kind: "toGo" | "left"; amount: number; danger: false }
    | { kind: "over"; amount: number; danger: true };

/** The status line under a bucket amount: left / over / goal-met. */
function bucketStatus(bucket: Bucket): BucketStatus {
    const remaining = bucket.target - bucket.spent;
    if (bucket.key === "savings") {
        return remaining <= 0 && bucket.spent > 0
            ? { kind: "goalMet", danger: false }
            : { kind: "toGo", amount: remaining, danger: false };
    }
    return remaining < 0
        ? { kind: "over", amount: -remaining, danger: true }
        : { kind: "left", amount: remaining, danger: false };
}

/** A 0% bucket has no target to divide by: any spend fills it. */
function progressFill(bucket: Bucket): number {
    if (bucket.target <= 0) return bucket.spent > 0 ? 100 : 0;
    return Math.min(100, (bucket.spent / bucket.target) * 100);
}

export function BucketsHero({ buckets }: { buckets: Bucket[] }) {
    const t = useTranslations("dashboard.buckets");
    const bucketLabel = useBucketLabel();
    return (
        <div className="grid gap-4 sm:grid-cols-3">
            {buckets.map((bucket) => {
                const d = DISPLAY[bucket.key];
                const label = bucketLabel(bucket.key);
                const status = bucketStatus(bucket);
                const statusText =
                    status.kind === "goalMet"
                        ? t("goalMet")
                        : t(status.kind, { amount: formatMxn(status.amount) });
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
                                {label}
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
                            {t("ofTarget", {
                                target: formatMxn(bucket.target),
                            })}{" "}
                            ·{" "}
                            <span
                                className={
                                    status.danger ? "text-danger" : undefined
                                }
                            >
                                {statusText}
                            </span>
                        </p>
                        <Progress
                            value={fill}
                            aria-label={t("progressLabel", { bucket: label })}
                            className={`mt-3 ${status.danger ? DANGER_BAR : d.bar}`}
                        />
                    </div>
                );
            })}
        </div>
    );
}
