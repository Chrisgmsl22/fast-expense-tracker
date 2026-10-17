"use server";

import {
    finishOnboarding,
    type CompleteOnboardingResult,
} from "@/lib/onboarding/finish-onboarding";
import { userRepository } from "@/lib/repositories";

export type {
    CompleteOnboardingCode,
    CompleteOnboardingResult,
} from "@/lib/onboarding/finish-onboarding";

/** Takes no input: the user comes from the session alone. */
export async function completeOnboarding(): Promise<CompleteOnboardingResult> {
    return finishOnboarding(userRepository);
}
