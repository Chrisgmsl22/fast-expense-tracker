"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    MonthBreakdown,
    type MonthBreakdownProps,
} from "@/components/money/MonthBreakdown";

/** The strip that opens it passes its own trigger, so each chin keeps its shape. */
export function MonthBreakdownDialog({
    trigger,
    triggerClassName,
    ...breakdown
}: MonthBreakdownProps & {
    trigger: ReactNode;
    triggerClassName?: string;
}) {
    const t = useTranslations("money.breakdownDialog");
    return (
        <Dialog>
            <DialogTrigger className={triggerClassName}>
                {trigger}
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>
                        {t("title", { month: breakdown.monthLabel })}
                    </DialogTitle>
                    <DialogDescription>{t("description")}</DialogDescription>
                </DialogHeader>
                <MonthBreakdown {...breakdown} />
            </DialogContent>
        </Dialog>
    );
}
