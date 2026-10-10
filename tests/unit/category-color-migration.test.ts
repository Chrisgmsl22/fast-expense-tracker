// @vitest-environment node
//
// BUG-2 guard: the backfill migration repairs production category colors with
// hard-coded literals. These tests fail if a starter category is added and
// silently missed by the migration, or if a hex drifts between the two.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import { STARTER_CATEGORIES } from "@/lib/domain/starter-kit";

const GRAY = "#6b7280";

const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
    STARTER_CATEGORIES.map((c) => [c.slug, c.color]),
);

const MIGRATION_PATH = path.join(
    process.cwd(),
    "prisma/migrations/20260914000000_backfill_category_colors/migration.sql",
);

const sql = readFileSync(MIGRATION_PATH, "utf8");

// Split on the statement terminator, not on newlines: two statements sharing
// one line must not escape these checks. Comment lines are stripped first so a
// comment can never satisfy an assertion.
const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);

/** The whole statement shape, with the SET hex and the WHERE hex captured apart. */
const UPDATE_SHAPE =
    /^UPDATE "Category" SET "color" = '(#[0-9a-f]{6})' WHERE "slug" = '([a-z-]+)' AND "color" = '(#[0-9a-f]{6})'$/i;

type ParsedUpdate = { setColor: string; whereColor: string };

const bySlug = new Map<string, ParsedUpdate>();
for (const statement of statements) {
    const match = UPDATE_SHAPE.exec(statement);
    if (match) {
        bySlug.set(match[2]!, { setColor: match[1]!, whereColor: match[3]! });
    }
}

const colorfulSlugs = Object.keys(CATEGORY_COLORS).filter(
    (slug) => slug !== "unassigned",
);

describe("starter category colors", () => {
    it("gives every non-unassigned slug a non-gray hex", () => {
        expect(colorfulSlugs.length).toBeGreaterThan(0);
        for (const slug of colorfulSlugs) {
            expect(CATEGORY_COLORS[slug]).toMatch(/^#[0-9a-f]{6}$/i);
            expect(CATEGORY_COLORS[slug]).not.toBe(GRAY);
        }
    });

    it("keeps the unassigned sentinel gray on purpose", () => {
        expect(CATEGORY_COLORS["unassigned"]).toBe(GRAY);
    });
});

describe("backfill_category_colors migration", () => {
    it("writes the starter kit's hex for every non-unassigned slug", () => {
        for (const slug of colorfulSlugs) {
            const update = bySlug.get(slug);
            expect(
                update,
                `no migration statement for slug "${slug}"`,
            ).toBeDefined();
            // Asserted on the SET side specifically: a reversed statement, with
            // gray in SET and the real hex in WHERE, must not pass.
            expect(update!.setColor).toBe(CATEGORY_COLORS[slug]);
            expect(update!.setColor).not.toBe(GRAY);
        }
    });

    it("writes no row for the unassigned sentinel", () => {
        expect(bySlug.has("unassigned")).toBe(false);
        expect(statements.some((s) => s.includes("'unassigned'"))).toBe(false);
    });

    it("guards every UPDATE on the gray default, so chosen colors survive", () => {
        // Every statement in the file parsed, so none slipped past the shape.
        expect(statements).toHaveLength(colorfulSlugs.length);
        expect(bySlug.size).toBe(colorfulSlugs.length);
        for (const [slug, update] of bySlug) {
            expect(
                update.whereColor,
                `slug "${slug}" is not gray-guarded`,
            ).toBe(GRAY);
        }
    });

    it("touches no table other than Category", () => {
        const tables = statements.map(
            (s) =>
                /^(?:UPDATE|INSERT INTO|DELETE FROM|ALTER TABLE|DROP TABLE)\s+"(\w+)"/i.exec(
                    s,
                )?.[1] ?? s,
        );
        expect(new Set(tables)).toEqual(new Set(["Category"]));
    });
});
