import { useTranslations } from "next-intl";

/** One swatch + label; the swatch matches the journal row's left-border colour. */
const ROWS = [
    { swatch: "bg-positive", key: "partnerPaidYou" },
    { swatch: "bg-positive", key: "partnerOwesYou" },
    { swatch: "bg-transfer", key: "youPaidPartner" },
    { swatch: "bg-debt", key: "youOwePartner" },
] as const;

/**
 * Colour key for the movement journal (CHORE-5) — the three money kinds are
 * left-border + tint colour-coded in the journal, so this legend decodes them
 * at a glance. Sits in the left rail beside the balance breakdown.
 */
export function SettlementJournalKey({ partnerName }: { partnerName: string }) {
    const t = useTranslations("settlement.journalKey");
    return (
        <div className="rounded-xl border p-5">
            <p className="font-semibold">{t("title")}</p>
            <ul className="mt-3 space-y-2 text-sm">
                {ROWS.map((r) => (
                    <li key={r.key} className="flex items-center gap-2.5">
                        <span
                            aria-hidden
                            className={`size-3 shrink-0 rounded ${r.swatch}`}
                        />
                        {t(r.key, { partner: partnerName })}
                    </li>
                ))}
            </ul>
        </div>
    );
}
