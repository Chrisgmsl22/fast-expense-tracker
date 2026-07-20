import type { ReactNode } from "react";

import { auth } from "@/auth";
import { isBalanceSettled } from "@/lib/domain/settlement";
import { settingsRepository } from "@/lib/repositories";
import { getSettlement } from "@/lib/services/settlement/settlement.service";
import { AppNav } from "@/components/nav/AppNav";

// The proxy route gate guarantees a session here; the email is a "who am I"
// cue next to the logout control. The nav is responsive (inline row on desktop,
// a burger + drawer on mobile) — see AppNav. The Settlement link shows for
// Shared users, and for a Solo user only while an unsettled balance remains to
// be wound down — matching the route guard in settlement/page.tsx.
export default async function DashboardLayout({
    children,
}: {
    children: ReactNode;
}) {
    const session = await auth();
    const userId = session?.user?.id;
    // Solo + settled is the safe default when there's no session/settings row
    // yet: the partner surfaces stay hidden until the user opts in.
    let showSettlement = false;
    if (userId) {
        // Reuse the same settlement service the page uses so the nav gate and
        // the route guard agree on the balance (no hand-rolled query).
        const [{ sharesExpenses }, settlement] = await Promise.all([
            settingsRepository.getSettings(userId),
            getSettlement(userId),
        ]);
        showSettlement =
            sharesExpenses || !isBalanceSettled(settlement.balance);
    }

    return (
        <div className="flex min-h-screen flex-col">
            <header className="border-b">
                <AppNav
                    email={session?.user?.email ?? undefined}
                    showSettlement={showSettlement}
                />
            </header>
            {children}
        </div>
    );
}
