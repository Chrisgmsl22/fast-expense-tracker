"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/_actions/auth/logout";

/**
 * Logout control (slice 1.3). Submits the `logoutAction` server action, which
 * clears the session and redirects to `/login`.
 */
export function LogoutButton() {
    const [pending, startTransition] = useTransition();

    return (
        <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => startTransition(() => logoutAction())}
        >
            {pending ? "Signing out…" : "Sign out"}
        </Button>
    );
}
