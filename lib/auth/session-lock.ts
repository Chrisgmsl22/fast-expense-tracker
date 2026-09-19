let pending: Promise<unknown> = Promise.resolve();

export async function withSessionLock<T>(
    operation: () => Promise<T>,
    signal?: AbortSignal,
): Promise<T> {
    const execute = () => {
        signal?.throwIfAborted();
        return operation();
    };
    if (navigator.locks) {
        return navigator.locks.request("fet:idle-session", { signal }, execute);
    }
    // An in-flight cookie write keeps the lock even if its caller stops waiting.
    const result = pending.then(execute, execute);
    pending = result.then(
        () => undefined,
        () => undefined,
    );
    return result;
}
