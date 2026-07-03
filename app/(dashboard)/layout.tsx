import type { ReactNode } from "react";

import { auth } from "@/auth";
import { AppNav } from "@/components/nav/AppNav";

// The proxy route gate guarantees a session here; the email is a "who am I"
// cue next to the logout control. The nav is responsive (inline row on desktop,
// a burger + drawer on mobile) — see AppNav.
export default async function DashboardLayout({
    children,
}: {
    children: ReactNode;
}) {
    const session = await auth();

    return (
        <div className="flex min-h-screen flex-col">
            <header className="border-b">
                <AppNav email={session?.user?.email ?? undefined} />
            </header>
            {children}
        </div>
    );
}
