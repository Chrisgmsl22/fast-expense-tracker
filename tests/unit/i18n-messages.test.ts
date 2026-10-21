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

const BRANCHING = new Set(["plural", "select", "selectordinal"]);

/**
 * The argument names an ICU message uses: `{partner}`, `{count, plural, ...}`, and
 * any argument inside a plural or select branch. `#` and branch text are not
 * arguments. Quoted text (`'{'`) is skipped, as ICU does.
 */
function icuArgs(message: string): string[] {
    const names = new Set<string>();
    let i = 0;

    function skipQuoted() {
        // ICU quoting: an apostrophe opens a literal only before a brace or another apostrophe.
        if (message[i] === "'" && /['{}#]/.test(message[i + 1] ?? "")) {
            const end = message.indexOf("'", i + 2);
            i = end === -1 ? message.length : end + 1;
            return true;
        }
        return false;
    }

    function readUntil(stops: string): string {
        const start = i;
        while (i < message.length && !stops.includes(message[i]!)) i++;
        return message.slice(start, i).trim();
    }

    /** Message text until the closing brace of the enclosing branch (or the end). */
    function parseText() {
        while (i < message.length && message[i] !== "}") {
            if (skipQuoted()) continue;
            if (message[i] === "{") parseArgument();
            else i++;
        }
    }

    function parseArgument() {
        i++; // "{"
        names.add(readUntil(",}"));
        if (message[i] === "}") {
            i++;
            return;
        }
        i++; // ","
        const type = readUntil(",}");
        if (message[i] === ",") i++;
        if (BRANCHING.has(type)) {
            // `selector {text}` pairs (plus an optional `offset:n`) until the closing brace.
            while (i < message.length && message[i] !== "}") {
                if (message[i] === "{") {
                    i++;
                    parseText();
                    i++; // "}"
                } else i++;
            }
        } else {
            readUntil("}"); // a number/date style
        }
        i++; // "}"
    }

    parseText();
    return [...names].sort();
}

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

    it("Should use the same ICU arguments for a key in every locale", () => {
        const en = new Map(leaves(MESSAGES.en));
        const mismatched = leaves(MESSAGES.es)
            .filter(([key]) => en.has(key))
            .map(([key, es]) => ({
                key,
                es: icuArgs(String(es)),
                en: icuArgs(String(en.get(key))),
            }))
            .filter(({ es, en }) => es.join() !== en.join());
        expect(mismatched).toEqual([]);
    });

    it("Should read arguments out of plural branches and skip quoted braces", () => {
        expect(
            icuArgs(
                "{count, plural, one {# row for {partner}} other {# rows}} '{'literal'}' {when, date, short}",
            ),
        ).toEqual(["count", "partner", "when"]);
    });

    it.each(LOCALES)("Should hold only non-empty strings in %s", (locale) => {
        const bad = leaves(MESSAGES[locale]).filter(
            ([, value]) => typeof value !== "string" || value === "",
        );
        expect(bad).toEqual([]);
    });
});
