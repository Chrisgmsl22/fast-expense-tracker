type Props = {
    /** Set for a field's message, so its input can point at it. */
    id?: string;
    message?: string | null;
    /** Only one message per failed submit is announced; the rest are read through the field. */
    announce?: boolean;
};

export function FieldMessage({ id, message, announce = false }: Props) {
    if (!message) return null;
    return (
        <p
            id={id}
            role={announce ? "alert" : undefined}
            className="mt-1.5 text-sm text-destructive"
        >
            {message}
        </p>
    );
}
