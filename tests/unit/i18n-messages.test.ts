import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { LOCALES } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";

const messagesDir = path.join(process.cwd(), "messages");

function namespaceFiles(locale: string): string[] {
    return readdirSync(path.join(messagesDir, locale))
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.replace(/\.json$/, ""))
        .sort();
}

/** ["nav.links.dashboard", "Dashboard"]-style entries, so a missing key names itself. */
function leaves(tree: unknown, prefix = ""): [string, unknown][] {
    if (typeof tree !== "object" || tree === null) return [[prefix, tree]];
    return Object.entries(tree).flatMap(([key, value]) =>
        leaves(value, prefix ? `${prefix}.${key}` : key),
    );
}

const leafKeys = (tree: unknown) => leaves(tree).map(([key]) => key);

describe("message files", () => {
    it("Should hold the same namespace files for every locale", () => {
        expect(namespaceFiles("es")).toEqual(namespaceFiles("en"));
    });

    it.each(LOCALES)(
        "Should load every %s namespace file under its own key",
        (locale) => {
            expect(Object.keys(MESSAGES[locale]).sort()).toEqual(
                namespaceFiles(locale),
            );
        },
    );

    it("Should hold every Spanish key in English, and every English key in Spanish", () => {
        const es = leafKeys(MESSAGES.es).sort();
        const en = leafKeys(MESSAGES.en).sort();
        expect(es.filter((key) => !en.includes(key))).toEqual([]);
        expect(en.filter((key) => !es.includes(key))).toEqual([]);
    });

    it.each(LOCALES)("Should hold only non-empty strings in %s", (locale) => {
        const bad = leaves(MESSAGES[locale]).filter(
            ([, value]) => typeof value !== "string" || value === "",
        );
        expect(bad).toEqual([]);
    });
});
