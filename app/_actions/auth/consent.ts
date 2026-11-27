"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { answerConsent } from "@/lib/auth/oauth-consent";
import type { ActionResult } from "@/lib/actions/result";
import { failureAttributes } from "@/lib/observability/health";
import { logAppEvent } from "@/lib/observability/log";

export type ConsentResult = ActionResult<string, ConsentInput, "error">;

const consentSchema = z.object({
    accept: z.boolean(),
    oauthQuery: z.string().min(1).max(8192),
});
type ConsentInput = z.infer<typeof consentSchema>;

/** Accept or deny an OAuth client; `data` is the URL to open next. */
export async function consentAction(input: unknown): Promise<ConsentResult> {
    const t = await getTranslations("auth.errors");
    const parsed = consentSchema.safeParse(input);
    if (!parsed.success) {
        logAppEvent("auth.oauth_consent_failed");
        return { ok: false, code: "error", message: t("unexpected") };
    }
    try {
        const url = await answerConsent(
            parsed.data.accept,
            parsed.data.oauthQuery,
        );
        return { ok: true, data: url };
    } catch (error) {
        logAppEvent("auth.oauth_consent_failed", failureAttributes(error));
        return { ok: false, code: "error", message: t("unexpected") };
    }
}
