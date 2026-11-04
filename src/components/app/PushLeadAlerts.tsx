/**
 * Per-device Web Push alerts for new leads (speed-to-lead). Each owner turns
 * them on for the phone or computer they're using; nothing is stored about the
 * device beyond the browser's push endpoint and keys.
 */
import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, BellOff, Loader2 } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { applicationServerKey } from "@/lib/push/push-config";
import {
  deletePushSubscription,
  getPushPublicKey,
  savePushSubscription,
} from "@/lib/push/push.functions";

const PUSH_SW_URL = "/push-sw.js";
const PUSH_SW_SCOPE = "/app/__push/";

type State = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

async function pushRegistration() {
  const existing = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
  return existing ?? navigator.serviceWorker.register(PUSH_SW_URL, { scope: PUSH_SW_SCOPE });
}

export function PushLeadAlerts({ organizationId }: { organizationId: string | undefined }) {
  const publicKeyFn = useServerFn(getPushPublicKey);
  const saveFn = useServerFn(savePushSubscription);
  const deleteFn = useServerFn(deletePushSubscription);
  const [state, setState] = React.useState<State>("loading");
  const [publicKey, setPublicKey] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }
      const { publicKey: key } = await publicKeyFn();
      if (cancelled) return;
      if (!key) return setState("unconfigured");
      setPublicKey(key);
      if (Notification.permission === "denied") return setState("denied");
      const registration = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) setState(subscription ? "on" : "off");
    })().catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, [publicKeyFn]);

  async function turnOn() {
    if (!organizationId || !publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await pushRegistration();
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(publicKey) as BufferSource,
        }));
      await saveFn({
        data: {
          organizationId,
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
        },
      });
      setState("on");
      toast.success("Push alerts are on for this device.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!organizationId) return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await deleteFn({ data: { organizationId, endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setState("off");
      toast.success("Push alerts are off for this device.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  const status: Record<State, string> = {
    loading: "Checking this device…",
    unsupported:
      "This browser can't receive push alerts. On iPhone, add Revora to your Home Screen first (iOS 16.4+).",
    unconfigured: "Push alerts aren't set up on this server yet.",
    denied: "Notifications are blocked for Revora in this browser's settings.",
    off: "Get a phone or desktop notification the second a new lead lands.",
    on: "This device gets a notification for every new lead.",
  };

  return (
    <Panel className="space-y-4 p-5">
      <SectionHeading
        eyebrow="Speed to lead"
        title="Push alerts on this device"
        description="Leads contacted within 5 minutes convert far more often. Alerts carry no customer details."
        action={state === "on" ? <Pill tone="signal">On</Pill> : undefined}
      />
      <p className="text-[13px] text-muted-foreground">{status[state]}</p>
      {(state === "off" || state === "on") && (
        <Button
          type="button"
          variant={state === "on" ? "outline" : "default"}
          className="min-h-11"
          disabled={busy || !organizationId}
          onClick={() => void (state === "on" ? turnOff() : turnOn())}
        >
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : state === "on" ? (
            <BellOff className="mr-2 size-4" aria-hidden="true" />
          ) : (
            <BellRing className="mr-2 size-4" aria-hidden="true" />
          )}
          {state === "on" ? "Turn off on this device" : "Turn on push alerts"}
        </Button>
      )}
    </Panel>
  );
}
