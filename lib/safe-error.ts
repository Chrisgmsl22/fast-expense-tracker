export type SafeErrorSummary = { name: string; code?: string };

// The class name and error code only. A Prisma or Auth.js message can echo the
// query arguments, which on signup hold an email and a password hash.
export function safeErrorSummary(error: unknown): SafeErrorSummary {
    if (!(error instanceof Error)) return { name: typeof error };
    const code =
        "code" in error && typeof error.code === "string"
            ? error.code
            : undefined;
    return code ? { name: error.name, code } : { name: error.name };
}
