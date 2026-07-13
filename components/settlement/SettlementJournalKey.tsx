import { PARTNER_NAME } from "@/lib/partner";

/** One swatch + label; the swatch matches the journal row's left-border colour. */
const ROWS: { swatch: string; label: string }[] = [
    { swatch: "bg-positive", label: `${PARTNER_NAME} paid you` },
    { swatch: "bg-transfer", label: `You paid ${PARTNER_NAME}` },
    { swatch: "bg-debt", label: `You owe ${PARTNER_NAME}` },
];

/**
 * Colour key for the movement journal (CHORE-5) — the three money kinds are
 * left-border + tint colour-coded in the journal, so this legend decodes them
 * at a glance. Sits in the left rail beside the balance breakdown.
 */
export function SettlementJournalKey() {
    return (
        <div className="rounded-xl border p-5">
            <p className="font-semibold">Journal key</p>
            <ul className="mt-3 space-y-2 text-sm">
                {ROWS.map((r) => (
                    <li key={r.label} className="flex items-center gap-2.5">
                        <span
                            aria-hidden
                            className={`size-3 shrink-0 rounded ${r.swatch}`}
                        />
                        {r.label}
                    </li>
                ))}
            </ul>
        </div>
    );
}
