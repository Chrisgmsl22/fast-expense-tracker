import type { ReactNode } from "react";

import { auth } from "@/auth";
import { LogoutButton } from "@/components/auth/LogoutButton";

// The proxy route gate guarantees a session here; the email is a "who am I"
// cue next to the logout control.
export default async function DashboardLayout({
    children,
}: {
    children: ReactNode;
}) {
    const session = await auth();

    return (
        <div className="flex min-h-screen flex-col">
            <header className="flex items-center justify-between border-b px-8 py-3">
                <span className="text-sm font-medium">Expense Tracker</span>
                <div className="flex items-center gap-4">
                    {session?.user?.email && (
                        <span className="text-sm text-muted-foreground">
                            {session.user.email}
                        </span>
                    )}
                    <LogoutButton />
                </div>
            </header>
            {children}
        </div>
    );
}
