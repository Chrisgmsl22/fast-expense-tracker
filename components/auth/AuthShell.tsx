import type { ReactNode } from "react";
import Link from "next/link";

import { CARD_PALETTE } from "@/lib/palette";

// Card-method colors: Amex Platinum · Amex Gold · NU · BBVA · Cash — the first
// five palette swatches are exactly the seeded card colours (spec 0006 §6).
// Sourced from the shared palette so these brand dots can't drift from the seed.
const CARD_DOT_COLORS = CARD_PALETTE.slice(0, 5).map((swatch) => swatch.hex);

function CardDots() {
    return (
        <div className="flex items-center gap-2" aria-hidden="true">
            {CARD_DOT_COLORS.map((color) => (
                <span
                    key={color}
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                />
            ))}
        </div>
    );
}

type Props = {
    /** Desktop form heading, e.g. "Log in". */
    heading: string;
    /** Mobile line under the brand name. */
    tagline: string;
    /** The "No account? Sign up" style line under the form. */
    switchPrompt: { text: string; href: string; label: string };
    children: ReactNode;
};

/**
 * The login and signup layout: a dark brand panel beside the form, collapsing
 * to one dark column on mobile.
 */
export function AuthShell({ heading, tagline, switchPrompt, children }: Props) {
    return (
        <main className="flex min-h-screen flex-col bg-foreground">
            <div className="flex min-h-screen flex-1 flex-col md:flex-row">
                {/* Brand panel (dark). Mobile: top of the dark column. Desktop: left half, full height. */}
                <section className="flex flex-1 flex-col bg-foreground p-8 text-white md:w-1/2 md:flex-none md:p-16">
                    {/* Mobile brand */}
                    <div className="flex flex-1 flex-col md:hidden">
                        <CardDots />
                        <div className="mt-auto pt-20">
                            <h1 className="text-3xl font-bold">Fast Expense</h1>
                            <p className="mt-1.5 text-sm text-white/50">
                                {tagline}
                            </p>
                        </div>
                    </div>
                    {/* Desktop brand */}
                    <div className="hidden flex-1 flex-col md:flex">
                        <span className="text-lg font-semibold">
                            Fast Expense
                        </span>
                        <div className="mt-auto">
                            <h2 className="text-3xl leading-tight font-bold">
                                Know exactly where the money goes.
                            </h2>
                            <p className="mt-3 text-sm text-white/50">
                                For better and smarter finances
                            </p>
                        </div>
                        <div className="mt-10">
                            <CardDots />
                        </div>
                    </div>
                </section>

                {/* Form panel. Mobile: transparent over the dark column. Desktop: white right half, full height. */}
                <section className="flex flex-col p-8 pb-10 md:w-1/2 md:flex-none md:justify-center md:bg-background md:p-16">
                    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
                        <h1 className="hidden text-2xl font-semibold md:block">
                            {heading}
                        </h1>
                        {children}
                        <p className="text-center text-sm text-white/60 md:text-muted-foreground">
                            {switchPrompt.text}{" "}
                            <Link
                                href={switchPrompt.href}
                                className="font-medium text-white underline underline-offset-2 md:text-foreground"
                            >
                                {switchPrompt.label}
                            </Link>
                        </p>
                    </div>
                </section>
            </div>
        </main>
    );
}
