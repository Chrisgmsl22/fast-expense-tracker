export const WIZARD_LABEL_CLASS = "text-xs font-semibold text-muted-foreground";

export const WIZARD_FIELD_CLASS =
    "mt-1.5 h-[46px] rounded-xl bg-muted/40 px-3.5 sm:text-[15px]";

/** Matches a select trigger to the wizard field height; the trigger sets its own per size. */
export const WIZARD_SELECT_CLASS = "data-[size=default]:h-[46px]";

/** The design's lighter grey (#9ca3af): the muted token, faded. */
export const WIZARD_FAINT_TEXT_CLASS = "text-muted-foreground/70";

export const WIZARD_PANEL_CLASS = "rounded-xl bg-muted/60";

/**
 * The disabled look for a busy button, which stays focusable through `aria-disabled`,
 * so the button's own `disabled:` styles never apply: faded, and no press.
 */
export const WIZARD_BUSY_BUTTON_CLASS =
    "aria-disabled:opacity-50 aria-disabled:active:not-aria-[haspopup]:translate-y-0";

/** A busy ghost button also keeps its idle background on hover. */
export const WIZARD_BUSY_GHOST_BUTTON_CLASS = `${WIZARD_BUSY_BUTTON_CLASS} aria-disabled:hover:bg-transparent`;

/** A busy outline button also keeps its idle background on hover. */
export const WIZARD_BUSY_OUTLINE_BUTTON_CLASS = `${WIZARD_BUSY_BUTTON_CLASS} aria-disabled:hover:bg-background dark:aria-disabled:hover:bg-input/30`;
