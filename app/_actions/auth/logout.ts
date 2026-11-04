"use server";

import { signOut } from "@/auth";

export async function logoutAction(redirectToLogin = true): Promise<void> {
    await signOut(redirectToLogin ? { redirectTo: "/login" } : {});
}
