import { useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type RefObject } from "react";
import { ArrowUp, ChevronDown, BadgeCheck, FileText, ImagePlus, Loader2, Mic, MicOff, Paperclip, Slash, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { firstImage, pastedPicture } from "./composer-input";
import { composeWithDocuments, readDocumentText, sortComposerFiles, type ComposerDoc } from "@/lib/jarvis/composer-attachments";
import { expandCityCommand } from "@/lib/jarvis/city-commands";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "@/lib/jarvis-attachments-policy.mjs";
import { modeExplainerLine } from "@/lib/jarvis-mode-explainers";

export type JarvisMode = "brief" | "balanced" | "deep";
export const JARVIS_MODES = [["brief", "Brief"], ["balanced", "Balanced"], ["deep", "Deep"]] as const;

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Called with the final text when the composer changed it (City command, attached files); otherwise with nothing. */
  onSubmit: (message?: string) => void;
  maxLength: number;
  busy: boolean;
  /** While busy, Send becomes Stop: aborts the turn in flight. */
  onStop?: () => void;
  /** Touch devices: return inserts a newline; Send is the button. */
  coarse: boolean;
  listening: boolean;
  /** Words the microphone is still hearing, before they are final. */
  interim: string;
  onToggleMic: () => void;
  readingPicture: boolean;
  picturePreview: string | null;
  onPicture: (file: File) => void;
  mode: JarvisMode;
  onModeChange: (mode: JarvisMode) => void;
  onOpenCommands: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
};

const iconButton = "size-9 shrink-0 rounded-full sm:size-9";

