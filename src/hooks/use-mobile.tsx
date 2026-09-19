import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;
    const mql =
      typeof window.matchMedia === "function"
        ? window.matchMedia(query)
        : null;
    const read = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    const onChange = () => read();

    if (mql) {
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", onChange);
      } else {
        mql.addListener(onChange);
      }
    }
    read();

    return () => {
      if (!mql) return;
      if (typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", onChange);
      } else {
        mql.removeListener(onChange);
      }
    };
  }, []);

  return !!isMobile;
}
