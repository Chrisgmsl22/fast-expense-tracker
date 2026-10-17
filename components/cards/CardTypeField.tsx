"use client";

import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from "@/components/ui/select";

import {
    ADD_TYPE_OPTIONS,
    typeLabel,
    type AddCardType,
} from "./card-type-options";

type Props = {
    id: string;
    value: AddCardType;
    onType: (value: AddCardType) => void;
    labelClassName?: string;
};

/** Credit/Debit picker shared by the card add and edit forms (Cash is never offered). */
export function CardTypeField({ id, value, onType, labelClassName }: Props) {
    return (
        <div>
            <Label htmlFor={id} className={labelClassName}>
                Type
            </Label>
            <Select
                value={value}
                onValueChange={(v) =>
                    onType(
                        ADD_TYPE_OPTIONS.find((o) => o.value === v)?.value ??
                            "credit",
                    )
                }
            >
                <SelectTrigger
                    id={id}
                    aria-label="Card type"
                    className="mt-1.5 w-full"
                >
                    {typeLabel(value)}
                </SelectTrigger>
                <SelectContent>
                    {ADD_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                            {o.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
