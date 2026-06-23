"use server";

import { signOut } from "@/auth";

export async function logoutAction(): Promise<void> {
    await signOut({ redirectTo: "/login" });
}
