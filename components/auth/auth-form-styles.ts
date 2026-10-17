// Auth forms sit on the dark column on mobile and the white panel on desktop.
export const AUTH_LABEL_CLASS = "text-white/70 md:text-foreground";

export const AUTH_INPUT_CLASS =
    "mt-2 border-white/10 bg-white/5 text-white placeholder:text-white/30 " +
    "md:border-input md:bg-background md:text-foreground md:placeholder:text-muted-foreground";

export const AUTH_ERROR_CLASS = "text-sm text-red-400 md:text-destructive";

export const AUTH_SUBMIT_CLASS =
    "mt-1 h-11 w-full bg-white text-foreground hover:bg-white/90 " +
    "md:bg-primary md:text-primary-foreground md:hover:bg-primary/90";

export const AUTH_MUTED_CLASS = "text-white/50 md:text-muted-foreground";

// --positive passes 3:1 for an icon on the white panel but not 4.5:1 for text,
// so met text turns green only on the dark column.
export const AUTH_POSITIVE_ICON_CLASS = "text-green-400 md:text-positive";

export const AUTH_POSITIVE_TEXT_CLASS = "text-green-400 md:text-foreground";
