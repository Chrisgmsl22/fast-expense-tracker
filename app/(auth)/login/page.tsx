import { LoginForm } from "@/components/auth/LoginForm";

// Card-method colors (docs/designs-screens/README.md §Design Tokens): Amex
// Platinum · Amex Gold · NU · BBVA · Cash. Per-card hex, not theme tokens —
// rendered here as the brand-panel dot motif.
const CARD_DOT_COLORS = ["#6b7280", "#c79a3b", "#820ad1", "#0b5cab", "#16a34a"];

function CardDots() {
    return (
        <div className="flex items-center gap-2" aria-hidden="true">
            {CARD_DOT_COLORS.map((color) => (
                <span
                    key={color}
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                />
            ))}
        </div>
    );
}

// Signup is deferred (ADR-0009) — non-interactive placeholder. `aria-disabled`
// + the `group` wrapper give a not-allowed cursor and reveal "Coming soon" on
// hover. Light text on the dark mobile column; dark text on the white desktop
// panel.
function SignUpComingSoon() {
    return (
        <span className="group relative inline-flex cursor-not-allowed">
            <span
                aria-disabled="true"
                className="font-medium text-white underline underline-offset-2 md:text-foreground"
            >
                Sign up
            </span>
            <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background opacity-0 transition-opacity group-hover:opacity-100"
            >
                Coming soon
            </span>
        </span>
    );
}

// The route gate in auth.config.ts bounces an already-signed-in visitor to
// /expenses, so this only renders when logged out. Two-panel layout: a dark
// brand panel + the form. Mobile collapses to a single dark column.
export default function LoginPage() {
    return (
        <main className="flex min-h-screen flex-col bg-foreground">
            <div className="flex min-h-screen flex-1 flex-col md:flex-row">
                {/* Brand panel (dark). Mobile: top of the dark column. Desktop: left half, full height. */}
                <section className="flex flex-1 flex-col bg-foreground p-8 text-white md:w-1/2 md:flex-none md:p-16">
                    {/* Mobile brand */}
                    <div className="flex flex-1 flex-col md:hidden">
                        <CardDots />
                        <div className="mt-auto pt-20">
                            <h1 className="text-3xl font-bold">Fast Expense</h1>
                            <p className="mt-1.5 text-sm text-white/50">
                                Log in to keep tracking.
                            </p>
                        </div>
                    </div>
                    {/* Desktop brand */}
                    <div className="hidden flex-1 flex-col md:flex">
                        <span className="text-lg font-semibold">
                            Fast Expense
                        </span>
                        <div className="mt-auto">
                            <h2 className="text-3xl leading-tight font-bold">
                                Know exactly where the money goes.
                            </h2>
                            <p className="mt-3 text-sm text-white/50">
                                For better and smarter finances
                            </p>
                        </div>
                        <div className="mt-10">
                            <CardDots />
                        </div>
                    </div>
                </section>

                {/* Form panel. Mobile: transparent over the dark column. Desktop: white right half, full height. */}
                <section className="flex flex-col p-8 pb-10 md:w-1/2 md:flex-none md:justify-center md:bg-background md:p-16">
                    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
                        <h1 className="hidden text-2xl font-semibold md:block">
                            Log in
                        </h1>
                        <LoginForm />
                        <p className="text-center text-sm text-white/60 md:text-muted-foreground">
                            No account? <SignUpComingSoon />
                        </p>
                    </div>
                </section>
            </div>
        </main>
    );
}
