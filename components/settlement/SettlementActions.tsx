"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { PartnerDebtForm } from "@/components/movement/PartnerDebtForm";
import { TransferForm } from "@/components/movement/TransferForm";
import type { SettlementDirection } from "@/lib/domain/settlement";
import {
    PARTNER_DEBT_TYPES,
    partnerDebtLabel,
    type PartnerDebtDirection,
} from "@/lib/domain/movement";

type Props = {
    /** Drives the transfer form's quick-settle prefill (net amount + side). */
    direction: SettlementDirection;
    /** The net balance magnitude, as a string for the amount input. */
    netAmount: number;
    partnerName: string;
    /**
     * Shown inside every dialog while the screen is on a past month: a modal covers
     * the page, so the page's own warning is invisible when it matters most.
     */
    pastMonthNotice?: string;
};

/**
 * The settlement actions (spec 0007). "Record payment" opens the
 * transfer form **prefilled** with the net amount + the side that settles the
 * current balance (she owes → she pays you; you owe → you pay her). "+ I owe
 * {partner}" and "+ {partner} owes me" open the debt form in opposite directions.
 * A zero balance hides the payment action; both debt actions remain available.
 */
export function SettlementActions({
    direction,
    netAmount,
    partnerName,
    pastMonthNotice,
}: Props) {
    const [transferOpen, setTransferOpen] = useState(false);
    const [debtOpen, setDebtOpen] = useState<PartnerDebtDirection | null>(null);
    const router = useRouter();

    // Settle toward zero: if she owes you, the settling transfer is her paying
    // you; if you owe her, it's you paying her. When settled, default to "I paid".
    const settleDirection =
        direction === "she_owes" ? "gf_received" : "gf_paid";
    const prefillAmount = direction === "settled" ? "" : String(netAmount);

    function onTransferDone() {
        setTransferOpen(false);
        router.refresh();
    }
    function onDebtDone() {
        setDebtOpen(null);
        router.refresh();
    }

    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {direction !== "settled" && (
                <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
                    <DialogTrigger render={<Button>Record payment</Button>} />
                    <DialogContent className="sm:max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Record payment</DialogTitle>
                        </DialogHeader>
                        {pastMonthNotice && (
                            <p className="text-sm text-muted-foreground">
                                {pastMonthNotice}
                            </p>
                        )}
                        <TransferForm
                            direction={settleDirection}
                            initialAmount={prefillAmount}
                            partnerName={partnerName}
                            onCancel={() => setTransferOpen(false)}
                            onSuccess={onTransferDone}
                        />
                    </DialogContent>
                </Dialog>
            )}

            {PARTNER_DEBT_TYPES.map((debtDirection) => (
                <Dialog
                    key={debtDirection}
                    open={debtOpen === debtDirection}
                    onOpenChange={(open) =>
                        setDebtOpen(open ? debtDirection : null)
                    }
                >
                    <DialogTrigger
                        render={
                            <Button variant="outline">{`+ ${partnerDebtLabel(debtDirection, partnerName)}`}</Button>
                        }
                    />
                    <DialogContent className="sm:max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>
                                {partnerDebtLabel(debtDirection, partnerName)}
                            </DialogTitle>
                        </DialogHeader>
                        {pastMonthNotice && (
                            <p className="text-sm text-muted-foreground">
                                {pastMonthNotice}
                            </p>
                        )}
                        <PartnerDebtForm
                            direction={debtDirection}
                            partnerName={partnerName}
                            onCancel={() => setDebtOpen(null)}
                            onSuccess={onDebtDone}
                        />
                    </DialogContent>
                </Dialog>
            ))}
        </div>
    );
}
