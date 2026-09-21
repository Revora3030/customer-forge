import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Messages share the overlay vocabulary: same surface, same border, same
 * motion as dialogs and drawers. Status is carried by an icon plus a coloured
 * hairline, never by colour alone.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      gap={10}
      offset={16}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast overlay-surface overlay-motion group-[.toaster]:rounded-lg group-[.toaster]:gap-2.5 group-[.toaster]:p-3.5 group-[.toaster]:text-[13px]",
          title: "group-[.toast]:font-semibold group-[.toast]:leading-snug",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-[12px]",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md group-[.toast]:font-semibold",
          cancelButton:
            "group-[.toast]:bg-elevated group-[.toast]:text-muted-foreground group-[.toast]:rounded-md",
          closeButton:
            "group-[.toast]:border-border group-[.toast]:bg-card group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:border-l-2 group-[.toaster]:border-l-primary",
          error: "group-[.toaster]:border-l-2 group-[.toaster]:border-l-destructive",
          warning: "group-[.toaster]:border-l-2 group-[.toaster]:border-l-accent",
          info: "group-[.toaster]:border-l-2 group-[.toaster]:border-l-info",
          loading: "group-[.toaster]:border-l-2 group-[.toaster]:border-l-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
