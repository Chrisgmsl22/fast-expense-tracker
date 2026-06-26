import { Button } from "@/components/ui/button";

export default function Home() {
    return (
        <main className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-md text-center space-y-4">
                <h1 className="text-3xl font-semibold tracking-tight">
                    fast-expense-tracker
                </h1>
                <p className="text-zinc-600 dark:text-zinc-400">
                    Phase 0 bootstrap complete. Features land in Phase 1.
                </p>
                <Button variant="outline" disabled>
                    Capture expense (Phase 1)
                </Button>
            </div>
        </main>
    );
}
