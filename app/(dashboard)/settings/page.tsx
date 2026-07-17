import { auth } from "@/auth";
import { settingsRepository } from "@/lib/repositories";
import { SplitRuleForm } from "@/components/settings/SplitRuleForm";

// Per-request, DB-backed data — never prerender at build (no DB in preview builds, ADR-0004).
export const dynamic = "force-dynamic";

/** Sections designed in the mockup but deferred past CHORE-6.a (spec 0006 §8). */
const COMING_SOON = [
    "Cards",
    "Budget rule",
    "Category limits",
    "Preferences",
    "Privacy",
    "Export data",
    "Account",
] as const;

export default async function SettingsPage() {
    const session = await auth();
    const userId = session?.user?.id;
    // The proxy route gate guarantees a session; this satisfies the nullable
    // type and fails safe if it's ever reached without one.
    if (!userId) {
        return null;
    }

    const settings = await settingsRepository.getSettings(userId);

    return (
        <main className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
            <h1 className="text-2xl font-semibold">Settings</h1>

            <div className="mt-6 space-y-4">
                <SplitRuleForm
                    sharesExpenses={settings.sharesExpenses}
                    partnerName={settings.partnerName}
                    defaultSharePercentage={settings.defaultSharePercentage}
                />

                {/* Deferred sections (spec 0006 §8) — placeholders so the page
                    reads as the full Settings surface without shipping them yet. */}
                <section
                    aria-label="Coming soon"
                    className="rounded-xl border border-dashed p-5"
                >
                    <p className="font-semibold">More settings</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        These are on the way — configure them here soon.
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                        {COMING_SOON.map((label) => (
                            <li
                                key={label}
                                className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground"
                            >
                                {label}{" "}
                                <span className="text-xs">· coming soon</span>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </main>
    );
}
