import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import type { BucketKey } from "@/lib/domain/dashboard";
import { formatMxn } from "@/lib/format";

const BUCKET_LABEL: Record<BucketKey, string> = {
    essentials: "Essentials",
    discretionary: "Discretionary",
    savings: "Savings/Inv",
};

/**
 * Category-detail header: a Back link to the dashboard (month preserved), the
 * category's color dot + name + 50/25/25 bucket tag, and the over/under budget
 * badge (teal when under, danger when over). The badge is shown only when a
 * limit is set.
 */
export function CategoryDetailHeader({
    name,
    color,
    bucket,
    hasLimit,
    remaining,
    over,
    backHref,
}: {
    name: string;
    color: string;
    bucket: BucketKey | null;
    hasLimit: boolean;
    remaining: number | null;
    over: boolean;
    backHref: string;
}) {
    return (
        <div className="flex flex-wrap items-center gap-3">
            <Link
                href={backHref}
                aria-label="Back"
                className="flex items-center gap-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
                <ChevronLeft className="size-4" aria-hidden />
                <span className="hidden sm:inline">Back</span>
            </Link>
            <span
                aria-hidden
                className="size-3.5 shrink-0 rounded-sm"
                style={{ backgroundColor: color }}
            />
            <h1 className="text-2xl font-semibold">{name}</h1>
            {bucket && (
                <span className="hidden rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground sm:inline-block">
                    {BUCKET_LABEL[bucket]}
                </span>
            )}
            {hasLimit && remaining !== null && (
                <span
                    className={`ml-auto hidden rounded-full px-3 py-1 text-sm font-medium sm:inline-block ${
                        over
                            ? "bg-danger-tint text-danger"
                            : "bg-positive-tint text-positive"
                    }`}
                >
                    {over
                        ? `over by ${formatMxn(-remaining)}`
                        : `${formatMxn(remaining)} left`}
                </span>
            )}
        </div>
    );
}
