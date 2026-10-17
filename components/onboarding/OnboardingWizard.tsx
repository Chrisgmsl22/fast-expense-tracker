"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { OnboardingData } from "@/lib/onboarding/load-onboarding";
import { cn } from "@/lib/utils";

import { BudgetStep } from "./BudgetStep";
import { CardsStep } from "./CardsStep";
import { CategoriesStep } from "./CategoriesStep";
import { DoneStep } from "./DoneStep";
import { IncomeStep } from "./IncomeStep";
import { NameStep } from "./NameStep";
import { initialValues, type WizardValues } from "./onboarding-model";
import { SharingStep } from "./SharingStep";
import { ignoreClick, useStepTransition } from "./use-step-transition";
import { WelcomeStep } from "./WelcomeStep";
import { WizardProgress } from "./WizardProgress";

// Popup and backdrop fade out together; Base UI waits for this before it unmounts them.
const CLOSE_FADE_CLASS =
    "transition-opacity duration-200 ease-out data-ending-style:opacity-0 motion-reduce:transition-none";

/**
 * The first-run setup. It cannot be dismissed: only "Open the app" on the last
 * step finishes it, and until then it shows on every visit, prefilled with
 * whatever was already saved.
 */
export function OnboardingWizard({ data }: { data: OnboardingData }) {
    const router = useRouter();
    const [open, setOpen] = useState(true);
    // `data` only seeds this state, so the refresh after each save keeps the step and values.
    const { step, settled, contentRef, contentClassName, next, back } =
        useStepTransition();
    const [values, setValues] = useState<WizardValues>(() =>
        initialValues(data),
    );
    const [savedName, setSavedName] = useState(data.name);
    const [savedIncome, setSavedIncome] = useState(data.fixedIncome);
    const headingRef = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        if (settled) headingRef.current?.focus();
    }, [step, settled]);

    const update = <K extends keyof WizardValues>(
        key: K,
        value: WizardValues[K],
    ) => setValues((current) => ({ ...current, [key]: value }));

    const nav = { headingRef, onBack: back, onNext: next };

    return (
        <Dialog
            open={open}
            disablePointerDismissal
            onOpenChangeComplete={(isOpen) => {
                if (!isOpen) router.refresh();
            }}
        >
            <DialogContent
                showCloseButton={false}
                initialFocus={headingRef}
                // The overlay portals to <body>, outside any .sidebar-theme, so it brings its own.
                overlayClassName={cn(
                    "sidebar-theme bg-sidebar",
                    CLOSE_FADE_CLASS,
                )}
                className={cn(
                    "flex flex-col gap-0 p-0 sm:min-h-[520px] sm:max-w-[420px] sm:rounded-[18px] sm:shadow-[0_20px_50px_rgba(0,0,0,.4)] sm:ring-0",
                    CLOSE_FADE_CLASS,
                )}
            >
                <WizardProgress step={step} />
                <div
                    key={step}
                    ref={contentRef}
                    className={cn("flex flex-1 flex-col", contentClassName)}
                    onClickCapture={settled && open ? undefined : ignoreClick}
                >
                    {step === 1 && <WelcomeStep {...nav} />}
                    {step === 2 && (
                        <NameStep
                            {...nav}
                            value={values.name}
                            savedName={savedName}
                            onChange={(name) => update("name", name)}
                            onSaved={setSavedName}
                        />
                    )}
                    {step === 3 && (
                        <SharingStep
                            {...nav}
                            values={values.sharing}
                            onChange={(sharing) => update("sharing", sharing)}
                        />
                    )}
                    {step === 4 && (
                        <IncomeStep
                            {...nav}
                            value={values.income}
                            savedIncome={savedIncome}
                            onChange={(income) => update("income", income)}
                            onSaved={setSavedIncome}
                        />
                    )}
                    {step === 5 && (
                        <BudgetStep
                            {...nav}
                            draft={values.budget}
                            onChange={(budget) => update("budget", budget)}
                        />
                    )}
                    {step === 6 && (
                        <CardsStep
                            {...nav}
                            cards={values.cards}
                            onAdded={(card) =>
                                update("cards", [...values.cards, card])
                            }
                        />
                    )}
                    {step === 7 && (
                        <CategoriesStep {...nav} categories={data.categories} />
                    )}
                    {step === 8 && (
                        <DoneStep
                            headingRef={headingRef}
                            name={savedName}
                            onFinished={() => setOpen(false)}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
