"use client";

import {
    PolarAngleAxis,
    PolarGrid,
    Radar,
    RadarChart,
    ResponsiveContainer,
} from "recharts";
import { useTranslations } from "next-intl";

import { useCategoryName } from "@/i18n/category-name";
import { formatMxn } from "@/lib/format";
import type { TopCategory } from "@/lib/domain/dashboard";

/** Indigo fill for the radar area — a neutral accent, not a bucket/category color. */
const RADAR_COLOR = "#6366f1";

/**
 * "Where the money went" — the month's spending shape across the top categories.
 * A Recharts radar (needs ≥3 spokes to read as a shape) beside a high→low ranked
 * list with mini-bars. Data comes pre-sorted + capped from the dashboard service.
 */
export function SpendRadar({ categories }: { categories: TopCategory[] }) {
    const t = useTranslations("dashboard.radar");
    const categoryName = useCategoryName();
    // The radar labels its spokes from `name`, so the rows carry the shown name.
    const rows = categories.map((c) => ({ ...c, name: categoryName(c.name) }));
    const max = rows.reduce((m, c) => Math.max(m, c.spent), 0);
    const showRadar = rows.length >= 3;

    return (
        <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">{t("title")}</p>
            <p className="text-xs text-muted-foreground">{t("subtitle")}</p>

            {rows.length === 0 ? (
                <p className="mt-6 text-sm text-muted-foreground">
                    {t("empty")}
                </p>
            ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {showRadar && (
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart data={rows}>
                                    <PolarGrid />
                                    <PolarAngleAxis
                                        dataKey="name"
                                        tick={{ fontSize: 11, fill: "#6b7280" }}
                                    />
                                    <Radar
                                        dataKey="spent"
                                        stroke={RADAR_COLOR}
                                        fill={RADAR_COLOR}
                                        fillOpacity={0.3}
                                    />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    <ul
                        className={`flex flex-col justify-center gap-2 ${showRadar ? "" : "sm:col-span-2"}`}
                    >
                        {rows.map((c) => (
                            <li key={c.name}>
                                <div className="flex items-baseline justify-between text-sm">
                                    <span className="truncate">{c.name}</span>
                                    <span className="ml-2 font-semibold whitespace-nowrap">
                                        {formatMxn(c.spent)}
                                    </span>
                                </div>
                                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full"
                                        style={{
                                            width: `${max > 0 ? (c.spent / max) * 100 : 0}%`,
                                            backgroundColor: c.color,
                                        }}
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
