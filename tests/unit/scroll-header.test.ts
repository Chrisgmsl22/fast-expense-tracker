import { describe, expect, it } from "vitest";

import {
    NAV_SCROLL_THRESHOLD,
    nextNavScrollState,
} from "@/components/nav/scroll-header";

describe("nextNavScrollState", () => {
    it("hides the bar on a scroll down past the threshold", () => {
        expect(nextNavScrollState({ hidden: false, lastY: 100 }, 120)).toEqual({
            hidden: true,
            lastY: 120,
        });
    });

    it("shows the bar again on a scroll up past the threshold", () => {
        expect(nextNavScrollState({ hidden: true, lastY: 400 }, 390)).toEqual({
            hidden: false,
            lastY: 390,
        });
    });

    it("ignores a move under the threshold, but keeps its start point", () => {
        const state = { hidden: false, lastY: 100 };
        const small = nextNavScrollState(state, 100 + NAV_SCROLL_THRESHOLD - 1);
        expect(small).toBe(state);
        // Slow scrolling adds up from the same start point.
        expect(
            nextNavScrollState(small, 100 + NAV_SCROLL_THRESHOLD).hidden,
        ).toBe(true);
    });

    it("clamps y to the furthest the page scrolls, so a spring-back is no scroll up", () => {
        const atBottom = { hidden: true, lastY: 900 };
        // iOS overshoots the bottom by 60px…
        const overshoot = nextNavScrollState(atBottom, 960, 900);
        expect(overshoot).toBe(atBottom);
        // …and springs back to it: the bar stays hidden.
        expect(nextNavScrollState(overshoot, 900, 900)).toBe(atBottom);
        // A real scroll up still shows it.
        expect(nextNavScrollState(atBottom, 890, 900).hidden).toBe(false);
    });

    it("never hides the bar on a page too short to scroll", () => {
        expect(
            nextNavScrollState({ hidden: false, lastY: 0 }, 40, -100),
        ).toEqual({ hidden: false, lastY: 0 });
    });

    it.each([0, -30])("always shows the bar at the top (y = %s)", (y) => {
        expect(nextNavScrollState({ hidden: true, lastY: 5 }, y)).toEqual({
            hidden: false,
            lastY: 0,
        });
    });
});
