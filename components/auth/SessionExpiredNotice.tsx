import { useTranslations } from "next-intl";

export function SessionExpiredNotice() {
    const t = useTranslations("auth.sessionExpired");
    return (
        <p
            role="status"
            className="rounded-lg border border-destructive/30 bg-red-50 px-3 py-2 text-sm text-destructive"
        >
            {t("notice")}
        </p>
    );
}
