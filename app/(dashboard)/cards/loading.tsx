export default function Loading() {
    return (
        <main className="p-4 sm:p-6 lg:p-8">
            <div className="h-8 w-48 animate-pulse rounded bg-muted" />
            <div className="mt-6 h-28 animate-pulse rounded-xl bg-muted" />
            <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                <div className="h-64 animate-pulse rounded-xl bg-muted" />
                <div className="h-64 animate-pulse rounded-xl bg-muted" />
                <div className="h-64 animate-pulse rounded-xl bg-muted" />
            </div>
        </main>
    );
}
