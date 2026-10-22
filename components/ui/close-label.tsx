"use client";

import { useTranslations } from "next-intl";

/** The screen-reader text of a dialog or sheet close button, in the active locale. */
export function CloseLabel() {
    return useTranslations("common.actions")("close");
}
