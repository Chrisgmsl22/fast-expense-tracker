import { readFileSync } from "node:fs";
import { join } from "node:path";

import { db } from "@/lib/db";

/**
 * Replay a migration file against the test database, statement by statement, the
 * way `prisma migrate deploy` does.
 *
 * The file is READ FROM DISK on purpose. A test that re-types the SQL into a
 * constant proves only that the copy behaves — it cannot notice the deployed
 * statement changing underneath it, which is the one thing worth pinning about a
 * migration.
 */
export async function replayMigration(name: string): Promise<void> {
    const sql = readFileSync(
        join(process.cwd(), "prisma/migrations", name, "migration.sql"),
        "utf8",
    );
    for (const statement of splitStatements(sql)) {
        await db.$executeRawUnsafe(statement);
    }
}

/**
 * Split SQL on statement-terminating semicolons, ignoring any inside a quoted
 * literal or identifier. A plain `split(";")` would cut a statement in half the
 * first time a default value or a `COALESCE` fallback contains a semicolon, and
 * the failure would look like a syntax error in code that is actually fine.
 */
export function splitStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = "";
    let quote: "'" | '"' | null = null;
    let lineComment = false;

    for (let i = 0; i < sql.length; i += 1) {
        const char = sql[i]!;
        const next = sql[i + 1];

        if (lineComment) {
            if (char === "\n") lineComment = false;
            current += char;
            continue;
        }
        if (!quote && char === "-" && next === "-") {
            lineComment = true;
            current += char;
            continue;
        }
        if (quote) {
            current += char;
            // Doubled quote = an escaped quote inside the literal, not its end.
            if (char === quote && next === quote) {
                current += next;
                i += 1;
            } else if (char === quote) {
                quote = null;
            }
            continue;
        }
        if (char === "'" || char === '"') {
            quote = char;
            current += char;
            continue;
        }
        // A `$$ … $$` block is ONE statement however many semicolons it holds —
        // a DO block always holds several. Splitting inside it would hand
        // Postgres half a procedure and report a syntax error in SQL that is
        // perfectly valid.
        if (char === "$" && next === "$") {
            const close = sql.indexOf("$$", i + 2);
            const end = close === -1 ? sql.length : close + 2;
            current += sql.slice(i, end);
            i = end - 1;
            continue;
        }
        if (char === ";") {
            statements.push(current);
            current = "";
            continue;
        }
        current += char;
    }
    statements.push(current);

    // Drop anything that is only whitespace and comments — a trailing newline
    // after the last semicolon, for instance.
    return statements.filter(
        (s) => s.replace(/--[^\n]*/g, "").trim().length > 0,
    );
}
