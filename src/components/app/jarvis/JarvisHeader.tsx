import { useState } from "react";
import { Download, MoreHorizontal, Radio, RefreshCw, Square, Trash2, Volume2, VolumeX, Wrench, MessagesSquare } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VoiceWave } from "@/components/app/VoiceWave";
import type { VoiceState } from "./LiveSurface";

/** What the header can truthfully say about the last diagnostics run. */
export type ChecksSummary = { tone: "ran" | "unavailable" | "unknown"; label: string };

type Props = {
  voiceState: VoiceState;
  level: number;
  status: string;
  checks: ChecksSummary;
  onOpenChecks: () => void;
  speaking: boolean;
  onStopSpeaking: () => void;
  live: boolean;
  onToggleLive: () => void;
  voice: boolean;
  onToggleVoice: () => void;
  refreshing: boolean;
  onRefreshDiagnostics: () => void;
  onExport: () => void;
  /** null until the screen width is known; false shows the Operations item (phones and tablets). */
  showOperationsItem: boolean;
  onOpenOperations: () => void;
  clearDisabled: boolean;
  onClear: () => void;
  onOpenConversations: () => void;
};

const dotTone = { ran: "bg-emerald-500", unavailable: "bg-destructive", unknown: "bg-muted-foreground/50" } as const;

/** One 56px row: identity and status, then Stop, Live, voice and an overflow menu. */
export function JarvisHeader(props: Props) {
  const { voiceState, level, status, checks, onOpenChecks, speaking, onStopSpeaking, live, onToggleLive, voice, onToggleVoice, refreshing, onRefreshDiagnostics, onExport, showOperationsItem, onOpenOperations, clearDisabled, onClear, onOpenConversations } = props;
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-3 sm:px-4">
      <Button type="button" variant="ghost" size="icon-sm" data-jarvis-tap="" aria-label="Conversations" onClick={onOpenConversations} className="size-9 shrink-0 rounded-full sm:size-9">
        <MessagesSquare className="size-4" aria-hidden />
      </Button>
      <LogoMark className="size-8 shrink-0" />
      <span className="hidden shrink-0 sm:inline-flex [&>span]:size-8"><VoiceWave state={voiceState} level={level} /></span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold leading-tight">Jarvis</h1>
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-xs text-muted-foreground">{status}</p>
          <button
            type="button"
            onClick={onOpenChecks}
            aria-label={`${checks.label}. Open diagnostics`}
            className="relative inline-flex shrink-0 items-center gap-1 rounded text-xs text-muted-foreground after:absolute after:-inset-x-1.5 after:-inset-y-3 after:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={`size-1.5 rounded-full ${dotTone[checks.tone]}`} aria-hidden />
            <span aria-hidden>{checks.label}</span>
          </button>
        </div>
      </div>
      {speaking ? (
        <Button type="button" variant="outline" size="sm" data-jarvis-tap="" aria-label="Stop speaking" onClick={onStopSpeaking} className="h-9 shrink-0 gap-1.5 rounded-full px-3 text-sm sm:h-9">
          <Square className="size-3.5 fill-current" aria-hidden />
          <span aria-hidden>Stop</span>
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        data-jarvis-tap=""
        aria-pressed={live}
        onClick={onToggleLive}
        className={`h-9 shrink-0 gap-1.5 rounded-full px-3 text-sm sm:min-h-9 ${live ? "bg-primary/15 text-primary ring-1 ring-primary/40 hover:bg-primary/20 hover:text-primary" : "text-foreground"}`}
      >
        <Radio className="size-4" aria-hidden />Live
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" data-jarvis-tap="" aria-label={voice ? "Mute replies" : "Speak replies"} aria-pressed={voice} onClick={onToggleVoice} className="size-9 shrink-0 rounded-full sm:size-9">
            {voice ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{voice ? "Replies are read aloud. Tap to mute." : "Replies are silent. Tap to read them aloud."}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" data-jarvis-tap="" aria-label="More Jarvis actions" className="size-9 shrink-0 rounded-full sm:size-9">
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem className="min-h-11" disabled={refreshing} onSelect={onRefreshDiagnostics}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} aria-hidden />Refresh diagnostics
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onSelect={onExport}>
            <Download aria-hidden />Export chat
          </DropdownMenuItem>
          {showOperationsItem ? (
            <DropdownMenuItem className="min-h-11 xl:hidden" aria-label="Open operations" onSelect={onOpenOperations}>
              <Wrench aria-hidden />Operations
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="min-h-11 text-destructive focus:bg-destructive/15 focus:text-destructive"
            disabled={clearDisabled}
            onSelect={() => setConfirmClear(true)}
          >
            <Trash2 aria-hidden />Clear my chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear your Jarvis chat?</AlertDialogTitle>
            <AlertDialogDescription>This deletes your whole Jarvis conversation, including replies from the Jarvis dock on other admin pages. It can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onClear}>Clear chat</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
