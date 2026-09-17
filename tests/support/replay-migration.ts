import { readFileSync } from "node:fs";
import { join } from "node:path";

import { db } from "@/lib/db";

/**
 * Replay a migration file against the test database the way `prisma migrate deploy`
 * does: every statement in the file inside ONE transaction, so a failure part-way
 * through leaves nothing behind. Running each statement on its own would give each an
 * implicit transaction of its own, and no test could then prove that an aborted
 * migration rolls the earlier statements back.
 *
 * The file is READ FROM DISK: a re-typed copy could not notice the deployed statement
 * changing underneath it.
 */
export async function replayMigration(name: string): Promise<void> {
    const sql = readFileSync(
        join(process.cwd(), "prisma/migrations", name, "migration.sql"),
        "utf8",
    );
    const statements = splitStatements(sql);
    await db.$transaction(
        async (tx) => {
            for (const statement of statements) {
                await tx.$executeRawUnsafe(statement);
            }
        },
        // A data migration over a seeded table outruns the 5s default.
        { maxWait: 10_000, timeout: 60_000 },
    );
}

/**
 * Split SQL on statement-terminating semicolons, ignoring any inside a quoted literal
 * or identifier — a plain `split(";")` would cut a statement in half.
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
        // A `$$ … $$` block is ONE statement however many semicolons it holds. Splitting
        // inside it hands Postgres half a procedure and reports a bogus syntax error.
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
