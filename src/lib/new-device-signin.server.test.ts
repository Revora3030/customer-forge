import { describe, expect, it, vi } from "vitest";
import { reportSignInDevice } from "./new-device-signin.server";

vi.mock("@/lib/email-templates/send-email", () => ({
  sendTemplateEmail: vi.fn(async () => ({ id: "msg-1" })),
}));

import { sendTemplateEmail } from "@/lib/email-templates/send-email";

type Row = { device_hash: string; country: string };

function makeDb(state: {
  devices: Row[];
  lastAlertAt: string | null;
}) {
  return {
    from(table: string) {
      if (table === "owner_sign_in_devices") {
        return {
          select(_cols: string, opts?: { count?: string; head?: boolean }) {
            if (opts?.head) {
              return {
                eq() {
                  return Promise.resolve({ count: state.devices.length, error: null });
                },
              };
            }
            const filters: Record<string, string> = {};
            const api = {
              eq(col: string, val: string) {
                filters[col] = val;
                return api;
              },
              maybeSingle() {
                const row = state.devices.find(
                  (d) => d.device_hash === filters["device_hash"],
                );
                return Promise.resolve({ data: row ?? null, error: null });
              },
            };
            return api;
          },
          insert(row: Row & { user_id: string }) {
            state.devices.push({ device_hash: row.device_hash, country: row.country });
            return Promise.resolve({ error: null });
          },
          update(patch: { country?: string }) {
            return {
              eq(_c: string, _v: string) {
                return {
                  eq(c2: string, v2: string) {
                    const row = state.devices.find((d) => d.device_hash === v2);
                    if (row && patch.country) row.country = patch.country;
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "owner_sign_in_alert_state") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: state.lastAlertAt ? { last_alert_at: state.lastAlertAt } : null,
                      error: null,
                    });
                  },
                };
              },
            };
          },
          upsert(row: { last_alert_at: string }) {
            state.lastAlertAt = row.last_alert_at;
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("reportSignInDevice", () => {
  it("records the first device and never emails", async () => {
    const state = { devices: [] as Row[], lastAlertAt: null as string | null };
    const result = await reportSignInDevice({
      db: makeDb(state) as never,
      userId: "user-1",
      email: "owner@example.com",
      deviceId: "device-aaaaaaaa",
      countryHeader: "US",
      env: { REVORA_NEW_DEVICE_EMAIL: "1" },
    });
    expect(result).toEqual({ ok: true, emailed: false, reason: "first_device" });
    expect(state.devices).toHaveLength(1);
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it("emails on a second device when enabled", async () => {
    vi.mocked(sendTemplateEmail).mockClear();
    const state = {
      devices: [{ device_hash: "deadbeef".repeat(8), country: "US" }],
      lastAlertAt: null as string | null,
    };
    // Pre-seed with a real hash for a different device so count > 0
    const firstHash = (await import("./new-device-signin")).hashDeviceId;
    state.devices[0]!.device_hash = await firstHash("user-1", "other-device-xx");

    const result = await reportSignInDevice({
      db: makeDb(state) as never,
      userId: "user-1",
      email: "owner@example.com",
      deviceId: "device-bbbbbbbb",
      countryHeader: "GB",
      env: { REVORA_NEW_DEVICE_EMAIL: "1" },
    });
    expect(result).toEqual({ ok: true, emailed: true, reason: "new_device" });
    expect(sendTemplateEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendTemplateEmail).mock.calls[0]![0]).toBe("automation-message");
    expect(state.lastAlertAt).toBeTruthy();
  });

  it("stays silent when the flag is OFF even for a new device", async () => {
    vi.mocked(sendTemplateEmail).mockClear();
    const hash = await (await import("./new-device-signin")).hashDeviceId("user-1", "other-device-yy");
    const state = {
      devices: [{ device_hash: hash, country: "US" }],
      lastAlertAt: null as string | null,
    };
    const result = await reportSignInDevice({
      db: makeDb(state) as never,
      userId: "user-1",
      email: "owner@example.com",
      deviceId: "device-cccccccc",
      countryHeader: "US",
      env: {},
    });
    expect(result).toEqual({ ok: true, emailed: false, reason: "disabled" });
    expect(sendTemplateEmail).not.toHaveBeenCalled();
    expect(state.devices).toHaveLength(2);
  });
});
