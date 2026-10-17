"use server";

import { signup, type SignupResult } from "@/lib/auth/signup";
import { signupGate, userProvisioningRepository } from "@/lib/repositories";

export type { SignupCode, SignupResult } from "@/lib/auth/signup";

/** One parameter only: a server action receives every argument from the client. */
export async function signupAction(input: unknown): Promise<SignupResult> {
    return signup(input, signupGate, userProvisioningRepository);
}
