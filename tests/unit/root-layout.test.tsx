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

import RootLayout, { generateMetadata } from "@/app/layout";
import { setServerLocale } from "@/tests/support/intl";

describe("Root layout", () => {
    it("Should mount Vercel Speed Insights", async () => {
        const { getByTestId } = render(
            await RootLayout({ children: <main>child</main> }),
        );
        expect(getByTestId("speed-insights")).toBeDefined();
    });

    it.each(["es", "en"] as const)(
        "Should set the html lang to the active locale (%s)",
        async (locale) => {
            setServerLocale(locale);
            const html = await RootLayout({ children: <main>child</main> });
            expect(html.props.lang).toBe(locale);
        },
    );

    it("Should describe the app in the active locale", async () => {
        setServerLocale("es");
        expect((await generateMetadata()).description).toBe(
            "Control de gastos personales en MXN, con gastos compartidos y revisión semanal.",
        );
    });
});
