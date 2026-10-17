import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importExistingWebsite } from "@/lib/site-import.functions";
import { foundLabels, type ImportedFacts } from "@/lib/site-import";

/**
 * "Already have a website?" Reads the facts the business publishes on its
 * current site and hands them to the form. Only empty fields are filled, the
 * owner sees what was found, and everything stays editable before the build.
 */
export function ExistingSiteImport(props: {
  initialUrl: string;
  /** Imports automatically once, e.g. when the owner arrived from "upgrade my website". */
  autoStart?: boolean;
  onImported: (facts: ImportedFacts, url: string) => void;
}) {
  const read = useServerFn(importExistingWebsite);
  const [url, setUrl] = useState(props.initialUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [found, setFound] = useState<string[] | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!url && props.initialUrl) setUrl(props.initialUrl);
  }, [props.initialUrl, url]);

  async function run(address = url) {
    if (address.trim().length < 4 || busy) return;
    setBusy(true);
    setMessage(null);
    setFound(null);
    try {
      const result = await read({ data: { url: address } });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      const labels = foundLabels(result.facts);
      if (!labels.length) {
        setMessage("Revora read your site but couldn't find details it could use. Type them below.");
        return;
      }
      props.onImported(result.facts, result.url);
      setFound(labels);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Revora couldn't read that website.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (props.autoStart && props.initialUrl && !started.current) {
      started.current = true;
      void run(props.initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.autoStart, props.initialUrl]);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-[13px]">
      <p className="flex items-center gap-1.5 font-medium">
        <Globe2 className="size-4 text-primary" aria-hidden /> Already have a website? Start from it.
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Revora reads your current site for your name, contact details, hours, services, logo and photo, then the AI
        team builds you a faster, lead-winning version you can keep editing.
      </p>
      <form
        className="mt-2 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <Input
          aria-label="Your current website"
          inputMode="url"
          autoComplete="url"
          placeholder="yourbusiness.com"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy || url.trim().length < 4} className="shrink-0">
          {busy ? "Reading your site…" : "Import my website"}
        </Button>
      </form>
      {found ? (
        <p className="mt-2 text-[12px]" role="status">
          Filled in from your site: {found.join(", ")}. Check each step — anything you already typed was kept.
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 text-[12px] text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
