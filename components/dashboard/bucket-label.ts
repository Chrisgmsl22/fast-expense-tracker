import { useTranslations } from "next-intl";

import type { BucketKey } from "@/lib/domain/dashboard";

/** The bucket names the dashboard and category screens print; savings carries its "/Inv" suffix here. */
export function useBucketLabel(): (key: BucketKey) => string {
    const tc = useTranslations("common.buckets");
    const t = useTranslations("dashboard.buckets");
    return (key) => (key === "savings" ? t("savingsShort") : tc(key));
}
