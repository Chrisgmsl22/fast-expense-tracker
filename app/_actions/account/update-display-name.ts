"use server";

import {
    changeDisplayName,
    type UpdateDisplayNameResult,
} from "@/lib/account/display-name";
import { userRepository } from "@/lib/repositories";

export type {
    UpdateDisplayNameCode,
    UpdateDisplayNameResult,
} from "@/lib/account/display-name";

/** One parameter only: a server action receives every argument from the client. */
export async function updateDisplayName(
    input: unknown,
): Promise<UpdateDisplayNameResult> {
    return changeDisplayName(input, userRepository);
}
