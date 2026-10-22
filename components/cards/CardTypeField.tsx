"use client";

import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
    ADD_TYPES,
    useCardTypeLabel,
    type AddCardType,
} from "./card-type-options";

type Props = {
    id: string;
    value: AddCardType;
    onType: (value: AddCardType) => void;
    labelClassName?: string;
    triggerClassName?: string;
};

/** Credit/Debit picker shared by the card add and edit forms (Cash is never offered). */
export function CardTypeField({
    id,
    value,
    onType,
    labelClassName,
    triggerClassName,
}: Props) {
    const t = useTranslations("settings.cards");
    const typeLabel = useCardTypeLabel();
    return (
        <div>
            <Label htmlFor={id} className={labelClassName}>
                {t("type")}
            </Label>
            <Select
                value={value}
                onValueChange={(v) =>
                    onType(ADD_TYPES.find((type) => type === v) ?? "credit")
                }
            >
                <SelectTrigger
                    id={id}
                    aria-label={t("typeAria")}
                    className={cn("mt-1.5 w-full", triggerClassName)}
                >
                    {typeLabel(value)}
                </SelectTrigger>
                <SelectContent>
                    {ADD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                            {typeLabel(type)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
