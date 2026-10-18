import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { testJarvisVoice, type JarvisVoiceStatus as VoiceStatus } from "@/lib/jarvis-voice.functions";
import { Button } from "@/components/ui/button";

/** The default one-line summary of the voice lookup. */
function voiceStatusLine(status: VoiceStatus): string {
  if (status.connected)
    return `Voice: ElevenLabs · ${status.voiceName}${status.customVoice ? "" : " (default voice; set ELEVENLABS_VOICE_ID for yours)"}`;
  if (status.code === "missing_permissions") return `Voice: unverified. ${status.reason}`;
  return `Voice: browser fallback. ${status.reason}`;
}

/**
 * The voice status line plus a "Test voice" button. The line comes from the
 * free voice lookup; only the button proves speech works end to end, because
 * it generates a real (short) ElevenLabs clip. It runs on click only, never on
 * mount or a poll, since it spends characters.
 */
export function JarvisVoiceStatus({ status, line }: { status: VoiceStatus | undefined; line?: string | undefined }) {
  const runTest = useServerFn(testJarvisVoice);
  const test = useMutation({ mutationFn: () => runTest() });
  const result = test.data;
  const text = line ?? (status ? voiceStatusLine(status) : null);

  return (
    <div className="space-y-1 text-[11px] text-muted-foreground" data-testid="jarvis-voice-status">
      <div className="flex flex-wrap items-center gap-2">
        {text ? (
          <p className="min-w-0 flex-1" role="status">
            {text}
          </p>
        ) : (
          <p className="min-w-0 flex-1">Voice: checking…</p>
        )}
        <Button type="button" size="sm" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? "Testing…" : "Test voice"}
        </Button>
      </div>
      {result ? (
        <p role="status" className={result.ok ? "" : "text-destructive"}>
          {result.ok
            ? `Voice test passed: ElevenLabs spoke in ${result.ms} ms (${Math.round(result.bytes / 1024)} KB).`
            : `Voice test failed: ${result.reason}`}
        </p>
      ) : test.error ? (
        <p role="status" className="text-destructive">
          Voice test failed: {test.error instanceof Error ? test.error.message : "the check couldn't run."}
        </p>
      ) : null}
    </div>
  );
}
