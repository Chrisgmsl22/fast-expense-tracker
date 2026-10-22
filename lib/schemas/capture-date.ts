import { z } from "zod";

import { isAfterTodayCdmx } from "@/lib/dates";

export const FUTURE_DATE_MESSAGE = "Date can't be later than today";
export const INVALID_DATE_MESSAGE = "Enter a valid date";

/**
 * A user-entered calendar date, coerced from the form string and capped at today
 * in CDMX. Create and edit both parse it, so no write can move a row into a
 * month no page opens. The input's `max` is a hint; this is the guard.
 */
export const captureDateSchema = z.coerce
    .date({ error: INVALID_DATE_MESSAGE })
    .refine((date) => !isAfterTodayCdmx(date), FUTURE_DATE_MESSAGE);
