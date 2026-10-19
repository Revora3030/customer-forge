import { useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type RefObject } from "react";
import { ArrowUp, ChevronDown, BadgeCheck, ImagePlus, Loader2, Mic, MicOff, Slash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type JarvisMode = "brief" | "balanced" | "deep";
export const JARVIS_MODES = [["brief", "Brief"], ["balanced", "Balanced"], ["deep", "Deep"]] as const;

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  maxLength: number;
  busy: boolean;
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

/** The first picture in a paste or drop, if any. */
const firstImage = (files: FileList | null | undefined) => [...(files ?? [])].find((file) => file.type.startsWith("image/")) ?? null;

/** The Jarvis message box: text, picture to demo (button, paste or drop), commands, response style, dictation and send. */
export function JarvisComposer({ value, onChange, onSubmit, maxLength, busy, coarse, listening, interim, onToggleMic, readingPicture, picturePreview, onPicture, mode, onModeChange, onOpenCommands, inputRef }: Props) {
  const pictureInput = useRef<HTMLInputElement>(null);
  const modeLabel = JARVIS_MODES.find(([id]) => id === mode)?.[1] ?? "Balanced";
  const canSend = Boolean(value.trim()) && !busy;
  const [dropping, setDropping] = useState(false);
  const canTakePicture = !busy && !readingPicture;

  // A pasted or dropped picture (Maps screenshot, card, flyer) goes the same way as the Picture button.
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = firstImage(event.clipboardData?.files);
    if (!file || !canTakePicture) return;
    event.preventDefault();
    onPicture(file);
  };
  const onDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (!canTakePicture || ![...(event.dataTransfer?.types ?? [])].includes("Files")) return;
    event.preventDefault();
    setDropping(true);
  };
  const onDrop = (event: DragEvent<HTMLFormElement>) => {
    setDropping(false);
    const file = firstImage(event.dataTransfer?.files);
    if (!file) return;
    event.preventDefault();
    if (canTakePicture) onPicture(file);
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
    onSubmit();
  };

  return (
    <form
      onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
      className={`rounded-2xl border bg-card/80 transition-colors focus-within:border-primary/60 ${dropping ? "border-primary ring-2 ring-primary/40" : "border-border"}`}
    >
      {dropping ? <p className="px-3.5 pt-2.5 text-sm text-primary" aria-live="polite">Drop the picture to build a demo from it</p> : null}
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
          <DropdownMenuContent align="start" side="top" className="w-48">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Response style</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={mode} onValueChange={(next) => { if (next === "brief" || next === "balanced" || next === "deep") onModeChange(next); }}>
              {JARVIS_MODES.map(([id, label]) => <DropdownMenuRadioItem key={id} value={id} className="min-h-11">{label}</DropdownMenuRadioItem>)}
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
          className={`${iconButton} ${listening ? "bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive" : ""}`}
        >
          {listening ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
        </Button>
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
      </div>
    </form>
  );
}
