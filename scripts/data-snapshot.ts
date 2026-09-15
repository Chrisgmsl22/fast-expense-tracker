// Read-only snapshot of the LOCAL development database, so a session can do
// arithmetic on real rows instead of inferring behaviour from the schema.
//
// Run with `pnpm data:snapshot` (loads .env.local, like `db:seed`). Two safety
// properties, both enforced at runtime rather than intended:
//
//   1. It refuses to run unless the database host is localhost / 127.0.0.1.
//   2. Every Prisma call passes through an extension that throws on any
//      non-read operation, so a future edit cannot turn this into a writer.
//
// It prints no connection string, no credential, and nothing else read from an
// env file — a failure says only that the host is not local.
//
// Imports only published packages and relative `.ts` paths (no `@/` aliases,
// which Node cannot resolve), matching `prisma/seed.ts`.

import { PrismaClient, Prisma } from "@prisma/client";
import { fileURLToPath } from "node:url";

import { getCurrentMonthCdmx, shiftMonth } from "../lib/dates.ts";

// ---------------------------------------------------------------------------
// Safety: the local-host guard and the read-only guard (the testable core).
// ---------------------------------------------------------------------------

/** Loopback names only. A hostname anywhere else is someone's real data. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Message shown when the guard trips. It deliberately names no host, user or
 * database: everything in the connection string came from an env file, and this
 * script never echoes those.
 */
export const NON_LOCAL_MESSAGE =
    "data:snapshot refuses to run: the configured database host is not local " +
    "(expected localhost or 127.0.0.1). This script reads the local dev " +
    "database only — point DATABASE_URL at Docker and try again.";

export const MISSING_URL_MESSAGE =
    "data:snapshot refuses to run: DATABASE_URL is not set. Run it through " +
    "`pnpm data:snapshot`, which loads .env.local.";

/**
 * Throw unless `url` addresses a database on this machine. Exported so the
 * guard is tested directly — it is the property that keeps production data out
 * of reach, so it must not depend on `main()` being reached.
 */
export function assertLocalDatabase(url: string | undefined): void {
    if (!url) throw new Error(MISSING_URL_MESSAGE);
    let host: string;
    try {
        host = new URL(url).hostname;
    } catch {
        // An unparseable string is not provably local, so it fails closed.
        throw new Error(NON_LOCAL_MESSAGE);
    }
    if (!LOCAL_HOSTS.has(host)) throw new Error(NON_LOCAL_MESSAGE);
}

/**
 * Every Prisma operation that can change data or run arbitrary SQL. `queryRaw`
 * is in the list too: it reads, but `queryRawUnsafe` next to it does not have to,
 * and this script has no need for either.
 */
const WRITE_OPERATIONS = new Set([
    "create",
    "createMany",
    "createManyAndReturn",
    "update",
    "updateMany",
    "updateManyAndReturn",
    "upsert",
    "delete",
    "deleteMany",
    "executeRaw",
    "executeRawUnsafe",
    "queryRaw",
    "queryRawUnsafe",
    "$executeRaw",
    "$executeRawUnsafe",
    "$queryRaw",
    "$queryRawUnsafe",
]);

export function assertReadOnlyOperation(operation: string): void {
    if (WRITE_OPERATIONS.has(operation)) {
        throw new Error(
            `data:snapshot is read-only; refused the "${operation}" operation.`,
        );
    }
}

/** A client that physically cannot write: the guard sits on every operation. */
export function readOnlyClient(client: PrismaClient) {
    return client.$extends({
        query: {
            $allOperations({ operation, args, query }) {
                assertReadOnlyOperation(operation);
                return query(args);
            },
        },
    });
}

/**
 * True when the schema this build was generated from has the column. The funding
 * -source work (spec 0007 §3.1) lands on a later branch; here the section is
 * skipped rather than crashing.
 */
export function modelHasField(model: string, field: string): boolean {
    return (
        Prisma.dmmf.datamodel.models
            .find((m) => m.name === model)
            ?.fields.some((f) => f.name === field) ?? false
    );
}

// ---------------------------------------------------------------------------
// Formatting helpers.
// ---------------------------------------------------------------------------

const mxn = (n: number): string =>
    n.toLocaleString("en-US", {
        style: "currency",
        currency: "MXN",
        maximumFractionDigits: 2,
    });

/** CDMX calendar month (`YYYY-MM`) of a stored UTC timestamp. */
const monthOf = (date: Date): string => getCurrentMonthCdmx(date);

const heading = (text: string): void =>
    console.log(`\n${text}\n${"─".repeat(text.length)}`);

