"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/_actions/auth/logout";

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
