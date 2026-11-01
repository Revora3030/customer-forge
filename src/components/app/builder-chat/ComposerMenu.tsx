import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type RefObject } from "react";
import { toast } from "@/lib/ui/notify";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import {
  applyItem,
  findTrigger,
  isLayoutImage,
  itemsFor,
  withLayoutInstruction,
  type ComposerCommandId,
  type ComposerItem,
  type Trigger,
} from "@/lib/builder/composer-commands";
import { ATTACHMENT_LIMITS, MAX_ATTACHMENTS, base64Bytes, type AgentAttachment } from "@/lib/site-agent";

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

type Options = {
  value: string;
  setValue: (next: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  attachments: AgentAttachment[];
  setAttachments: (update: (prior: AgentAttachment[]) => AgentAttachment[]) => void;
  disabled: boolean;
  /** Runs the commands that are actions, not text: /revert and /lead-test. */
  onAction: (id: ComposerCommandId) => void;
};

/**
 * State and handlers for the composer's "/" menu, "@" chips and picture drop.
 * Everything that decides what happens is in lib/builder/composer-commands.ts.
 */
export function useComposerMenu({ value, setValue, inputRef, attachments, setAttachments, disabled, onAction }: Options) {
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  const items = useMemo(() => (trigger ? itemsFor(trigger) : []), [trigger]);
  const open = !disabled && trigger !== null && items.length > 0;

  useEffect(() => setActive(0), [trigger?.kind, trigger?.query]);
  // The box was cleared or sent: nothing to complete any more.
  useEffect(() => {
    if (!value) setTrigger(null);
  }, [value]);

  const pick = (item: ComposerItem) => {
    if (!trigger) return;
    if (item.kind === "command" && item.template === undefined) {
      // An action: clear the typed "/word" and run it.
      setValue(value.slice(0, trigger.start) + value.slice(trigger.end));
      setTrigger(null);
      onAction(item.id as ComposerCommandId);
      return;
    }
    const next = applyItem(value, trigger, item);
    setValue(next.value);
    setTrigger(null);
    window.requestAnimationFrame(() => {
      const box = inputRef.current;
      if (box) {
        box.focus();
        box.setSelectionRange(next.caret, next.caret);
      }
    });
  };

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
    setTrigger(findTrigger(event.target.value, event.target.selectionStart ?? event.target.value.length));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + items.length) % items.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const item = items[active];
      if (item) pick(item);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setTrigger(null);
    }
  };

  const addPictures = async (files: File[]) => {
    const pictures = files.filter(isLayoutImage);
    if (!pictures.length) return false;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
      return true;
    }
    const next: AgentAttachment[] = [];
    for (const file of pictures.slice(0, room)) {
      if (file.size > ATTACHMENT_LIMITS.image) {
        toast.error(`${file.name} is too large. Keep photos under ${Math.round(ATTACHMENT_LIMITS.image / (1024 * 1024))} MB.`);
        continue;
      }
      try {
        const dataUrl = await readAsDataUrl(file);
        if (base64Bytes(dataUrl) > ATTACHMENT_LIMITS.image) continue;
        next.push({ kind: "image", mimeType: file.type, name: file.name, dataUrl });
      } catch {
        toast.error(`Couldn't read ${file.name}.`);
      }
    }
    if (next.length) {
      setAttachments((prior) => [...prior, ...next]);
      // Visible and editable: the owner sees exactly what the picture is for.
      setValue(withLayoutInstruction(value));
    }
    return true;
  };

  /** Capture phase, so the form's own drop handler never swallows the picture. */
  const onDropCapture = (event: DragEvent<HTMLElement>) => {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (disabled || !files.some(isLayoutImage)) return;
    event.preventDefault();
    event.stopPropagation();
    void addPictures(files);
  };
  const onDragOverCapture = (event: DragEvent<HTMLElement>) => {
    if (!disabled && Array.from(event.dataTransfer?.items ?? []).some((item) => item.kind === "file")) event.preventDefault();
  };

  const menu = open ? (
    <div className="mb-2 overflow-hidden rounded-2xl border border-border bg-popover shadow-lift" data-composer-menu="">
      <Command shouldFilter={false} value={items[active] ? `${items[active].kind}-${items[active].id}` : ""} aria-label={trigger?.kind === "command" ? "Commands" : "Mention a part of your site"}>
        <CommandList className="max-h-56">
          {items.map((item) => (
            <CommandItem
              key={`${item.kind}-${item.id}`}
              value={`${item.kind}-${item.id}`}
              onSelect={() => pick(item)}
              // Keep focus in the box so the caret never jumps.
              onMouseDown={(event) => event.preventDefault()}
              className="min-h-11 cursor-pointer gap-3 px-3"
            >
              <span className="font-medium">{item.label}</span>
              <span className="truncate text-xs text-muted-foreground">{item.hint}</span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </div>
  ) : null;

  return { menu, onChange, onKeyDown, onDropCapture, onDragOverCapture };
}
