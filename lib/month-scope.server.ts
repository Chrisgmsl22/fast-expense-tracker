// Server-only: `next/headers` throws if this is ever pulled into a client
// bundle, which is the guard here (the repo has no `server-only` package).
import { cookies } from "next/headers";

import { MONTH_COOKIE, resolveMonth } from "@/lib/month-scope";

/**
 * The I/O edge of `resolveMonth`: reads the remembered month off the request so
 * a server component can scope itself in one line. The ordering rule itself
 * stays pure and tested in `lib/month-scope.ts`.
 */
export async function getScopedMonth(param?: string | null): Promise<string> {
    const stored = (await cookies()).get(MONTH_COOKIE)?.value ?? null;
    return resolveMonth({ param, stored });
}
