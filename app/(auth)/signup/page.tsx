import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { signupGate } from "@/lib/repositories";

// The owner flips the switch at runtime (ADR-0026), so never prerender it.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
    const gateState = await signupGate.read();
    const t = await getTranslations("auth.signup");
    return (
        <AuthShell
            heading={t("heading")}
            tagline={t("tagline")}
            switchPrompt={{
                text: t("switchText"),
                href: "/login",
                label: t("switchLink"),
            }}
        >
            {gateState.open ? (
                <SignupForm />
            ) : (
                <p
                    role="status"
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white md:border-border md:bg-muted md:text-foreground"
                >
                    {t("closed")}
                </p>
            )}
        </AuthShell>
    );
}
