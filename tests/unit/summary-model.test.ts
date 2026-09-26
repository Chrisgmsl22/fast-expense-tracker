import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    TONE_COLOR,
    closingTotal,
    otherMoneyThatLeft,
    percentLabel,
    summaryLines,
    type MoneyTone,
} from "@/components/money/summary-model";
import {
    computeFeedTotals,
    type FeedTotalExpense,
} from "@/lib/domain/movement";

const groceries: FeedTotalExpense = {
    id: "e1",
    amount: 1000,
    actualExpenditure: 680,
    isPartnerPayment: false,
    category: { slug: "groceries" },
    fundedFrom: "income",
};

describe("summaryLines", () => {
    it("keeps a partner payment inside the line it belongs to", () => {
        const totals = computeFeedTotals([
            groceries,
            {
                ...groceries,
                id: "p1",
                amount: 300,
                actualExpenditure: 300,
                isPartnerPayment: true,
                category: { slug: "combined-expenses" },
            },
        ]);
        const lines = summaryLines(totals, "Brenda");
        const spent = lines.find((line) => line.key === "spent")!;

        expect(spent.amount).toBe(980);
        expect(spent.of).toHaveLength(1);
        expect(spent.of[0]!.amount).toBe(300);
        // …and no second top-level line restates it.
        expect(lines.some((line) => line.key === "transfers")).toBe(false);
    });

    it("drops every figure the month has none of", () => {
        const lines = summaryLines(computeFeedTotals([groceries]), "Brenda");

        expect(lines.map((line) => line.key)).toEqual(["charged", "spent"]);
    });

    it("gives a legacy transfer its own line, by funding source", () => {
        const totals = computeFeedTotals(
            [groceries],
            [
                {
                    id: "m1",
                    type: "gf_paid",
                    amount: 700,
                    fundedFrom: "income",
                },
                {
                    id: "m2",
                    type: "gf_paid",
                    amount: 250,
                    fundedFrom: "savings",
                },
            ],
        );
        const lines = summaryLines(totals, "Brenda");

        // Split, because only the income-funded one reaches the Total.
        expect(lines.find((line) => line.key === "transfers")!.amount).toBe(
            700,
        );
        expect(
            lines.find((line) => line.key === "transfers-not-from-income")!
                .amount,
        ).toBe(250);
    });
});

describe("otherMoneyThatLeft", () => {
    it("adds the legacy transfers that left the same pot", () => {
        const totals = computeFeedTotals(
            [{ ...groceries, id: "s1", fundedFrom: "savings" }],
            [{ id: "m1", type: "gf_paid", amount: 250, fundedFrom: "savings" }],
        );

        // 680 of savings-funded consumption + 250 that reached her from savings.
        expect(otherMoneyThatLeft(totals)).toBe(930);
        expect(totals.notFromIncome.amount).toBe(680);
    });
});

/**
 * Tones resolved to the hex `globals.css` really defines, so a tone pointed at a
 * near-identical token fails here rather than on screen.
 */
const TOKEN_HEX = new Map(
    [
        ...readFileSync(
            path.join(process.cwd(), "app/globals.css"),
            "utf8",
        ).matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6})/gi),
    ].map((m) => [m[1]!, m[2]!.toLowerCase()]),
);

/**
 * The one tone that makes no system claim. Any number of neutral rows may sit
 * together, so it is exempt BY NAME — never by a measured property a later token
 * change could quietly satisfy.
 */
const NEUTRAL_TONES: MoneyTone[] = ["plain"];

