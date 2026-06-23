"use client";

import { Button } from "@/components/ui/button";

// Error message is intentionally generic — don't surface DB internals to the user.
export default function ExpensesError({ reset }: { reset: () => void }) {
    return (
        <main className="p-8">
            <p className="text-sm text-red-600" role="alert">
                Couldn&apos;t load your expenses. Please try again.
            </p>
            <Button variant="outline" onClick={reset} className="mt-3">
                Retry
            </Button>
        </main>
    );
}
