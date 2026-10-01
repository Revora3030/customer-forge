import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex max-w-full items-center justify-center gap-2 text-center wrap-anywhere rounded-md text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        signal:
          "bg-primary text-primary-foreground font-semibold shadow-[var(--shadow-signal)] hover:bg-primary/90",
        attention: "bg-accent text-accent-foreground font-semibold hover:bg-accent/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-border bg-card text-foreground hover:bg-elevated hover:border-muted-foreground/40",
        secondary: "bg-elevated text-secondary-foreground hover:bg-elevated/70",
        ghost: "text-muted-foreground hover:bg-elevated hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-11 px-4 py-2 sm:min-h-10",
        sm: "min-h-10 rounded-md px-3 py-1.5 text-xs sm:min-h-8",
        lg: "min-h-12 rounded-md px-5 py-2.5 text-[15px]",
        icon: "size-11 shrink-0 sm:size-10",
        "icon-sm": "size-9 shrink-0 p-0 sm:size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
