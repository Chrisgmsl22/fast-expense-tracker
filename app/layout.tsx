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

// `minimumScale: 1` blocks zoom-OUT (the page never shrinks below a 1:1 fit, so
// no "mini desktop"); omitting `maximumScale` keeps pinch-zoom-IN available for
// accessibility. See ADR-0017.
export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    minimumScale: 1,
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
