import type { ReactNode } from "react";
import "../src/styles.css";

/** Wraps every story so Tailwind tokens and platform fonts load. */
export const Provider = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-background p-6 text-foreground antialiased">{children}</div>
);