/** A small fixed-width table. Columns after the first are right-aligned. */
function table(headers: string[], rows: (string | number)[][]): void {
    if (rows.length === 0) {
        console.log("  (none)");
        return;
    }
    const cells = [headers, ...rows.map((r) => r.map(String))];
    const widths = headers.map((_, i) =>
        Math.max(...cells.map((r) => (r[i] ?? "").length)),
    );
    const line = (r: string[]) =>
        "  " +
        r
            .map((c, i) =>
                i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!),
            )
            .join("  ");
    console.log(line(headers));
    console.log("  " + widths.map((w) => "─".repeat(w)).join("  "));
    for (const r of cells.slice(1)) console.log(line(r));
}

/** Sum a number out of each row, grouped by a key. */
function groupSum<T>(
    rows: T[],
    key: (row: T) => string,
    value: (row: T) => number,
): Map<string, { total: number; count: number }> {
    const out = new Map<string, { total: number; count: number }>();
    for (const row of rows) {
        const k = key(row);
        const acc = out.get(k) ?? { total: 0, count: 0 };
        acc.total += value(row);
        acc.count += 1;
        out.set(k, acc);
    }
    return out;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// The snapshot itself.
// ---------------------------------------------------------------------------

type Db = ReturnType<typeof readOnlyClient>;

async function rowCounts(db: Db): Promise<void> {
    const [
        users,
        categories,
        subcategories,
        cards,
        expenses,
        movements,
        incomes,
        settings,
        budgets,
    ] = await Promise.all([
        db.user.count(),
        db.category.count(),
        db.subcategory.count(),
        db.card.count(),
        db.expense.count(),
        db.movement.count(),
        db.income.count(),
        db.settings.count(),
        db.categoryBudget.count(),
    ]);
    heading("Row counts");
    table(
        ["table", "rows"],
        [
            ["User", users],
            ["Settings", settings],
            ["Category", categories],
            ["Subcategory", subcategories],
            ["CategoryBudget", budgets],
            ["Card", cards],
            ["Expense", expenses],
            ["Movement", movements],
            ["Income", incomes],
        ],
    );
}

/** The expense fields every section below reads, plus `fundedFrom` when it exists. */
type ExpenseRow = {
    date: Date;
    amount: number;
    actualExpenditure: number;
    categoryId: string;
    cardId: string | null;
    fundedFrom?: string;
};

async function loadExpenses(
    db: Db,
    withFundedFrom: boolean,
): Promise<ExpenseRow[]> {
    // The column is absent on this branch, so the select is built dynamically;
    // `modelHasField` is what makes the cast safe.
    const select = {
        date: true,
        amount: true,
        actualExpenditure: true,
        categoryId: true,
        cardId: true,
        ...(withFundedFrom ? { fundedFrom: true } : {}),
    } as Record<string, boolean>;
    return (await db.expense.findMany({
        select: select as never,
        orderBy: { date: "asc" },
    })) as ExpenseRow[];
}

function spendByMonth(expenses: ExpenseRow[]): void {
    heading("Spend by month (CDMX)");
    const charged = groupSum(
        expenses,
        (e) => monthOf(e.date),
        (e) => e.amount,
    );
    const mine = groupSum(
        expenses,
        (e) => monthOf(e.date),
        (e) => e.actualExpenditure,
    );
    const months = [...charged.keys()].sort();
    table(
        ["month", "charged", "my share", "rows"],
        months.map((m) => [
            m,
            mxn(round2(charged.get(m)!.total)),
            mxn(round2(mine.get(m)?.total ?? 0)),
            charged.get(m)!.count,
        ]),
    );
}

function spendByCategory(
    expenses: ExpenseRow[],
    categories: Map<string, string>,
    month: string,
): void {
    heading(`Spend by category — ${month}`);
    const rows = expenses.filter((e) => monthOf(e.date) === month);
    const byCategory = groupSum(
        rows,
        (e) => categories.get(e.categoryId) ?? e.categoryId,
        (e) => e.actualExpenditure,
    );
    const charged = groupSum(
        rows,
        (e) => categories.get(e.categoryId) ?? e.categoryId,
        (e) => e.amount,
    );
    table(
        ["category", "charged", "my share", "rows"],
        [...byCategory.entries()]
            .sort((a, b) => b[1].total - a[1].total)
            .map(([name, acc]) => [
                name,
                mxn(round2(charged.get(name)!.total)),
                mxn(round2(acc.total)),
                acc.count,
            ]),
    );
}

function byFundingSource(expenses: ExpenseRow[]): void {
    heading("Spend by funding source");
    const bySource = groupSum(
        expenses,
        (e) => e.fundedFrom ?? "income",
        (e) => e.actualExpenditure,
    );
    table(
        ["source", "my share", "rows"],
        [...bySource.entries()].map(([source, acc]) => [
            source,
            mxn(round2(acc.total)),
            acc.count,
        ]),
    );
}

type MovementRow = {
    date: Date;
    createdAt: Date;
    amount: number;
    type: string;
    cardId: string | null;
    closedAt: Date | null;
};

function partnerFlows(movements: MovementRow[]): void {
    heading("Partner money by month");
    const partner = movements.filter((m) => m.type.startsWith("gf_"));
    const months = [...new Set(partner.map((m) => monthOf(m.date)))].sort();
    const sumOf = (month: string, type: string) =>
        partner
            .filter((m) => monthOf(m.date) === month && m.type === type)
            .reduce((s, m) => s + m.amount, 0);
    table(
        ["month", "fronted", "you paid", "she paid", "rows"],
        months.map((m) => [
            m,
            mxn(round2(sumOf(m, "gf_fronted"))),
            mxn(round2(sumOf(m, "gf_paid"))),
            mxn(round2(sumOf(m, "gf_received"))),
            partner.filter((x) => monthOf(x.date) === m).length,
        ]),
    );
}

function perCard(
    expenses: ExpenseRow[],
    movements: MovementRow[],
    cards: { id: string; name: string }[],
): void {
    heading("Per card");
    const charges = groupSum(
        expenses,
        (e) => e.cardId ?? "cash",
        (e) => e.amount,
    );
    const payments = groupSum(
        movements.filter((m) => m.type === "card_payment"),
        (m) => m.cardId ?? "unassigned",
        (m) => m.amount,
    );
    table(
        ["card", "charged", "charges", "payments", "balance"],
        [
            ...cards.map((c) => {
                const charged = charges.get(c.id)?.total ?? 0;
                const paid = payments.get(c.id)?.total ?? 0;
                return [
                    c.name,
                    mxn(round2(charged)),
                    charges.get(c.id)?.count ?? 0,
                    mxn(round2(paid)),
                    mxn(round2(charged - paid)),
                ];
            }),
            [
                "(cash / no card)",
                mxn(round2(charges.get("cash")?.total ?? 0)),
                charges.get("cash")?.count ?? 0,
                "—",
                "—",
            ],
        ],
    );
}

function settlementCycles(movements: MovementRow[]): void {
    heading("Settlement cycles");
    const markers = movements
        .filter((m) => m.closedAt !== null)
        .sort((a, b) => a.closedAt!.getTime() - b.closedAt!.getTime());
    if (markers.length === 0) {
        console.log("  (none closed — the whole history is one open cycle)");
        return;
    }
    // Membership is by ENTRY time against the close instant (spec 0007 §3.5),
    // the same rule the settlement service applies.
    let lower = Number.NEGATIVE_INFINITY;
    const rows = markers.map((marker) => {
        const upper = marker.closedAt!.getTime();
        const held = movements.filter(
            (m) =>
                m.createdAt.getTime() > lower && m.createdAt.getTime() <= upper,
        ).length;
        lower = upper;
        return [
            marker.closedAt!.toISOString().slice(0, 16).replace("T", " "),
            mxn(round2(marker.amount)),
            held,
        ];
    });
    table(["closed at (UTC)", "settled", "movements held"], rows);
    console.log(`  open cycle: everything entered after the last close.`);
}

export async function snapshot(db: Db): Promise<void> {
    const withFundedFrom = modelHasField("Expense", "fundedFrom");

    await rowCounts(db);

    const [expenses, movements, categories, cards] = await Promise.all([
        loadExpenses(db, withFundedFrom),
        db.movement.findMany({
            select: {
                date: true,
                createdAt: true,
                amount: true,
                type: true,
                cardId: true,
                closedAt: true,
            },
            orderBy: { date: "asc" },
        }) as Promise<MovementRow[]>,
        db.category.findMany({ select: { id: true, name: true } }),
        db.card.findMany({ select: { id: true, name: true } }),
    ]);

    const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
    const thisMonth = getCurrentMonthCdmx(new Date());

    spendByMonth(expenses);
    spendByCategory(expenses, categoryNames, thisMonth);
    spendByCategory(expenses, categoryNames, shiftMonth(thisMonth, -1));

    if (withFundedFrom) {
        byFundingSource(expenses);
    } else {
        heading("Spend by funding source");
        console.log(
            "  (skipped — Expense.fundedFrom is not in this schema yet)",
        );
    }

    partnerFlows(movements);
    perCard(expenses, movements, cards);
    settlementCycles(movements);
    console.log("");
}

async function main(): Promise<void> {
    try {
        assertLocalDatabase(process.env.DATABASE_URL);
    } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
    }

    const client = new PrismaClient();
    const db = readOnlyClient(client);
    try {
        await snapshot(db);
    } finally {
        await client.$disconnect();
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main();
}
