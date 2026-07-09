"use client";

import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { PARTNER_NAME } from "@/lib/partner";

/** One "situation → what to log" row in the cheat-sheet. */
const OPERATIONS: { when: string; then: string }[] = [
    {
        when: "You pay for something shared",
        then: `Log it as a normal expense — ${PARTNER_NAME}'s 32% is added to what she owes you automatically.`,
    },
    {
        when: `${PARTNER_NAME} pays you back and you put it straight on a card`,
        then: `Add → Card payment, with "Paid with ${PARTNER_NAME}'s money" on. One entry — settles the balance and records the card payment.`,
    },
    {
        when: `${PARTNER_NAME} paid for shared things`,
        then: `"+ I owe ${PARTNER_NAME}" here — your share. It lowers what she owes you.`,
    },
    {
        when: `You end up owing ${PARTNER_NAME}, so you pay her`,
        then: `"Log a transfer" here (it'll say "I paid ${PARTNER_NAME}").`,
    },
    {
        when: `${PARTNER_NAME} pays you back and you keep the cash`,
        then: `Add → "${PARTNER_NAME} paid me". (Don't also log a funded card payment — that double-counts.)`,
    },
];

/**
 * A small info button on the settlement header opening a cheat-sheet of the
 * common operations — a reminder of which entry to log for each situation, so
 * the flows are easy to recall.
 */
export function SettlementHelp() {
    return (
        <Dialog>
            <DialogTrigger
                render={
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="How to use settlement"
                    >
                        <Info className="size-4" />
                    </Button>
                }
            />
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Common operations</DialogTitle>
                </DialogHeader>
                <ul className="flex flex-col gap-3 text-sm">
                    {OPERATIONS.map((op) => (
                        <li key={op.when}>
                            <p className="font-medium text-foreground">
                                {op.when}
                            </p>
                            <p className="text-muted-foreground">{op.then}</p>
                        </li>
                    ))}
                </ul>
            </DialogContent>
        </Dialog>
    );
}