/** The Jarvis message box: text, picture to demo (button, paste or drop), commands, response style, dictation and send. */
export function JarvisComposer({ value, onChange, onSubmit, maxLength, busy, onStop, coarse, listening, interim, onToggleMic, readingPicture, picturePreview, onPicture, mode, onModeChange, onOpenCommands, inputRef }: Props) {
  const pictureInput = useRef<HTMLInputElement>(null);
  const modeLabel = JARVIS_MODES.find(([id]) => id === mode)?.[1] ?? "Balanced";
  const docInput = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<ComposerDoc[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const canSend = (Boolean(value.trim()) || docs.length > 0) && !busy;
  const [dropping, setDropping] = useState(false);
  const canTakePicture = !busy && !readingPicture;

  // JC-45: pictures keep the demo flow; TXT/CSV/JSON files are attached within the attachment policy.
  const addFiles = async (files: File[]) => {
    const sorted = sortComposerFiles(files, docs.length);
    const problems = sorted.rejected.map((r) => `${r.name}: ${r.reason}`);
    if (sorted.picture) {
      if (canTakePicture) onPicture(sorted.picture);
      else problems.push(`${sorted.picture.name}: wait for the current picture or answer first.`);
    }
    const read: ComposerDoc[] = [];
    for (const file of sorted.documents) {
      const result = readDocumentText(new Uint8Array(await file.arrayBuffer()));
      if (!result.ok) { problems.push(`${file.name}: ${result.reason}`); continue; }
      read.push({ id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, mime: file.type || "text/plain", size: file.size, text: result.text });
    }
    if (read.length) setDocs((prev) => [...prev, ...read.filter((d) => !prev.some((p) => p.id === d.id))]);
    setNotice(problems.length ? problems.join(" ") : null);
  };

  const send = () => {
    if (!canSend) return;
    const expanded = expandCityCommand(value);
    if (expanded === value && !docs.length) { onSubmit(); return; }
    const composed = composeWithDocuments(expanded, docs);
    if (!composed.ok) { setNotice(composed.reason); return; }
    setDocs([]);
    setNotice(null);
    onSubmit(composed.text);
  };

  // A pasted or dropped picture (Maps screenshot, card, flyer) goes the same way as the Picture button;
  // a paste that also carries text (a spreadsheet row) stays a text paste.
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = pastedPicture(event.clipboardData);
    if (file) {
      if (!canTakePicture) return;
      event.preventDefault();
      onPicture(file);
      return;
    }
    // A copied file (not text) from Finder/Explorer: attach it if the policy allows.
    const files = [...(event.clipboardData?.files ?? [])];
    if (!files.length || event.clipboardData?.getData("text/plain").trim()) return;
    event.preventDefault();
    void addFiles(files);
  };
  const onDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (!canTakePicture || ![...(event.dataTransfer?.types ?? [])].includes("Files")) return;
    event.preventDefault();
    setDropping(true);
  };
  const onDrop = (event: DragEvent<HTMLFormElement>) => {
    setDropping(false);
    const files = [...(event.dataTransfer?.files ?? [])];
    if (!files.length) return;
    event.preventDefault();
    if (files.length === 1 && firstImage(files)) {
      if (canTakePicture) onPicture(files[0]!);
      return;
    }
    void addFiles(files);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const composing = event.nativeEvent.isComposing || event.keyCode === 229;
    if (event.key === "/" && !value && !composing) {
      event.preventDefault();
      onOpenCommands();
      return;
    }
    if (event.key !== "Enter" || composing) return;
    // On phones and tablets return is a newline, as in Messages; on desktop Enter sends.
    if (coarse || event.shiftKey) return;
    event.preventDefault();
    send();
  };

  return (
    <form
      onSubmit={(event) => { event.preventDefault(); send(); }}
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
      className={`rounded-2xl border bg-white/[0.03] shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-colors focus-within:border-primary/60 ${dropping ? "border-primary ring-2 ring-primary/40" : "border-white/10"}`}
    >
      {dropping ? <p className="px-3.5 pt-2.5 text-sm text-primary" aria-live="polite">Drop a picture to build a demo, or a TXT, CSV or JSON file to attach</p> : null}
      {docs.length ? (
        <ul className="flex flex-wrap gap-1.5 px-2.5 pt-2.5" aria-label="Attached files">
          {docs.map((doc) => (
            <li key={doc.id} className="flex max-w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] pl-2.5 text-xs">
              <FileText className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{doc.name}</span>
              <Button type="button" variant="ghost" size="icon-sm" className="size-11 shrink-0 rounded-full sm:size-9" aria-label={`Remove ${doc.name}`} onClick={() => setDocs((prev) => prev.filter((d) => d.id !== doc.id))}>
                <X className="size-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {notice ? <p role="status" className="px-3.5 pt-2.5 text-xs text-destructive">{notice}</p> : null}
      <label htmlFor="jarvis-message" className="sr-only">Message Jarvis</label>
      {listening || interim ? (
        <p className="truncate px-3.5 pt-2.5 text-sm italic text-muted-foreground" aria-live="polite">{interim || "Listening…"}</p>
      ) : null}
      <textarea
        id="jarvis-message"
        ref={inputRef}
        value={value}
        maxLength={maxLength}
        rows={1}
        enterKeyHint={coarse ? "enter" : "send"}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder="Message Jarvis"
        className="block max-h-40 min-h-11 w-full resize-none bg-transparent px-3.5 pt-3 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground"
      />
      <div className="flex h-11 items-center gap-1 px-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-jarvis-tap=""
          aria-label="Build a demo from a picture"
          title="Build a demo from a picture (Maps screenshot, card, flyer, sign)"
          disabled={busy || readingPicture}
          onClick={() => pictureInput.current?.click()}
          className="h-9 min-h-9 shrink-0 gap-1.5 rounded-full px-2 text-sm sm:h-9 sm:min-h-9 sm:px-2.5"
        >
          {readingPicture ? <Loader2 className="size-4 animate-spin" aria-hidden /> : picturePreview ? <BadgeCheck className="size-4 text-primary" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
          <span className="hidden sm:inline">{readingPicture ? "Reading…" : "Picture"}</span>
        </Button>
        <input
          ref={pictureInput}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onPicture(file); }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-jarvis-tap=""
          aria-label="Attach a TXT, CSV or JSON file"
          title="Attach a TXT, CSV or JSON file (up to 3, 1 MB each). Secrets and emails are redacted."
          disabled={busy || docs.length >= MAX_ATTACHMENTS_PER_MESSAGE}
          onClick={() => docInput.current?.click()}
          className={iconButton}
        >
          <Paperclip className="size-4" aria-hidden />
        </Button>
        <input
          ref={docInput}
          type="file"
          accept=".txt,.csv,.json,text/plain,text/csv,application/json"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) void addFiles(files); }}
        />
        <Button type="button" variant="ghost" size="icon-sm" data-jarvis-tap="" aria-label="Quick commands" className={iconButton} onClick={onOpenCommands}>
          <Slash className="size-4" aria-hidden />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" data-jarvis-tap="" aria-label="Response style" className="h-9 shrink-0 gap-1 rounded-full px-2.5 text-xs sm:h-9">
              <span aria-hidden>{modeLabel}</span>
              <ChevronDown className="size-3.5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-72">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Response style</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={mode} onValueChange={(next) => { if (next === "brief" || next === "balanced" || next === "deep") onModeChange(next); }}>
              {JARVIS_MODES.map(([id, label]) => (
                <DropdownMenuRadioItem key={id} value={id} className="min-h-11 items-start py-2">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span>{label}</span>
                    <span className="whitespace-normal text-[11px] font-normal leading-snug text-muted-foreground">
                      {modeExplainerLine(id)}
                    </span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="min-w-0 flex-1" />
        {value.length > 3000 ? <span className="shrink-0 px-1 text-xs tabular-nums text-muted-foreground">{value.length}/{maxLength}</span> : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-jarvis-tap=""
          aria-label={listening ? "Stop microphone" : "Dictate"}
          aria-pressed={listening}
          disabled={busy && !listening}
          onClick={onToggleMic}
          className={`size-11 shrink-0 rounded-full ${listening ? "bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive" : ""}`}
        >
          {listening ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
        </Button>
        {busy && onStop ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            data-jarvis-tap=""
            aria-label="Stop"
            title="Stop this answer"
            onClick={onStop}
            className="size-9 shrink-0 rounded-full border border-white/15 bg-white/[0.06] text-foreground backdrop-blur-xl hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:size-9"
          >
            <Square className="size-3.5 fill-current" aria-hidden />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon-sm"
            data-jarvis-tap=""
            aria-label="Send"
            disabled={!canSend}
            className="size-9 shrink-0 rounded-full sm:size-9 [&_svg]:size-[18px] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          >
            <ArrowUp className="size-[18px]" aria-hidden />
          </Button>
        )}
      </div>
    </form>
  );
}
