import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { signedOAuthQuery } from "@/lib/auth/oauth-query";

// The route gate in auth.config.ts bounces an already-signed-in visitor to
// /dashboard, so this only renders when logged out. It never reads the signup
// switch (ADR-0026): the signup page shows the closed message itself.
export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const t = await getTranslations("auth.login");
    return (
        <AuthShell
            heading={t("heading")}
            tagline={t("tagline")}
            switchPrompt={{
                text: t("switchText"),
                href: "/signup",
                label: t("switchLink"),
            }}
        >
            <LoginForm
                sessionExpired={params.reason === "session-expired"}
                oauthQuery={signedOAuthQuery(params)}
            />
        </AuthShell>
    );
}
