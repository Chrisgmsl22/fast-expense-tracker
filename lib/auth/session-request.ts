export const SESSION_REQUEST_TIMEOUT_MS = 5_000;

export async function boundedSessionRequest<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
): Promise<T> {
    const request = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let cancel: () => void;
    const interrupted = new Promise<never>((_, reject) => {
        cancel = () => {
            request.abort();
            reject(new Error("Session request cancelled or timed out."));
        };
        timer = setTimeout(cancel, SESSION_REQUEST_TIMEOUT_MS);
        signal?.addEventListener("abort", cancel, { once: true });
        if (signal?.aborted) cancel();
    });
    try {
        const result = Promise.resolve().then(() => {
            request.signal.throwIfAborted();
            return operation(request.signal);
        });
        return await Promise.race([result, interrupted]);
    } finally {
        clearTimeout(timer!);
        signal?.removeEventListener("abort", cancel!);
        request.abort();
    }
}
