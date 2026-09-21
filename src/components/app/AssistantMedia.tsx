import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { Film, ImagePlus, Loader2, Mic, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  builderMediaCapabilities,
  summarizeClipChapters,
  transcribeVoiceCommand,
} from "@/lib/site-agent.functions";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_LIMITS,
  MAX_ATTACHMENTS,
  attachmentKindOf,
  base64Bytes,
  type AgentAttachment,
} from "@/lib/site-agent";

const MB = 1024 * 1024;
const RECORD_LIMIT_SECONDS = 120;
const FOCUS =
  "cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob) {
  return readAsDataUrl(new File([blob], "voice", { type: blob.type }));
}

/**
 * Photos, video clips and voice for the website assistant.
 *
 * Files are turned into data URLs in the browser and sent with the next request
 * as context — the assistant reads them, and the owner still reviews every
 * change before it's written. Video clips are indexed into chapters on upload so
 * a moment can be referenced by timestamp. Voice is transcribed into the message
 * box so the owner can correct a mis-heard word before anything is planned.
 */
export function AssistantMedia({
  organizationId,
  attachments,
  onChange,
  onTranscript,
  onInsert,
  disabled,
}: {
  organizationId: string | undefined;
  attachments: AgentAttachment[];
  onChange: React.Dispatch<React.SetStateAction<AgentAttachment[]>>;
  onTranscript: (text: string) => void;
  onInsert?: (text: string) => void;
  disabled?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [indexing, setIndexing] = useState<string[]>([]);

  const mediaFn = useServerFn(builderMediaCapabilities);
  // Honest, server-owned answer: can a recording or photo actually be read?
  const media = useQuery({
    queryKey: ["builder-media-capabilities"],
    queryFn: () => mediaFn(),
    staleTime: 5 * 60 * 1000,
  });
  const canHear = media.data?.voice ?? false;
  const canSee = media.data?.vision ?? false;
  const mediaNote = media.data?.note ?? "";

  const transcribe = useServerFn(transcribeVoiceCommand);
  const chapterFn = useServerFn(summarizeClipChapters);

  const voice = useMutation({
    mutationFn: (attachment: AgentAttachment) =>
      transcribe({ data: { organizationId: organizationId!, audio: attachment } }),
    onSuccess: (result) => {
      if (result.text) onTranscript(result.text);
      else toast.error(result.message || "I couldn't hear anything in that recording.");
    },
    onError: (error: Error) =>
      toast.error(friendlyError(error, "Couldn't transcribe that recording.")),
  });

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (recording && seconds >= RECORD_LIMIT_SECONDS) recorder.current?.stop();
  }, [recording, seconds]);

  /** Indexes a clip in the background; a failure just means no chapters. */
  const indexClip = async (attachment: AgentAttachment) => {
    if (!organizationId || !canSee) return;
    setIndexing((prior) => [...prior, attachment.name]);
    try {
      const result = await chapterFn({ data: { organizationId, video: attachment } });
      if (result.chapters.length) {
        onChange((prior) =>
          prior.map((item) =>
            item.dataUrl === attachment.dataUrl ? { ...item, chapters: result.chapters } : item,
          ),
        );
      }
    } catch {
      toast.error(`Couldn't index ${attachment.name}. You can still send it as-is.`);
    } finally {
      setIndexing((prior) => prior.filter((name) => name !== attachment.name));
    }
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
      return;
    }
    const next: AgentAttachment[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      const kind = attachmentKindOf(file.type);
      if (!kind || kind === "audio") {
        toast.error(`${file.name} isn't a supported photo or video.`);
        continue;
      }
      if (file.size > ATTACHMENT_LIMITS[kind]) {
        toast.error(
          `${file.name} is too large. Keep ${kind === "image" ? "photos" : "clips"} under ${Math.round(
            ATTACHMENT_LIMITS[kind] / MB,
          )} MB.`,
        );
        continue;
      }
      try {
        const dataUrl = await readAsDataUrl(file);
        if (base64Bytes(dataUrl) > ATTACHMENT_LIMITS[kind]) continue;
        next.push({ kind, mimeType: file.type, name: file.name, dataUrl });
      } catch {
        toast.error(`Couldn't read ${file.name}.`);
      }
    }
    if (next.length) onChange((prior) => [...prior, ...next]);
    if (fileInput.current) fileInput.current.value = "";
    for (const attachment of next) if (attachment.kind === "video") void indexClip(attachment);
  };

  const startRecording = async () => {
    if (!canHear) {
      toast.error(
        mediaNote ||
          "Voice notes can't be listened to right now. Type your request and Revora will build it.",
      );
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("This browser can't record audio. Type your request instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType =
        ["audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
      const instance = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunks.current = [];
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      instance.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunks.current, { type: instance.mimeType || "audio/webm" });
        chunks.current = [];
        if (blob.size < 1200) {
          toast.error("That recording was too short. Hold on a moment while you speak.");
          return;
        }
        if (blob.size > ATTACHMENT_LIMITS.audio) {
          toast.error("That recording is too long. Keep voice commands under two minutes.");
          return;
        }
        const dataUrl = await blobToDataUrl(blob);
        voice.mutate({
          kind: "audio",
          mimeType: (blob.type || "audio/webm").split(";")[0] ?? "audio/webm",
          name: "voice command",
          dataUrl,
        });
      };
      recorder.current = instance;
      setSeconds(0);
      setRecording(true);
      instance.start();
    } catch {
      toast.error("Microphone access was blocked. Allow it in your browser to use voice.");
    }
  };

  const busy = disabled || !organizationId;

  return (
    <div className="space-y-2.5" role="group" aria-label="Photo, video and voice attachments">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          className="sr-only"
          id="assistant-media-input"
          aria-label="Choose photos or a video clip"
          onChange={(event) => void pickFiles(event.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || attachments.length >= MAX_ATTACHMENTS}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus className="size-4" aria-hidden="true" /> Add photo or video
        </Button>
        {recording ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => recorder.current?.stop()}
          >
            <Square className="size-4" aria-hidden="true" /> Stop recording ({seconds}s)
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || voice.isPending || !canHear}
            onClick={() => void startRecording()}
            title={canHear ? undefined : mediaNote || undefined}
          >
            {voice.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Mic className="size-4" aria-hidden="true" />
            )}
            {voice.isPending
              ? "Writing down what you said…"
              : canHear
                ? "Speak your request"
                : "Voice not available"}
          </Button>
        )}
        <span className="text-[11px] text-muted-foreground" aria-live="polite">
          {recording
            ? `Recording — say what you want changed, then press stop. ${seconds}s of ${RECORD_LIMIT_SECONDS}s.`
            : voice.isPending
              ? "Transcribing your voice request…"
              : mediaNote
                ? mediaNote
                : `Photos to ${Math.round(ATTACHMENT_LIMITS.image / MB)} MB, clips to ${Math.round(
                    ATTACHMENT_LIMITS.video / MB,
                  )} MB, up to ${MAX_ATTACHMENTS} per message.`}
        </span>
      </div>

      {attachments.length ? (
        <ul className="space-y-2">
          {attachments.map((attachment, index) => (
            <li
              key={`${attachment.name}-${index}`}
              className="rounded-md border border-border bg-elevated/60 p-2.5"
            >
              <div className="flex items-center gap-2">
                {attachment.kind === "image" ? (
                  <img
                    src={attachment.dataUrl}
                    alt=""
                    className="size-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded bg-surface">
                    <Film className="size-4 text-primary" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                  {attachment.name}
                </span>
                {indexing.includes(attachment.name) ? (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Indexing moments…
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={`Remove ${attachment.name}`}
                  className={`${FOCUS} p-1 text-muted-foreground transition-colors hover:text-foreground`}
                  onClick={() =>
                    onChange((prior) => prior.filter((_, position) => position !== index))
                  }
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>

              {attachment.chapters?.length ? (
                <div className="mt-2 border-t border-border pt-2">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Moments in this clip — click a timestamp to reference it
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {attachment.chapters.map((chapter) => (
                      <li key={`${chapter.at}-${chapter.label}`} className="text-[12px]">
                        <button
                          type="button"
                          className={`${FOCUS} text-left hover:underline`}
                          onClick={() =>
                            onInsert?.(`the moment at ${chapter.at} (${chapter.label})`)
                          }
                        >
                          <span className="font-mono text-primary">{chapter.at}</span>{" "}
                          <span className="font-medium">{chapter.label}</span>{" "}
                          <span className="text-muted-foreground">— {chapter.detail}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
