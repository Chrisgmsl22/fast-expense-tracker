import type { ReactNode } from "react";

import { auth } from "@/auth";
import { settingsRepository } from "@/lib/repositories";
import { AppNav } from "@/components/nav/AppNav";

// The proxy route gate guarantees a session here; the email is a "who am I"
// cue next to the logout control. The nav is responsive (inline row on desktop,
// a burger + drawer on mobile) — see AppNav. The user's sharing mode drives
// which links show (Solo hides Settlement — CHORE-6.b).
export default async function DashboardLayout({
    children,
}: {
    children: ReactNode;
}) {
    const session = await auth();
    const userId = session?.user?.id;
    // Solo is the safe default when there's no session/settings row yet: the
    // partner surfaces stay hidden until the user opts in.
    const sharesExpenses = userId
        ? (await settingsRepository.getSettings(userId)).sharesExpenses
        : false;

    return (
        <div className="flex min-h-screen flex-col">
            <header className="border-b">
                <AppNav
                    email={session?.user?.email ?? undefined}
                    sharesExpenses={sharesExpenses}
                />
            </header>
            {children}
        </div>
    );
}
