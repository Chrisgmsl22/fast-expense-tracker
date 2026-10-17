import { CARD_PALETTE } from "@/lib/palette";
import { cn } from "@/lib/utils";

// The first five palette swatches are the seeded card colours (spec 0006 §6),
// so reading them from the palette keeps these dots in step with the seed.
const CARD_DOT_COLORS = CARD_PALETTE.slice(0, 5).map((swatch) => swatch.hex);

type Props = { className?: string; dotClassName?: string };

/** The brand row of card-colour dots on the auth screens and the onboarding welcome. */
export function CardDots({ className, dotClassName }: Props) {
    return (
        <div
            className={cn("flex items-center gap-2", className)}
            aria-hidden="true"
        >
            {CARD_DOT_COLORS.map((color) => (
                <span
                    key={color}
                    className={cn("size-2.5 rounded-full", dotClassName)}
                    style={{ backgroundColor: color }}
                />
            ))}
        </div>
    );
}
