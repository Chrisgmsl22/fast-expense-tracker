/** Scroll distance, in px, before the mobile top bar reacts in either direction. */
export const NAV_SCROLL_THRESHOLD = 8;

export type NavScrollState = { hidden: boolean; lastY: number };

/**
 * Hides the bar on a scroll down and shows it on any scroll up. Movement under
 * the threshold is ignored but not forgotten: `lastY` stays put, so slow scrolls
 * still add up. At the top of the page the bar always shows.
 *
 * `y` is clamped to `maxY`, the furthest the page can scroll: iOS rubber-bands
 * past the bottom and springs back, and that spring-back is not a scroll up.
 */
export function nextNavScrollState(
    state: NavScrollState,
    y: number,
    maxY = Number.POSITIVE_INFINITY,
): NavScrollState {
    const clamped = Math.min(y, maxY);
    if (clamped <= 0) return { hidden: false, lastY: 0 };
    const delta = clamped - state.lastY;
    if (Math.abs(delta) < NAV_SCROLL_THRESHOLD) return state;
    return { hidden: delta > 0, lastY: clamped };
}
