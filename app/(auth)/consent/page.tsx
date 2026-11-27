import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth/AuthShell";
import { ConsentForm } from "@/components/auth/ConsentForm";
import { AUTH_ERROR_CLASS } from "@/components/auth/auth-form-styles";
import { loadConsentRequest } from "@/lib/auth/oauth-consent";
import { signedOAuthQuery } from "@/lib/auth/oauth-query";

export const dynamic = "force-dynamic";

export default async function ConsentPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const oauthQuery = signedOAuthQuery(await searchParams);
    const request = oauthQuery ? await loadConsentRequest(oauthQuery) : null;
    const t = await getTranslations("auth.consent");
    return (
        <AuthShell heading={t("heading")} tagline={t("tagline")}>
            {oauthQuery && request ? (
                <ConsentForm
                    clientName={request.clientName}
                    scopes={request.scopes}
                    oauthQuery={oauthQuery}
                />
            ) : (
                <p className={AUTH_ERROR_CLASS} role="alert">
                    {t("invalid")}
                </p>
            )}
        </AuthShell>
    );
}
