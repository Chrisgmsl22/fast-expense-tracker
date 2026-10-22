import { useTranslations } from "next-intl";

import { CARD_PALETTE } from "@/lib/palette";
import type { AddCardInput } from "@/lib/schemas/card";

export const DEFAULT_CARD_COLOR = CARD_PALETTE[0]?.hex ?? "#6b7280";

/** Types a user may add — Cash is excluded on purpose (see `addCardTypeSchema`). */
export type AddCardType = AddCardInput["type"];

export const ADD_TYPES: readonly AddCardType[] = ["credit", "debit"];

/** Display label for every card type (Cash is a locked, non-addable system card). */
export function useCardTypeLabel(): (type: string) => string {
    const t = useTranslations("settings.cards.types");
    return (type) =>
        type === "credit" || type === "debit" || type === "cash"
            ? t(type)
            : type;
}
