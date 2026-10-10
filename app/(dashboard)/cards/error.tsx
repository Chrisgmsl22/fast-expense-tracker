"use client";

import { Button } from "@/components/ui/button";

export default function CardBalancesError({ reset }: { reset: () => void }) {
    return (
        <main className="p-4 sm:p-6 lg:p-8">
            <p className="text-sm text-destructive" role="alert">
                Couldn&apos;t load your card balances. Please try again.
            </p>
            <Button variant="outline" onClick={reset} className="mt-3">
                Retry
            </Button>
        </main>
    );
}
