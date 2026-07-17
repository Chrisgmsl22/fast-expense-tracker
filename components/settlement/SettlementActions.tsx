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

type Props = {
    /** Drives the transfer form's quick-settle prefill (net amount + side). */
    direction: SettlementDirection;
    /** The net balance magnitude, as a string for the amount input. */
    netAmount: number;
    partnerName: string;
};

/**
 * The two settlement actions (spec 0004 §3.3). "Log a transfer" opens the
 * transfer form **prefilled** with the net amount + the side that settles the
 * current balance (she owes → she pays you; you owe → you pay her). "+ I owe
 * {partner}" opens the debt form. Both refresh the server-rendered page on success.
 */
export function SettlementActions({
    direction,
    netAmount,
    partnerName,
}: Props) {
    const [transferOpen, setTransferOpen] = useState(false);
    const [debtOpen, setDebtOpen] = useState(false);
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
        setDebtOpen(false);
        router.refresh();
    }

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
                <DialogTrigger render={<Button>Log a transfer</Button>} />
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Log a transfer</DialogTitle>
                    </DialogHeader>
                    <TransferForm
                        direction={settleDirection}
                        initialAmount={prefillAmount}
                        partnerName={partnerName}
                        onCancel={() => setTransferOpen(false)}
                        onSuccess={onTransferDone}
                    />
                </DialogContent>
            </Dialog>

            <Dialog open={debtOpen} onOpenChange={setDebtOpen}>
                <DialogTrigger
                    render={
                        <Button variant="outline">{`+ I owe ${partnerName}`}</Button>
                    }
                />
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{`I owe ${partnerName}`}</DialogTitle>
                    </DialogHeader>
                    <PartnerDebtForm
                        partnerName={partnerName}
                        onCancel={() => setDebtOpen(false)}
                        onSuccess={onDebtDone}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}
