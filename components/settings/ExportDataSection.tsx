"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ExportDataSection({ currentMonth }: { currentMonth: string }) {
    const t = useTranslations("settings.export");
    const id = useId();
    const [type, setType] = useState("year");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    async function download(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        setPending(true);
        try {
            const response = await fetch(
                "/api/financial-export?" +
                    new URLSearchParams({
                        type,
                        period: String(form.get("period") ?? ""),
                    }),
            );
            if (!response.ok) {
                if (response.status === 404) {
                    const result: unknown = await response.json();
                    if (
                        typeof result === "object" &&
                        result !== null &&
                        "code" in result &&
                        result.code === "no_data"
                    ) {
                        setError(
                            t(type === "year" ? "noDataYear" : "noDataMonth"),
                        );
                        return;
                    }
                }
                setError(
                    t(
                        response.status === 401
                            ? "unauthenticated"
                            : response.status === 400
                              ? "invalid"
                              : "failed",
                    ),
                );
                return;
            }
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement("a");
            link.href = url;
            link.download = "financial-export-" + form.get("period") + ".xlsx";
            document.body.appendChild(link);
            link.click();
            link.remove();
            // Allow the browser to consume the object URL before releasing it.
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
            setError(t("failed"));
        } finally {
            setPending(false);
        }
    }
    return (
        <section aria-labelledby={id} className="rounded-xl border p-5">
            <h2 id={id} className="font-semibold">
                {t("title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
                {t("description")}
            </p>
            <form
                onSubmit={download}
                className="mt-4 flex flex-wrap items-end gap-3"
                aria-busy={pending}
            >
                <div className="flex w-28 flex-col gap-1">
                    <label htmlFor={id + "-type"} className="block text-sm">
                        {t("periodType")}
                    </label>
                    <div className="relative">
                        <select
                            id={id + "-type"}
                            value={type}
                            disabled={pending}
                            onChange={(event) => {
                                setType(event.target.value);
                                setError(null);
                            }}
                            className="block h-10 w-full min-w-0 appearance-none rounded-lg border border-input bg-background py-1 pl-3 pr-9 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                        >
                            <option value="year">{t("year")}</option>
                            <option value="month">{t("month")}</option>
                        </select>
                        <ChevronDown
                            aria-hidden="true"
                            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                        />
                    </div>
                </div>
                <div
                    className={
                        type === "year"
                            ? "flex w-28 min-w-0 flex-col gap-1"
                            : "flex w-48 min-w-0 max-w-full flex-col gap-1"
                    }
                >
                    <label htmlFor={id + "-period"} className="block text-sm">
                        {t(type === "year" ? "year" : "month")}
                    </label>
                    <Input
                        key={type}
                        id={id + "-period"}
                        name="period"
                        type={type === "year" ? "number" : "month"}
                        min={type === "year" ? "1900" : "1900-01"}
                        defaultValue={
                            type === "year"
                                ? currentMonth.slice(0, 4)
                                : currentMonth
                        }
                        onChange={() => setError(null)}
                        required
                        disabled={pending}
                        aria-describedby={error ? id + "-error" : undefined}
                    />
                </div>
                <Button type="submit" disabled={pending} className="h-10">
                    {t(pending ? "downloading" : "download")}
                </Button>
            </form>
            {error && (
                <p
                    id={id + "-error"}
                    role="alert"
                    className="mt-3 text-sm text-destructive"
                >
                    {error}
                </p>
            )}
        </section>
    );
}
