"use client";

import type { ReactNode } from "react";

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
    return (
        <Dialog>
            <DialogTrigger className={triggerClassName}>
                {trigger}
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{breakdown.monthLabel} breakdown</DialogTitle>
                    <DialogDescription>
                        What the month spent, grouped by which pot it came from
                    </DialogDescription>
                </DialogHeader>
                <MonthBreakdown {...breakdown} />
            </DialogContent>
        </Dialog>
    );
}
