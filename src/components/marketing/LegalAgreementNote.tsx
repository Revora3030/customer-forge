/**
 * "By continuing you agree to the Terms and Privacy Policy" line, shown next
 * to the sign-up and payment buttons so the agreement is visible where it is
 * made (the footer links alone are easy to miss).
 */
export function LegalAgreementNote({ action, className }: { action: string; className?: string }) {
  return (
    <p className={className ?? "text-center text-[11.5px] leading-relaxed text-muted-foreground"}>
      By {action}, you agree to our{" "}
      <a
        href="/terms"
        target="_blank"
        rel="noopener"
        className="underline underline-offset-2 hover:text-primary"
      >
        Terms of Service
      </a>{" "}
      and{" "}
      <a
        href="/privacy"
        target="_blank"
        rel="noopener"
        className="underline underline-offset-2 hover:text-primary"
      >
        Privacy Policy
      </a>
      .
    </p>
  );
}
