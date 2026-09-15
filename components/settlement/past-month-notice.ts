/**
 * The one sentence that warns a reader they are logging from a past month.
 *
 * It lives here so the page and the dialogs cannot drift into two phrasings: a
 * modal covers the page, so the warning has to travel INTO the dialog — that is
 * exactly the moment it matters, when the month behind the overlay is no longer
 * visible.
 */
export const pastMonthNotice = (monthLabel: string): string =>
    `You are viewing ${monthLabel}. Anything you log is dated today and joins the open settlement.`;
