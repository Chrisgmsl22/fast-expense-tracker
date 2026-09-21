"use client";
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/_actions/auth/logout";
import { withSessionLock } from "@/lib/auth/session-lock";

export function LogoutButton({ iconOnly = false }: { iconOnly?: boolean }) {
    const [pending, startTransition] = useTransition();
    const label = pending ? "Signing out…" : "Sign out";
    return (
        <Button
            type="button"
            variant={iconOnly ? "ghost" : "outline"}
            size={iconOnly ? "icon-sm" : "default"}
            aria-label={iconOnly ? label : undefined}
            title={iconOnly ? label : undefined}
            className={
                iconOnly
                    ? "shrink-0 text-sidebar-muted hover:bg-sidebar-panel hover:text-white"
                    : undefined
            }
            disabled={pending}
            onClick={() =>
                startTransition(() => withSessionLock(() => logoutAction()))
            }
        >
            {iconOnly ? (
                <LogOut aria-hidden="true" className="size-4" />
            ) : (
                label
            )}
        </Button>
    );
}
