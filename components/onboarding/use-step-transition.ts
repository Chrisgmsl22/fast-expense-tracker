"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

import { cn } from "@/lib/utils";

import { STEP_COUNT } from "./onboarding-model";

type Phase = "idle" | "leaving" | "entering";

function stepAfter(current: number, delta: number): number {
    return Math.min(STEP_COUNT, Math.max(1, current + delta));
}

function prefersReducedMotion(): boolean {
    return (
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
}

/** The same completion check Base UI runs before it unmounts a closing popup. */
function animationsFinished(element: HTMLElement): Promise<void> {
    return Promise.all(
        element.getAnimations().map((animation) => animation.finished),
    ).then(
        () => undefined,
        // A cancelled animation still leaves the element in its end state.
        () => undefined,
    );
}

export function ignoreClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
}

/**
 * Moves between wizard steps: the current content fades out, the next step
 * mounts and fades in, and only then is it `settled`. A move asked for while
 * one runs is dropped. With reduced motion, or without Web Animations support,
 * the step changes at once.
 */
export function useStepTransition() {
    const [step, setStep] = useState(1);
    const [phase, setPhase] = useState<Phase>("idle");
    const contentRef = useRef<HTMLDivElement>(null);
    const busyRef = useRef(false);
    const deltaRef = useRef(0);

    function move(delta: number) {
        if (busyRef.current) return;
        const content = contentRef.current;
        if (
            prefersReducedMotion() ||
            typeof content?.getAnimations !== "function"
        ) {
            setStep((current) => stepAfter(current, delta));
            return;
        }
        busyRef.current = true;
        deltaRef.current = delta;
        setPhase("leaving");
    }

    useEffect(() => {
        const content = contentRef.current;
        if (phase === "idle" || !content) return;
        let cancelled = false;
        void animationsFinished(content).then(() => {
            if (cancelled) return;
            if (phase === "leaving") {
                setStep((current) => stepAfter(current, deltaRef.current));
                setPhase("entering");
                return;
            }
            busyRef.current = false;
            setPhase("idle");
        });
        return () => {
            cancelled = true;
        };
    }, [phase]);

    return {
        step,
        /** The step on screen has finished appearing. */
        settled: phase === "idle",
        contentRef,
        // The arriving step starts transparent (@starting-style); leaving fades to 0.
        contentClassName: cn(
            "transition-opacity duration-150 ease-out motion-reduce:transition-none",
            phase === "leaving" && "opacity-0",
            phase === "entering" && "starting:opacity-0",
        ),
        next: () => move(1),
        back: () => move(-1),
    };
}
