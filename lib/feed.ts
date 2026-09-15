import type { ExpenseListItem } from "@/lib/repositories/expense.repository";
import type { MovementListItem } from "@/lib/repositories/movement.repository";

/**
 * A single row in a month feed — an expense or a money movement — so both
 * surfaces (dashboard `MonthFeed`, expenses `ExpenseListInteractive`) render one
 * date-sorted list instead of two parallel ones (ADR-0018).
 */
export type FeedItem =
    | { kind: "expense"; date: Date; expense: ExpenseListItem }
    | { kind: "movement"; date: Date; movement: MovementListItem };

/**
 * Merge expenses + movements into one list, newest first.
 *
 * A `gf_fronted` debt is dropped: it is settlement-only and provisional (spec
 * 0007 §6b). The month query already excludes it, so this is the second of two
 * guards — one at the data boundary, one at the render boundary — because a
 * caller assembling its own movement list would otherwise put an orange "I owe"
 * row back beside real spending with nobody noticing.
 */
export function buildFeed(
    expenses: ExpenseListItem[],
    movements: MovementListItem[],
): FeedItem[] {
    const items: FeedItem[] = [
        ...expenses.map(
            (e): FeedItem => ({ kind: "expense", date: e.date, expense: e }),
        ),
        ...movements
            .filter((m) => m.type !== "gf_fronted")
            .map(
                (m): FeedItem => ({
                    kind: "movement",
                    date: m.date,
                    movement: m,
                }),
            ),
    ];
    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
}
