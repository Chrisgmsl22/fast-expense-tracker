import { getTranslations } from "next-intl/server";

import type { Translations } from "@/app/_actions/settings/localize";

// Keys are the English messages in lib/schemas/card.ts.
export async function cardSchemaMessages(): Promise<Translations> {
    const t = await getTranslations("settings.cards.errors");
    return {
        "Card name is required": t("nameRequired"),
        "Card name is too long": t("nameTooLong"),
        "Enter a valid #RRGGBB color": t("invalidColor"),
        "Card is required": t("cardRequired"),
    };
}
