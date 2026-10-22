"use server";

import {
    localizeFieldErrors,
    localizeMessage,
} from "@/lib/actions/field-errors";
import {
    changeDisplayName,
    type UpdateDisplayNameResult,
} from "@/lib/account/display-name";
import { userRepository } from "@/lib/repositories";
import { accountMessages } from "./schema-messages";

export type {
    UpdateDisplayNameCode,
    UpdateDisplayNameResult,
} from "@/lib/account/display-name";

/** One parameter only: a server action receives every argument from the client. */
export async function updateDisplayName(
    input: unknown,
): Promise<UpdateDisplayNameResult> {
    const result = await changeDisplayName(input, userRepository);
    if (result.ok) return result;
    const translations = await accountMessages();
    return {
        ...result,
        message: localizeMessage(result.message, translations),
        ...(result.fieldErrors && {
            fieldErrors: localizeFieldErrors(result.fieldErrors, translations),
        }),
    };
}
