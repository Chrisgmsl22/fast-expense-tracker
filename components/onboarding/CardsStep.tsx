"use client";

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import { addCard } from "@/app/_actions/card/add";
import {
    DEFAULT_CARD_COLOR,
    type AddCardType,
} from "@/components/cards/card-type-options";
import { CardSwatchGrid } from "@/components/cards/CardSwatchGrid";
import { CardTypeField } from "@/components/cards/CardTypeField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OnboardingCard } from "@/lib/onboarding/load-onboarding";
import { normalizeHex } from "@/lib/palette";
import type { AddCardInput } from "@/lib/schemas/card";
import { cn } from "@/lib/utils";

import { AddedCardList } from "./AddedCardList";
import { FieldMessage } from "./FieldMessage";
import type { StepNav } from "./onboarding-model";
import {
    WIZARD_BUSY_OUTLINE_BUTTON_CLASS,
    WIZARD_FAINT_TEXT_CLASS,
    WIZARD_FIELD_CLASS,
    WIZARD_LABEL_CLASS,
    WIZARD_SELECT_CLASS,
} from "./onboarding-styles";
import { ResponsiveText } from "./ResponsiveText";
import { StepFooter } from "./StepFooter";
import { StepFrame } from "./StepFrame";
import { useStepSubmit } from "./use-step-submit";

const FIELDS = ["name"] as const;
const DEFAULT_CARD_TYPE: AddCardType = "credit";

type Props = StepNav & {
    cards: readonly OnboardingCard[];
    onAdded: (card: OnboardingCard) => void;
};

export function CardsStep({
    headingRef,
    onBack,
    onNext,
    onNextAfterSave,
    leavingAfterSave,
    cards,
    onAdded,
}: Props) {
    const [name, setName] = useState("");
    const [type, setType] = useState<AddCardType>(DEFAULT_CARD_TYPE);
    const [color, setColor] = useState(DEFAULT_CARD_COLOR);
    const {
        pending,
        formError,
        formRef,
        announcedField,
        fieldError,
        edited,
        submit,
    } = useStepSubmit<AddCardInput>(FIELDS, {
        fieldOnlyCodes: ["duplicate_name"],
    });
    const error = fieldError("name");
    // A save on Continue keeps both buttons busy until the step has faded out.
    const busy = pending || leavingAfterSave;

    function saveCard(then?: () => void) {
        submit(
            () => addCard({ name, type, color }),
            (data) => {
                onAdded({ name: data.name, color: normalizeHex(color) });
                setName("");
                setType(DEFAULT_CARD_TYPE);
                setColor(DEFAULT_CARD_COLOR);
                then?.();
            },
        );
    }

    function handleAdd(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        saveCard();
    }

    // A typed but unadded card is saved on the way out, never dropped.
    function handleContinue() {
        if (name.trim() === "") onNext();
        else saveCard(onNextAfterSave);
    }

    return (
        <StepFrame
            headingRef={headingRef}
            title="Add a payment method?"
            description={
                <ResponsiveText
                    desktop="Tag each expense by card so you see where spend lands. Optional — add or edit in Settings anytime."
                    phone="Tag expenses by card. Optional."
                />
            }
            footer={
                <StepFooter
                    onBack={onBack}
                    onSkip={onNext}
                    primaryLabel="Continue"
                    pending={busy}
                    onPrimary={handleContinue}
                />
            }
        >
            <AddedCardList cards={cards} />
            <form
                ref={formRef}
                onSubmit={handleAdd}
                aria-label="Add a card"
                noValidate
                className="space-y-3 rounded-xl border p-3.5"
            >
                <div>
                    <Label
                        htmlFor="onboarding-card-name"
                        className={WIZARD_LABEL_CLASS}
                    >
                        Card name
                    </Label>
                    <Input
                        id="onboarding-card-name"
                        name="name"
                        value={name}
                        onChange={(e) => {
                            edited("name");
                            setName(e.target.value);
                        }}
                        placeholder="e.g. Amex Gold"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={
                            error ? "onboarding-card-name-error" : undefined
                        }
                        className={WIZARD_FIELD_CLASS}
                    />
                    <FieldMessage
                        id="onboarding-card-name-error"
                        message={error}
                        announce={announcedField === "name"}
                    />
                </div>
                <CardTypeField
                    id="onboarding-card-type"
                    value={type}
                    onType={(next) => {
                        edited("type");
                        setType(next);
                    }}
                    labelClassName={WIZARD_LABEL_CLASS}
                    triggerClassName={WIZARD_SELECT_CLASS}
                />
                <div>
                    <span className={WIZARD_LABEL_CLASS}>Colour</span>
                    <CardSwatchGrid
                        selected={color}
                        onColor={(next) => {
                            edited("color");
                            setColor(next);
                        }}
                        layout="grid"
                        className="mt-1.5"
                    />
                </div>
                <FieldMessage message={formError} announce />
                <Button
                    type="submit"
                    variant="outline"
                    disabled={busy}
                    focusableWhenDisabled
                    className={cn(
                        "h-10 w-full rounded-xl",
                        WIZARD_BUSY_OUTLINE_BUTTON_CLASS,
                    )}
                >
                    <Plus aria-hidden="true" />
                    {busy ? "Adding…" : "Add card"}
                </Button>
            </form>
            <p
                className={cn(
                    "mt-3.5 text-center text-xs",
                    WIZARD_FAINT_TEXT_CLASS,
                )}
            >
                Cash is always included.
            </p>
        </StepFrame>
    );
}
