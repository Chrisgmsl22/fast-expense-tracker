"use server";

import { localizeMessage } from "@/lib/actions/field-errors";
import {
    finishOnboarding,
    type CompleteOnboardingResult,
} from "@/lib/onboarding/finish-onboarding";
import { userRepository } from "@/lib/repositories";
import { accountMessages } from "./schema-messages";

export type {
    CompleteOnboardingCode,
    CompleteOnboardingResult,
} from "@/lib/onboarding/finish-onboarding";

/** Takes no input: the user comes from the session alone. */
export async function completeOnboarding(): Promise<CompleteOnboardingResult> {
    const result = await finishOnboarding(userRepository);
    if (result.ok) return result;
    return {
        ...result,
        message: localizeMessage(result.message, await accountMessages()),
    };
}
