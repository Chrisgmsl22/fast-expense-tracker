"use server";

import { auth } from "@/auth";
import { movementRepository } from "@/lib/repositories";
import type {
    MovementEditable,
    MovementRepository,
} from "@/lib/repositories/movement.repository";

/**
 * Fetch one movement's editable fields for an edit modal (CHORE-5). Scoped to the
 * signed-in user via `getById`; returns null when unauthenticated or when the row
 * isn't theirs, so the client can't open an edit it doesn't own. Carries `cardId`
 * and `note`, which the feed row shapes drop — the form needs both to prefill.
 */
export async function getMovementForEdit(
    id: string,
    repo: MovementRepository = movementRepository,
): Promise<MovementEditable | null> {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId || !id) return null;
    return repo.getById(userId, id);
}
