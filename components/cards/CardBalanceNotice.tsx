import { ChevronRight, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";

const RULES = [
    "fullAmount",
    "payments",
    "partnerMoney",
    "cashDebit",
    "archived",
] as const;

/** The standing work-in-progress notice and the rules behind every balance. */
export function CardBalanceNotice() {
    const t = useTranslations("money.cards.notice");
    return (
        <aside
            aria-label={t("region")}
            className="rounded-xl border bg-muted/60 px-4 py-3 text-sm"
        >
            <p className="flex items-start gap-2">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                    <strong>{t("lead")}</strong> {t("body")}
                </span>
            </p>
            <Collapsible className="mt-2 pl-6">
                <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                    <ChevronRight
                        aria-hidden
                        className="size-3.5 transition-transform group-data-[panel-open]:rotate-90"
                    />
                    {t("howItWorks")}
                </CollapsibleTrigger>
                <CollapsiblePanel>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                        {RULES.map((rule) => (
                            <li key={rule}>{t(`rules.${rule}`)}</li>
                        ))}
                    </ul>
                </CollapsiblePanel>
            </Collapsible>
        </aside>
    );
}
