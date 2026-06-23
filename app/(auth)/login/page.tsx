import { LoginForm } from "@/components/auth/LoginForm";
import { Button } from "@/components/ui/button";

// The route gate in auth.config.ts bounces an already-signed-in visitor to
// /expenses, so this only renders when logged out.
export default function LoginPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
            <h1 className="text-2xl font-semibold">Log in</h1>
            <LoginForm />
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <span>Don&apos;t have an account?</span>
                {/* Signup is deferred (ADR-0009) — placeholder only. The disabled
                    button sets `pointer-events: none`, so hovers fall through to
                    this `group` wrapper: it shows the not-allowed cursor and
                    reveals the "Coming soon" tooltip on hover. */}
                <span className="group relative inline-flex cursor-not-allowed">
                    <Button variant="outline" disabled aria-disabled="true">
                        Sign up
                    </Button>
                    <span
                        role="tooltip"
                        className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity group-hover:opacity-100"
                    >
                        Coming soon
                    </span>
                </span>
            </div>
        </main>
    );
}
