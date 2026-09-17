/**
 * The one sentence that warns a reader they are logging from a past month. Shared
 * so the page and the dialogs cannot drift: a modal covers the page, so the warning
 * has to travel INTO the dialog, where it matters most.
 */
export const pastMonthNotice = (monthLabel: string): string =>
    `You are viewing ${monthLabel}. Anything you log is dated today and joins the open settlement.`;
