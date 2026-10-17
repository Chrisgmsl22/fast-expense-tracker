import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

// The route gate in auth.config.ts bounces an already-signed-in visitor to
// /dashboard, so this only renders when logged out. It never reads the signup
// switch (ADR-0026): the signup page shows the closed message itself.
export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ reason?: string | string[] }>;
}) {
    const { reason } = await searchParams;
    return (
        <AuthShell
            heading="Log in"
            tagline="Log in to keep tracking."
            switchPrompt={{
                text: "No account?",
                href: "/signup",
                label: "Sign up",
            }}
        >
            <LoginForm sessionExpired={reason === "session-expired"} />
        </AuthShell>
    );
}
