"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { closeSettlementCycle } from "@/app/_actions/settlement/close-cycle";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

/**
 * The offer to close a squared settlement (spec 0007 §3.5). The action re-derives
 * the marker server-side, so this component sends no id.
 */
export function SettlementCloseCard({ partnerName }: { partnerName: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function confirmClose() {
        setError(null);
        startTransition(async () => {
            const res = await closeSettlementCycle();
            if (res.ok) {
                setOpen(false);
                // A double submit reports `alreadyClosed` and wrote nothing;
                // refreshing shows the already-open next cycle either way.
                router.refresh();
            } else {
                setError(res.message);
            }
        });
    }

    return (
        <div className="rounded-xl border border-positive bg-positive-tint p-4">
            <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-positive" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                        You and {partnerName} are square
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        Close this settlement to file it away. The next one
                        opens straight away, and anything you log from now on
                        joins it.
                    </p>
                </div>
                <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                        setError(null);
                        setOpen(true);
                    }}
                >
                    Close settlement
                </Button>
            </div>

            <Dialog
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    if (!next) setError(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Close this settlement?</DialogTitle>
                        <DialogDescription>
                            Everything logged so far is filed under this
                            settlement and stays there. A new settlement opens
                            immediately — a late shared expense joins that one,
                            not this one. Closed settlements cannot be reopened.
                        </DialogDescription>
                    </DialogHeader>
                    {error && (
                        <p className="text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={pending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={confirmClose}
                            disabled={pending}
                        >
                            {pending ? "Closing…" : "Close settlement"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
