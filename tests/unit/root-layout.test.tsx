import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// next/font and Speed Insights aren't resolvable/meaningful under jsdom — stub
// them to keep this a pure "is the component wired into the layout?" check.
vi.mock("next/font/google", () => ({
    Geist: () => ({ variable: "--font-geist-sans" }),
    Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

vi.mock("@vercel/speed-insights/next", () => ({
    SpeedInsights: () => <div data-testid="speed-insights" />,
}));

import RootLayout from "@/app/layout";

describe("Root layout", () => {
    it("Should mount Vercel Speed Insights", () => {
        const { getByTestId } = render(
            <RootLayout>
                <main>child</main>
            </RootLayout>,
        );
        expect(getByTestId("speed-insights")).toBeDefined();
    });
});
