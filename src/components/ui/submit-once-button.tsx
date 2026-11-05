import * as React from "react";

type SubmitOnceButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  /** Text shown while the form is on its way, e.g. "Sending…". */
  pendingLabel?: React.ReactNode;
};

/** If the page is still here this long after a submit, let the person try again. */
export const SUBMIT_ONCE_RESET_MS = 10_000;

/**
 * Submit button for plain `<form method="post">` pages (no JavaScript handler).
 * After the first valid submit it disables itself and ignores further taps, so a
 * double tap on a slow phone connection can never post the form twice. It only
 * reacts to a submit the browser actually accepted (required fields satisfied),
 * and unlocks after a while in case the page is restored from the back button.
 */
export function SubmitOnceButton({ children, pendingLabel, onClick, ...props }: SubmitOnceButtonProps) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const [sent, setSent] = React.useState(false);
  const sentRef = React.useRef(false);

  React.useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    let timer: number | undefined;
    const onSubmit = (event: Event) => {
      if (sentRef.current) {
        event.preventDefault();
        return;
      }
      sentRef.current = true;
      setSent(true);
      timer = window.setTimeout(() => {
        sentRef.current = false;
        setSent(false);
      }, SUBMIT_ONCE_RESET_MS);
    };
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        sentRef.current = false;
        setSent(false);
      }
    };
    form.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", onShow);
    return () => {
      form.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", onShow);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <button
      ref={ref}
      type="submit"
      aria-disabled={sent || undefined}
      data-submitted={sent || undefined}
      onClick={(event) => {
        if (sentRef.current) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...props}
      className={`${props.className ?? ""} aria-disabled:opacity-70`.trim()}
    >
      {sent && pendingLabel ? pendingLabel : children}
    </button>
  );
}
