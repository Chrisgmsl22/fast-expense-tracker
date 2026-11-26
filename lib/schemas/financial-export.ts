import { z } from "zod";

export const financialExportSchema = z.discriminatedUnion("type", [
    z
        .object({
            type: z.literal("year"),
            period: z.string().regex(/^(19|20|21)\d{2}$/),
        })
        .strict(),
    z
        .object({
            type: z.literal("month"),
            period: z.string().regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/),
        })
        .strict(),
]);
export type FinancialExportInput = z.infer<typeof financialExportSchema>;
