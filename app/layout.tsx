import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("common.metadata");
    return { title: "fast-expense-tracker", description: t("description") };
}

// Scale pinned to 1 (no zoom in or out). `minimumScale: 1` stops the "mini
// desktop" zoom-out; `maximumScale: 1` locks zoom-in per the user's request.
// NOTE: WebKit (iOS Safari + Chrome-on-iOS) ignores maximumScale for the input
// focus-zoom — that's prevented by 16px form fields (text-base on mobile), not
// this. maximumScale still applies on Android/touch. See ADR-0017.
export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    minimumScale: 1,
    maximumScale: 1,
    // The page reaches under Safari's bars; fixed chrome pads with
    // env(safe-area-inset-*) so nothing sits beneath them.
    viewportFit: "cover",
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const locale = await getLocale();
    return (
        <html
            lang={locale}
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
            {/* viewport-fit=cover reaches under a landscape notch too, so the
                side insets pad every page, auth included. */}
            <body className="min-h-full flex flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
                <NextIntlClientProvider locale={locale}>
                    {children}
                </NextIntlClientProvider>
                <SpeedInsights />
            </body>
        </html>
    );
}
