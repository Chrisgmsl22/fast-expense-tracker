export function SessionExpiredNotice() {
    return (
        <p
            role="status"
            className="rounded-lg border border-destructive/30 bg-red-50 px-3 py-2 text-sm text-destructive"
        >
            Your session expired. Please log back in.
        </p>
    );
}
