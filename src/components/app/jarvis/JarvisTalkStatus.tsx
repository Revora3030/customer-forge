import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { talkAnnouncement, type TalkState } from "@/components/app/jarvis-voice-gate";

type Props = {
  state: TalkState;
  /** True while Talk (Live) mode is on. */
  talkOn: boolean;
  /** An honest reason Talk can't run here (no speech recognition, mic blocked), or null. */
  notice: string | null;
  onDismissNotice: () => void;
};

/**
 * The one live region for Talk mode: it announces listening, thinking and
 * speaking, and any reason Talk can't run, so a screen reader hears one calm
 * message at a time. Always mounted, because a live region that appears
 * together with its text is often not announced. The visible state lives in
 * the Live panel; only a notice is drawn here, with a 44px dismiss control.
 */
export function JarvisTalkStatus({ state, talkOn, notice, onDismissNotice }: Props) {
  const message = notice ?? talkAnnouncement(state, talkOn);
  return (
    <div data-testid="jarvis-talk-status">
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </p>
      {notice ? (
        <div className="mb-2 flex items-start gap-2 rounded-2xl border border-border bg-card p-3">
          <p className="min-w-0 flex-1 py-2 text-sm text-foreground">{notice}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-jarvis-tap=""
            aria-label="Dismiss voice notice"
            onClick={onDismissNotice}
            className="size-11 min-h-11 min-w-11 shrink-0 rounded-full"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
