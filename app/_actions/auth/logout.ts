"use server";

import { signOut } from "@/auth";

/**
 * Clear the session and return to the login screen (slice 1.3). `signOut`
 * throws the redirect, which Next propagates to the browser.
 */
export async function logoutAction(): Promise<void> {
    await signOut({ redirectTo: "/login" });
}
