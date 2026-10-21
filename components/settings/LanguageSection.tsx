"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { setLocale } from "@/app/_actions/locale/set-locale";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";

export function LanguageSection() {
    const t = useTranslations("common.language");
    const current = useLocale();
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function choose(locale: Locale) {
        if (locale === current) return;
        startTransition(async () => {
            try {
                const res = await setLocale({ locale });
                if (res.ok) {
                    setError(null);
                    router.refresh();
                } else {
                    setError(res.message);
                }
            } catch {
                setError(t("error"));
            }
        });
    }

    return (
        <section
            aria-labelledby="language-heading"
            className="rounded-xl border p-5"
        >
            <h2 id="language-heading" className="font-semibold">
                {t("title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
                {t("description")}
            </p>
            <div
                role="group"
                aria-labelledby="language-heading"
                className="mt-4 flex gap-2"
            >
                {LOCALES.map((locale) => (
                    <Button
                        key={locale}
                        type="button"
                        lang={locale}
                        variant={locale === current ? "default" : "outline"}
                        aria-pressed={locale === current}
                        disabled={pending}
                        onClick={() => choose(locale)}
                    >
                        {LOCALE_NAMES[locale]}
                    </Button>
                ))}
            </div>
            {error && (
                <p className="mt-4 text-sm text-destructive" role="alert">
                    {error}
                </p>
            )}
        </section>
    );
}
