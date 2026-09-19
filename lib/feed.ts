import type { ExpenseListItem } from "@/lib/repositories/expense.repository";
import type { MovementListItem } from "@/lib/repositories/movement.repository";
import { isPartnerDebt } from "@/lib/domain/movement";

/**
 * A single row in a month feed — an expense or a money movement — so both
 * surfaces (dashboard `MonthFeed`, expenses `ExpenseListInteractive`) render one
 * date-sorted list instead of two parallel ones (ADR-0018).
 */
export type FeedItem =
    | { kind: "expense"; date: Date; expense: ExpenseListItem }
    | { kind: "movement"; date: Date; movement: MovementListItem };

/**
 * Merge expenses + movements into one list, newest first. Both debt types are
 * settlement-only (spec 0007). The month query already excludes them; this second
 * guard covers a caller assembling its own movement list.
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
            .filter((m) => !isPartnerDebt(m.type))
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
