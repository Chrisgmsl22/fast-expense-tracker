"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

import { debtLabel } from "@/components/movement/movement-display";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

/** Each "situation → what to log" row in the cheat-sheet, in reading order. */
const OPERATIONS = [
    { when: "sharedWhen", then: "sharedThen" },
    { when: "paidBackWhen", then: "paidBackThen" },
    { when: "frontedWhen", then: "frontedThen" },
    { when: "payHerWhen", then: "payHerThen" },
    { when: "cardWhen", then: "cardThen" },
    { when: "owesWhen", then: "owesThen" },
    { when: "zeroWhen", then: "zeroThen" },
] as const;

/**
 * A small info button on the settlement header opening a cheat-sheet of the
 * common operations — a reminder of which entry to log for each situation, so
 * the flows are easy to recall.
 */
export function SettlementHelp({ partnerName }: { partnerName: string }) {
    const t = useTranslations("settlement.help");
    const tActions = useTranslations("settlement.actions");
    const tAdd = useTranslations("expenses.add");
    const tm = useTranslations("movements");
    const partner = { partner: partnerName };
    // The sheet quotes real button and menu labels, so it reads them from the
    // same keys those controls use.
    const values = {
        ...partner,
        add: tAdd("titles.menu"),
        receive: tAdd("titles.receive", partner),
        transfer: tAdd("titles.transfer", partner),
        cardPayment: tAdd("types.cardPayment"),
        recordPayment: tActions("recordPayment"),
        iOwe: tActions("addDebt", {
            label: debtLabel("gf_fronted", partnerName, tm),
        }),
        owesMe: tActions("addDebt", {
            label: debtLabel("partner_debt", partnerName, tm),
        }),
    };
    return (
        <Dialog>
            <DialogTrigger
                render={
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("trigger")}
                    >
                        <Info className="size-4" />
                    </Button>
                }
            />
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                </DialogHeader>
                <ul className="flex flex-col gap-3 text-sm">
                    {OPERATIONS.map((op) => (
                        <li key={op.when}>
                            <p className="font-medium text-foreground">
                                {t(`ops.${op.when}`, values)}
                            </p>
                            <p className="text-muted-foreground">
                                {t(`ops.${op.then}`, values)}
                            </p>
                        </li>
                    ))}
                </ul>
            </DialogContent>
        </Dialog>
    );
}
