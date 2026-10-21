"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export default function ExpensesError({ reset }: { reset: () => void }) {
    const t = useTranslations("expenses.page");
    return (
        <main className="p-8">
            <p className="text-sm text-red-600" role="alert">
                {t("loadError")}
            </p>
            <Button variant="outline" onClick={reset} className="mt-3">
                {t("retry")}
            </Button>
        </main>
    );
}
