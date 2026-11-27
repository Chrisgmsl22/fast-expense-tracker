"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { consentAction } from "@/app/_actions/auth/consent";
import {
    AUTH_ERROR_CLASS,
    AUTH_MUTED_CLASS,
    AUTH_SUBMIT_CLASS,
} from "./auth-form-styles";

const SCOPE_LINES = {
    openid: "openid",
    profile: "profile",
    email: "email",
    offline_access: "offlineAccess",
    "fet:api": "api",
} as const;

function isListedScope(scope: string): scope is keyof typeof SCOPE_LINES {
    return scope in SCOPE_LINES;
}

/** Allow or deny an OAuth client, then open the URL the provider returns. */
export function ConsentForm({
    clientName,
    scopes,
    oauthQuery,
}: {
    clientName: string;
    scopes: string[];
    oauthQuery: string;
}) {
    const t = useTranslations("auth.consent");
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function answer(accept: boolean) {
        setError(null);
        startTransition(async () => {
            const res = await consentAction({ accept, oauthQuery });
            if (res.ok) window.location.assign(res.data);
            else setError(res.message);
        });
    }

    return (
        <div className="flex w-full flex-col gap-5">
            <p className="text-white md:text-foreground">
                {t("prompt", { client: clientName })}
            </p>
            <div>
                <p className={`text-sm ${AUTH_MUTED_CLASS}`}>
                    {t("scopesLabel")}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white md:text-foreground">
                    {scopes.filter(isListedScope).map((scope) => (
                        <li key={scope}>{t(`scopes.${SCOPE_LINES[scope]}`)}</li>
                    ))}
                </ul>
            </div>
            {error && (
                <p className={AUTH_ERROR_CLASS} role="alert">
                    {error}
                </p>
            )}
            <Button
                type="button"
                disabled={pending}
                className={AUTH_SUBMIT_CLASS}
                onClick={() => answer(true)}
            >
                {pending ? t("pending") : t("allow")}
            </Button>
            <Button
                type="button"
                variant="outline"
                disabled={pending}
                className="h-11 w-full"
                onClick={() => answer(false)}
            >
                {t("deny")}
            </Button>
        </div>
    );
}
