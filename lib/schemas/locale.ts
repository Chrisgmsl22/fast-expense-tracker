import { z } from "zod";

import { LOCALES } from "@/i18n/config";

export const setLocaleInputSchema = z.object({ locale: z.enum(LOCALES) });

export type SetLocaleInput = z.infer<typeof setLocaleInputSchema>;
