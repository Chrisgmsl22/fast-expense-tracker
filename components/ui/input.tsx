import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
    return (
        <input
            type={type}
            data-slot="input"
            className={cn(
                // 16px on mobile (text-base) so iOS Safari doesn't auto-zoom on
                // focus (it zooms any focused field with font-size < 16px);
                // text-sm from the sm breakpoint up. See ADR-0017.
                "flex h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none sm:text-sm",
                "placeholder:text-muted-foreground",
                "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
                className,
            )}
            {...props}
        />
    );
}

export { Input };
