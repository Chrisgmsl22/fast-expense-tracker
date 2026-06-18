/**
 * Typed result for server actions — the discriminated-union "Result" pattern.
 *
 * Callers branch on `ok`, and on `code` for failures, instead of matching
 * free-form message strings (which drift and aren't checkable). `message` is
 * the human-facing text; `fieldErrors` keys are constrained to the action's
 * input shape, so a typo'd field name is a compile error, not a runtime no-op.
 *
 * Every server action returns `ActionResult<...>`; new actions reuse this
 * instead of inventing their own shape (see coding-conventions.md §Error handling).
 */
export type FieldErrors<TInput> = Partial<Record<keyof TInput, string[]>>;

export type ActionFailure<TInput, TCode extends string> = {
    ok: false;
    code: TCode;
    message: string;
    fieldErrors?: FieldErrors<TInput>;
};

export type ActionResult<TData, TInput, TCode extends string> =
    | { ok: true; data: TData }
    | ActionFailure<TInput, TCode>;
