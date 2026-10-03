// Names and priorities shared by the three work registers (chores.json,
// bugs.json, slices.json): one priority sequence and one name space across all.

export interface Prioritized {
    id: string;
    name?: string;
    priority?: number | null;
}

export const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** How many open items a status line names before it counts the rest. */
export const LIST_CAP = 5;

export function checkPriorityFields(
    file: string,
    item: Record<string, unknown>,
): void {
    const { id, name, priority } = item;
    if (
        name !== undefined &&
        (typeof name !== "string" || !NAME_PATTERN.test(name))
    ) {
        throw new Error(`${file}: ${String(id)} name must be kebab-case`);
    }
    if (
        priority !== undefined &&
        priority !== null &&
        !(Number.isInteger(priority) && (priority as number) > 0)
    ) {
        throw new Error(
            `${file}: ${String(id)} priority must be a positive integer or null`,
        );
    }
}

const hasPriority = (item: Prioritized) =>
    item.priority !== undefined && item.priority !== null;

/** Open work carries a name and a priority; closed work carries no priority. */
export function checkOpenness(
    file: string,
    item: Prioritized,
    open: boolean,
    state: string,
): void {
    if (open && (item.name === undefined || !hasPriority(item))) {
        throw new Error(
            `${file}: ${item.id} is open, so it needs a name and a priority`,
        );
    }
    if (!open && hasPriority(item)) {
        throw new Error(
            `${file}: ${item.id} is ${state}, so it cannot carry a priority`,
        );
    }
}

export function assertUnique(file: string, items: Prioritized[]): void {
    const names = new Map<string, string>();
    const priorities = new Map<number, string>();
    for (const item of items) {
        if (item.name !== undefined) {
            const other = names.get(item.name);
            if (other)
                throw new Error(
                    `${file}: duplicate name "${item.name}" (${other}, ${item.id})`,
                );
            names.set(item.name, item.id);
        }
        if (hasPriority(item)) {
            const p = item.priority as number;
            const other = priorities.get(p);
            if (other)
                throw new Error(
                    `${file}: duplicate priority ${p} (${other}, ${item.id})`,
                );
            priorities.set(p, item.id);
        }
    }
}

export function byPriority<T extends Prioritized>(items: T[]): T[] {
    const rank = (i: T) => (hasPriority(i) ? (i.priority as number) : Infinity);
    return [...items].sort((a, b) => rank(a) - rank(b));
}

export function priorityLabel(item: Prioritized): string {
    if (!hasPriority(item)) return item.id;
    return `P${item.priority} ${item.name ?? item.id} (${item.id})`;
}

export function prioritizedList(
    items: Prioritized[],
    cap: number = LIST_CAP,
): string {
    const sorted = byPriority(items);
    if (sorted.length === 0) return "none";
    const shown = sorted.slice(0, cap).map(priorityLabel).join(", ");
    const rest = sorted.length - cap;
    return rest > 0 ? `${shown}, +${rest} more` : shown;
}
