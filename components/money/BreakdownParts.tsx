import type { ReactNode } from "react";

import { formatMxn } from "@/lib/format";
import {
    TONE_COLOR,
    TONE_TEXT_CLASS,
    type MoneyTone,
} from "@/components/money/summary-model";

export function Heading({ children }: { children: ReactNode }) {
    return (
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {children}
        </h3>
    );
}

export function Section({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <section>
            <Heading>{title}</Heading>
            <div className="mt-3">{children}</div>
        </section>
    );
}

/** One of the two pots a month's money came out of. */
export function Pot({
    tone,
    title,
    amount,
    caption,
    children,
}: {
    tone: MoneyTone;
    title: string;
    amount: number;
    caption: string;
    children?: ReactNode;
}) {
    return (
        <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2">
                <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: TONE_COLOR[tone] }}
                />
                <span
                    className={`text-xs font-semibold tracking-wide uppercase ${TONE_TEXT_CLASS[tone]}`}
                >
                    {title}
                </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
                {formatMxn(amount)}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">{caption}</p>
            {children}
        </div>
    );
}

/**
 * A pot's itemisation. It draws only a COMPLETE partition of `headline`, and only
 * when that splits in two or more: a lone part equal to its own headline reads as
 * double the money, and parts falling short of it would hide the difference.
 */
export function PotParts({
    headline,
    parts,
    caption,
}: {
    headline: number;
    parts: { label: string; amount: number; tone?: MoneyTone }[];
    /** Names the cut, for a pot that shows more than one. Drawn only with the parts. */
    caption?: string;
}) {
    const shown = parts.filter((part) => part.amount > 0);
    const sum = shown.reduce((total, part) => total + part.amount, 0);
    if (shown.length < 2 || Math.abs(sum - headline) >= 0.005) return null;
    return (
        <>
            {caption && <PartsCaption>{caption}</PartsCaption>}
            {shown.map((part) => (
                <Row
                    key={part.label}
                    label={part.label}
                    amount={part.amount}
                    tone={part.tone}
                />
            ))}
        </>
    );
}

/** The small label over one cut of a pot, e.g. "By who it went to". */
export function PartsCaption({ children }: { children: ReactNode }) {
    return (
        <p className="pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {children}
        </p>
    );
}

export function Row({
    label,
    amount,
    tone = "plain",
    note,
}: {
    label: string;
    amount: number;
    tone?: MoneyTone;
    /** A short qualifier after the label, e.g. that the money was kept. */
    note?: string;
}) {
    return (
        <div className="flex items-center gap-3 text-sm">
            <span className="min-w-0 text-muted-foreground">
                <span>{label}</span>
                {note && <span className="ml-1.5 text-xs">{note}</span>}
            </span>
            <span
                className={`ml-auto font-semibold tabular-nums ${TONE_TEXT_CLASS[tone]}`}
            >
                {formatMxn(amount)}
            </span>
        </div>
    );
}
