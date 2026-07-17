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
/** One "situation → what to log" row in the cheat-sheet. */
const operationsFor = (
    partnerName: string,
): { when: string; then: string }[] => [
    {
        when: "You pay for something shared",
        then: `Log it as a normal expense — ${partnerName}'s 32% is added to what she owes you automatically.`,
    },
    {
        when: `${partnerName} sends you money / pays you back`,
        then: `Add → "${partnerName} paid me" (or "Log a transfer" here). It lowers what she owes you — whatever you do with the money after is separate.`,
    },
    {
        when: `${partnerName} paid for shared things`,
        then: `"+ I owe ${partnerName}" here — your share. It raises what you owe her.`,
    },
    {
        when: `You end up owing ${partnerName}, so you pay her`,
        then: `"Log a transfer" here (it'll say "I paid ${partnerName}").`,
    },
    {
        when: "You pay off a credit card",
        then: `Add → Card payment. It just records the payment — it doesn't touch the settlement balance.`,
    },
];

/**
 * A small info button on the settlement header opening a cheat-sheet of the
 * common operations — a reminder of which entry to log for each situation, so
 * the flows are easy to recall.
 */
export function SettlementHelp({ partnerName }: { partnerName: string }) {
    const operations = operationsFor(partnerName);
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
                    {operations.map((op) => (
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
