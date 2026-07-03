import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "fast-expense-tracker",
    description:
        "Personal expense tracker — MXN, shared-split aware, weekly review.",
};

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
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
            <body className="min-h-full flex flex-col">
                {children}
                <SpeedInsights />
            </body>
        </html>
    );
}
