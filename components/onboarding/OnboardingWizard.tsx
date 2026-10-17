"use client";

import { useEffect, useRef, useState } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { OnboardingData } from "@/lib/onboarding/load-onboarding";

import { BudgetStep } from "./BudgetStep";
import { CardsStep } from "./CardsStep";
import { CategoriesStep } from "./CategoriesStep";
import { DoneStep } from "./DoneStep";
import { IncomeStep } from "./IncomeStep";
import { NameStep } from "./NameStep";
import {
    STEP_COUNT,
    initialValues,
    type WizardValues,
} from "./onboarding-model";
import { SharingStep } from "./SharingStep";
import { WelcomeStep } from "./WelcomeStep";
import { WizardProgress } from "./WizardProgress";

/**
 * The first-run setup. It cannot be dismissed: only "Open the app" on the last
 * step finishes it, and until then it shows on every visit, prefilled with
 * whatever was already saved.
 */
export function OnboardingWizard({ data }: { data: OnboardingData }) {
    const [open, setOpen] = useState(true);
    // `data` only seeds this state, so the refresh after each save keeps the step and values.
    const [step, setStep] = useState(1);
    const [values, setValues] = useState<WizardValues>(() =>
        initialValues(data),
    );
    const [savedName, setSavedName] = useState(data.name);
    const [savedIncome, setSavedIncome] = useState(data.fixedIncome);
    const headingRef = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        headingRef.current?.focus();
    }, [step]);

    const update = <K extends keyof WizardValues>(
        key: K,
        value: WizardValues[K],
    ) => setValues((current) => ({ ...current, [key]: value }));

    const nav = {
        headingRef,
        onBack: () => setStep((s) => Math.max(1, s - 1)),
        onNext: () => setStep((s) => Math.min(STEP_COUNT, s + 1)),
    };

    return (
        <Dialog open={open} disablePointerDismissal>
            <DialogContent
                showCloseButton={false}
                initialFocus={headingRef}
                // The overlay portals to <body>, outside any .sidebar-theme, so it brings its own.
                overlayClassName="sidebar-theme bg-sidebar"
                className="flex flex-col gap-0 p-0 sm:min-h-[520px] sm:max-w-[420px] sm:rounded-[18px] sm:shadow-[0_20px_50px_rgba(0,0,0,.4)] sm:ring-0"
            >
                <WizardProgress step={step} />
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
            </DialogContent>
        </Dialog>
    );
}
