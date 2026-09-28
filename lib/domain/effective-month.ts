/** A value that applies from `effectiveMonth` (`YYYY-MM`) onward; `null` = from the start. */
export type EffectiveDated = { effectiveMonth: string | null };

// A null month sorts before every dated month. `YYYY-MM` strings sort in month
// order, so a string compare is safe.
function isLater(a: string | null, b: string | null): boolean {
    if (a === null) return false;
    if (b === null) return true;
    return a > b;
}

// The latest entry at or before `month`, or `undefined` when none applies.
// On a tie in effective month, the first entry in input order wins.
export function resolveEffective<T extends EffectiveDated>(
    entries: readonly T[],
    month: string,
): T | undefined {
    let match: T | undefined;
    for (const entry of entries) {
        if (entry.effectiveMonth !== null && entry.effectiveMonth > month) {
            continue;
        }
        if (!match || isLater(entry.effectiveMonth, match.effectiveMonth)) {
            match = entry;
        }
    }
    return match;
}
