/**
 * Actions on one of Revora's replies.
 *
 * Touch screens get a single "…" menu (five spread-out 44px icons under every
 * reply was most of a phone screen); pointer screens get small inline icon
 * buttons with tooltips that appear on hover, like Claude.ai and ChatGPT.
 *
 * Feedback is kept on this device only, and says so.
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy, History, MessageSquarePlus, MoreHorizontal, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/lib/ui/notify";
import { cn } from "@/lib/utils";

type Feedback = "helpful" | "not_helpful" | null;

function stableMessageKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

const COARSE = "(pointer: coarse)";
function subscribeCoarse(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(COARSE);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}
function readCoarse() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(COARSE).matches;
}

/** True on touch-first devices; false while rendering on the server. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarse, readCoarse, () => false);
}

export type MessageMenuProps = {
  organizationId: string | null | undefined;
  instruction: string;
  /** The text "Copy" copies. */
  text: string;
  /** Pre-fills the composer with a review request (the owner still presses send). */
  onImprove: () => void;
  /** Opens History, where a change can be undone or restored. */
  onUndo?: (() => void) | undefined;
  onClear: () => void;
  /** Forces one layout (tests, previews); otherwise chosen by pointer type. */
  variant?: "touch" | "desktop";
};

export function MessageMenu({ organizationId, instruction, text, onImprove, onUndo, onClear, variant }: MessageMenuProps) {
  const coarse = useCoarsePointer();
  const touch = variant ? variant === "touch" : coarse;
  const storageKey = `revora.builder-feedback.${organizationId ?? "unknown"}.${stableMessageKey(`${instruction}\n${text}`)}`;
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      setFeedback(saved === "helpful" || saved === "not_helpful" ? saved : null);
    } catch {
      setFeedback(null);
    }
  }, [storageKey]);

  const choose = (next: Exclude<Feedback, null>) => {
    const value = feedback === next ? null : next;
    setFeedback(value);
    try {
      if (value) window.localStorage.setItem(storageKey, value);
      else window.localStorage.removeItem(storageKey);
    } catch {
      // Feedback is optional and must never interfere with website changes.
    }
    // Honest: nothing is sent anywhere yet.
    toast.success(value ? "Feedback saved on this device." : "Feedback removed.");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success("Response copied.");
    } catch {
      toast.error("Copy failed — press and hold the response to copy it.");
    }
  };

  if (touch) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Response actions"
            className="-ml-1.5 grid size-9 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuItem onSelect={() => void copy()}>
            <Copy aria-hidden /> Copy
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onImprove}>
            <MessageSquarePlus aria-hidden /> Ask Revora to improve this
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => choose("helpful")}>
            <ThumbsUp aria-hidden className={cn(feedback === "helpful" && "text-primary")} /> Helpful
            {feedback === "helpful" ? <Check className="ml-auto" aria-hidden /> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => choose("not_helpful")}>
            <ThumbsDown aria-hidden className={cn(feedback === "not_helpful" && "text-destructive")} /> Not helpful
            {feedback === "not_helpful" ? <Check className="ml-auto" aria-hidden /> : null}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {onUndo ? (
            <DropdownMenuItem onSelect={onUndo}>
              <History aria-hidden /> Undo or restore
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={onClear}>
            <Trash2 aria-hidden /> Clear from chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const icon = "relative inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
  const action = (label: string, onClick: () => void, child: ReactNode, extra?: { pressed?: boolean; className?: string }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          {...(extra?.pressed !== undefined ? { "aria-pressed": extra.pressed } : {})}
          onClick={onClick}
          className={cn(icon, extra?.className)}
        >
          {child}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="group"
        aria-label="Response actions"
        className="-ml-1.5 flex items-center gap-0.5 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/turn:opacity-100 [@media(hover:hover)]:focus-within:opacity-100"
      >
        {action("Copy response", () => void copy(), copied ? <Check className="size-4 text-primary" aria-hidden /> : <Copy className="size-4" aria-hidden />)}
        {action("Ask Revora to improve this", onImprove, <MessageSquarePlus className="size-4" aria-hidden />)}
        {action("Helpful", () => choose("helpful"), <ThumbsUp className="size-4" aria-hidden />, {
          pressed: feedback === "helpful",
          className: cn(feedback === "helpful" && "bg-primary/15 text-primary"),
        })}
        {action("Not helpful", () => choose("not_helpful"), <ThumbsDown className="size-4" aria-hidden />, {
          pressed: feedback === "not_helpful",
          className: cn(feedback === "not_helpful" && "bg-destructive/15 text-destructive"),
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="More actions" className={icon}>
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {onUndo ? (
              <DropdownMenuItem onSelect={onUndo}>
                <History aria-hidden /> Undo or restore
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={onClear}>
              <Trash2 aria-hidden /> Clear from chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}
