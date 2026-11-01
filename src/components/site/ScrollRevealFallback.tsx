import { useEffect } from "react";
import { browserRevealEnv, startScrollReveal } from "@/lib/scroll-reveal";

/**
 * Renders nothing. After hydration, gives browsers without CSS scroll-driven
 * animations the same small, transform-only rise the CSS gives the others.
 * No-op without JS, with reduced motion, or when the browser animates in CSS.
 */
export function ScrollRevealFallback() {
  useEffect(() => {
    const env = browserRevealEnv();
    if (env) startScrollReveal(env);
  }, []);
  return null;
}
