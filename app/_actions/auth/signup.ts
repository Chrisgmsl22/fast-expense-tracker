"use server";

import {
    localizeFieldErrors,
    localizeMessage,
} from "@/lib/actions/field-errors";
import { signup, type SignupResult } from "@/lib/auth/signup";
import { signupGate, userProvisioningRepository } from "@/lib/repositories";
import { authMessages } from "./schema-messages";

export type { SignupCode, SignupResult } from "@/lib/auth/signup";

/** One parameter only: a server action receives every argument from the client. */
export async function signupAction(input: unknown): Promise<SignupResult> {
    const result = await signup(input, signupGate, userProvisioningRepository);
    if (result.ok) return result;
    const translations = await authMessages();
    return {
        ...result,
        message: localizeMessage(result.message, translations),
        ...(result.fieldErrors && {
            fieldErrors: localizeFieldErrors(result.fieldErrors, translations),
        }),
    };
}
