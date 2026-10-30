import { siteFontsHref } from "@/lib/site-theme";

/**
 * The site's type pairing, requested from wherever the site renders.
 *
 * React 19 hoists a `<link rel="stylesheet" precedence>` into <head> (during
 * SSR and on the client) and de-duplicates it by href, so the owner preview
 * (/draft), share links (/p) and the live site (/s and custom domains) all load
 * the same faces, even on routes whose head() never lists them.
 */
export function SiteFontLinks({ font }: { font: string | null | undefined }) {
  const href = siteFontsHref(font, []);
  if (!href) return null;
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={href} precedence="default" data-rv-site-fonts="" />
    </>
  );
}
