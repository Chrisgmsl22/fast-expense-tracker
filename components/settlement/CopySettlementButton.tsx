"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SettlementJournalItem } from "@/lib/services/settlement/settlement.service";
import {
    buildSettlementSummaryText,
    type SettlementSummaryScope,
} from "./settlement-summary-text";

type CopyStatus = "idle" | "copied" | "failed";

const COPIED_MS = 2000;

export function CopySettlementButton({
    journal,
    partnerName,
    scope,
}: {
    journal: SettlementJournalItem[];
    partnerName: string;
    scope: SettlementSummaryScope;
}) {
    const t = useTranslations("settlement");
    const tm = useTranslations("movements");
    const locale = useLocale();
    const copyLabel = t("copy.label");
    const [status, setStatus] = useState<CopyStatus>("idle");
    // Bumped on every success, so a repeat copy restarts the timer and the
    // re-keyed live text is announced again.
    const [copies, setCopies] = useState(0);

    useEffect(() => {
        if (status !== "copied") return;
        const timer = setTimeout(() => setStatus("idle"), COPIED_MS);
        return () => clearTimeout(timer);
    }, [status, copies]);

    if (journal.length === 0) return null;

    async function copy() {
        // Undefined outside a secure context (plain-http LAN dev, old browsers).
        if (!navigator.clipboard) {
            setStatus("failed");
            return;
        }
        try {
            await navigator.clipboard.writeText(
                buildSettlementSummaryText(journal, partnerName, scope, {
                    t,
                    tm,
                    locale,
                }),
            );
            setStatus("copied");
            setCopies((n) => n + 1);
        } catch {
            setStatus("failed");
        }
    }

    return (
        <span className="relative flex shrink-0">
            <Tooltip>
                <TooltipTrigger
                    render={
                        <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            aria-label={copyLabel}
                            onClick={copy}
                            // An out-of-flow touch target of at least 40px (the
                            // inset counts from inside the 1px border: 26 + 16),
                            // so the header keeps the tablist's height.
                            className="relative after:absolute after:-inset-2"
                        />
                    }
                >
                    {status === "copied" ? <Check /> : <Copy />}
                </TooltipTrigger>
                {/* While open, the portalled popup is text in the
                    accessibility tree. The aria-label already says it, so
                    hide the popup rather than announce it twice. */}
                <TooltipContent aria-hidden="true">{copyLabel}</TooltipContent>
            </Tooltip>
            {/* Out of flow, under the icon: both hosts right-align the button,
                so text in the flow would push the icon sideways. */}
            <span
                aria-live="polite"
                className="absolute top-full right-0 z-10 mt-1 whitespace-nowrap"
            >
                {status === "copied" && (
                    <span key={copies} className="sr-only">
                        {t("copy.copied")}
                    </span>
                )}
                {status === "failed" && (
                    <span className="rounded bg-background px-1 text-xs text-destructive">
                        {t("copy.failed")}
                    </span>
                )}
            </span>
        </span>
    );
}
