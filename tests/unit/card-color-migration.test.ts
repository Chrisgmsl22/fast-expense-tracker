// @vitest-environment node
//
// The card colour migration converts legacy colour names with hard-coded
// literals. These tests fail if a hex drifts from the palette or a statement
// widens past "Card"."color".
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import { CARD_PALETTE, CASH_COLOR } from "@/lib/palette";

const swatch = (name: string): string => {
    const hex = CARD_PALETTE.find((s) => s.name === name)?.hex;
    if (!hex) throw new Error(`no palette swatch named ${name}`);
    return hex;
};

/** The names the first seed (commit 1d6da1d) wrote, and the swatch each became. */
const LEGACY_NAMES: Record<string, string> = {
    gray: swatch("Slate"),
    yellow: swatch("Gold"),
    purple: swatch("Purple"),
    blue: swatch("Blue"),
    green: CASH_COLOR,
};

const MIGRATION_PATH = path.join(
    process.cwd(),
    "prisma/migrations/20261017000000_card_color_names_to_hex/migration.sql",
);

const sql = readFileSync(MIGRATION_PATH, "utf8");

// Comment lines go first so a comment can never satisfy an assertion; then the
// split is on the statement terminator, so two statements on one line still count.
const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);

const UPDATE_SHAPE =
    /^UPDATE "Card" SET "color" = '(#[0-9a-f]{6})' WHERE lower\("color"\) = '([a-z]+)'$/;

const byName = new Map<string, string>();
for (const statement of statements) {
    const match = UPDATE_SHAPE.exec(statement);
    if (match) byName.set(match[2]!, match[1]!);
}

describe("card_color_names_to_hex migration", () => {
    it("writes the palette hex for every legacy colour name", () => {
        for (const [name, hex] of Object.entries(LEGACY_NAMES)) {
            expect(byName.get(name), `colour name "${name}"`).toBe(hex);
        }
    });

    it("has one well-formed statement per legacy name and nothing else", () => {
        expect(statements).toHaveLength(Object.keys(LEGACY_NAMES).length);
        expect([...byName.keys()].sort()).toEqual(
            Object.keys(LEGACY_NAMES).sort(),
        );
    });

    it("matches names case-insensitively, so a stored hex never matches", () => {
        for (const statement of statements) {
            expect(statement).toMatch(/WHERE lower\("color"\) = '[a-z]+'$/);
        }
    });

    it("touches no table other than Card", () => {
        const tables = statements.map(
            (s) =>
                /^(?:UPDATE|INSERT INTO|DELETE FROM|ALTER TABLE|DROP TABLE)\s+"(\w+)"/i.exec(
                    s,
                )?.[1] ?? s,
        );
        expect(new Set(tables)).toEqual(new Set(["Card"]));
    });
});
