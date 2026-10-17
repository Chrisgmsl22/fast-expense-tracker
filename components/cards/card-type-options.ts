import { CARD_PALETTE } from "@/lib/palette";
import type { AddCardInput } from "@/lib/schemas/card";

export const DEFAULT_CARD_COLOR = CARD_PALETTE[0]?.hex ?? "#6b7280";

/** Display labels for every card type (Cash is a locked, non-addable system card). */
const CARD_TYPE_LABELS: Record<string, string> = {
    credit: "Credit",
    debit: "Debit",
    cash: "Cash",
};

/** Types a user may add — Cash is excluded on purpose (see `addCardTypeSchema`). */
export type AddCardType = AddCardInput["type"];

export const ADD_TYPE_OPTIONS: ReadonlyArray<{
    value: AddCardType;
    label: string;
}> = [
    { value: "credit", label: "Credit" },
    { value: "debit", label: "Debit" },
];

export function typeLabel(type: string): string {
    return CARD_TYPE_LABELS[type] ?? type;
}
