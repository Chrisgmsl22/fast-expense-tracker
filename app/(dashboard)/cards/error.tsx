"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export default function CardBalancesError({ reset }: { reset: () => void }) {
    const t = useTranslations("money.cards");
    return (
        <main className="p-4 sm:p-6 lg:p-8">
            <p className="text-sm text-destructive" role="alert">
                {t("loadError")}
            </p>
            <Button variant="outline" onClick={reset} className="mt-3">
                {t("retry")}
            </Button>
        </main>
    );
}