/** A tone's hue, or null when its token is a grey and has none. */
function hueOf(tone: MoneyTone): number | null {
    const token = TONE_COLOR[tone].replace(/^var\(|\)$/g, "");
    const hex = TOKEN_HEX.get(token);
    if (!hex) throw new Error(`no hex for ${token}`);
    const [r, g, b] = [1, 3, 5].map(
        (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
    ) as [number, number, number];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const span = max - min;
    if (span === 0) return null;
    const hue =
        max === r
            ? ((g - b) / span) % 6
            : max === g
              ? (b - r) / span + 2
              : (r - g) / span + 4;
    return (((hue * 60) % 360) + 360) % 360;
}

/** Circular hue distance, or null when either tone is an allowlisted neutral. */
function hueGap(a: MoneyTone, b: MoneyTone): number | null {
    if (NEUTRAL_TONES.includes(a) || NEUTRAL_TONES.includes(b)) return null;
    const [x, y] = [hueOf(a), hueOf(b)];
    // A grey that is NOT on the allowlist is indistinguishable from every other
    // grey: report the worst case, so the guard fails instead of throwing.
    if (x === null || y === null) return 0;
    const raw = Math.abs(x - y);
    return Math.min(raw, 360 - raw);
}

describe("the money tones stay tellable apart", () => {
    // Adjacent arcs carry no labels between them, so the hue IS the distinction.
    // EVERY slice set the modal draws is listed, not just the one a review looked at.
    const DONUTS: Record<string, MoneyTone[]> = {
        "what I was charged": ["spent", "otherMoney", "positive"],
        "what I paid her": ["spent", "otherMoney"],
    };

    for (const [name, tones] of Object.entries(DONUTS)) {
        it(`keeps every pair of "${name}" arcs apart`, () => {
            for (let i = 0; i < tones.length; i++) {
                for (let j = i + 1; j < tones.length; j++) {
                    const gap = hueGap(tones[i]!, tones[j]!);
                    expect({
                        pair: `${tones[i]}/${tones[j]}`,
                        gap,
                    }).toEqual({
                        pair: `${tones[i]}/${tones[j]}`,
                        gap: expect.any(Number),
                    });
                    expect(gap!).toBeGreaterThan(90);
                }
            }
        });
    }

    /**
     * The chin's line-up, in the order `summaryLines` builds it. Every line but the
     * first two is conditional, and `nonZero` can drop those two as well — so ANY
     * subset can reach the screen, and any pair can end up adjacent.
     */
    const CHIN_SEQUENCE: { key: string; tone: MoneyTone }[] = [
        { key: "charged", tone: "plain" },
        { key: "spent", tone: "spent" },
        { key: "set-aside", tone: "positive" },
        { key: "not-from-income", tone: "otherMoney" },
        { key: "partner-paid-you", tone: "plain" },
        { key: "transfers", tone: "plain" },
        { key: "transfers-not-from-income", tone: "plain" },
    ];

    it("emits exactly the sequence the adjacency check is run over", () => {
        // A line added to the model without being added above would be checked
        // against nothing, so pin the two together on a month holding all seven.
        const everything = computeFeedTotals(
            [
                groceries,
                { ...groceries, id: "s1", fundedFrom: "savings" },
                { ...groceries, id: "sv", category: { slug: "savings" } },
            ],
            [
                {
                    id: "m1",
                    type: "gf_paid",
                    amount: 700,
                    fundedFrom: "income",
                },
                {
                    id: "m2",
                    type: "gf_paid",
                    amount: 250,
                    fundedFrom: "savings",
                },
                {
                    id: "m3",
                    type: "gf_received",
                    amount: 500,
                    fundedFrom: "income",
                },
            ],
        );

        expect(
            summaryLines(everything, "Brenda").map(({ key, tone }) => ({
                key,
                tone,
            })),
        ).toEqual(CHIN_SEQUENCE);
    });

    it("keeps every pair that any subset can make adjacent apart", () => {
        // Not one arrangement: every line is droppable, so each ordered pair can
        // become neighbours once the lines between them are gone.
        const failures: string[] = [];
        for (let i = 0; i < CHIN_SEQUENCE.length; i++) {
            for (let j = i + 1; j < CHIN_SEQUENCE.length; j++) {
                const [a, b] = [CHIN_SEQUENCE[i]!, CHIN_SEQUENCE[j]!];
                if (a.tone === b.tone) continue;
                const gap = hueGap(a.tone, b.tone);
                if (gap !== null && gap <= 60) {
                    failures.push(`${a.key}/${b.key} ${gap.toFixed(1)}°`);
                }
            }
        }
        expect(failures).toEqual([]);
    });
});

describe("closingTotal", () => {
    it("is null when the total would only restate what I really spent", () => {
        expect(closingTotal(computeFeedTotals([groceries]))).toBeNull();
    });

    it("is the total once something adds to it", () => {
        const totals = computeFeedTotals(
            [groceries],
            [{ id: "m1", type: "gf_paid", amount: 700, fundedFrom: "income" }],
        );
        expect(closingTotal(totals)).toBe(1380);
    });
});

describe("percentLabel", () => {
    it("rounds to a whole percent", () => {
        expect(percentLabel(1, 3)).toBe("33%");
    });

    it("has nothing to say without a whole to compare against", () => {
        expect(percentLabel(500, 0)).toBeNull();
    });
});
